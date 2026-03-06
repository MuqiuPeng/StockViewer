/**
 * Individual Team API
 * GET /api/teams/:id - Get team details
 * PUT /api/teams/:id - Update team (owner only)
 * DELETE /api/teams/:id - Delete/dissolve group (owner only) or leave team (member)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/teams/:id - Get team details
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const team = await prisma.team.findUnique({
      where: { id: params.id },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        members: {
          include: { user: { select: { id: true, name: true, image: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { members: true, messages: true } },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Check access - user must be owner or member
    const isOwner = team.ownerId === userId;
    const isMember = team.members.some(m => m.userId === userId);

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        isOwner,
        owner: team.owner,
        memberCount: team._count.members,
        messageCount: team._count.messages,
        members: team.members.map(m => ({
          ...m.user,
          joinedAt: m.joinedAt.toISOString(),
        })),
        createdAt: team.createdAt.toISOString(),
        updatedAt: team.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting user team:', error);
    return NextResponse.json(
      { error: 'Failed to get team', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/teams/:id - Update team (owner only)
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const team = await prisma.team.findUnique({
      where: { id: params.id },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Only owner can update
    if (team.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the owner can update the team' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description } = body;

    // Build update data
    const updateData: any = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json(
          { error: 'Invalid input', message: 'name must be a non-empty string' },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    const updated = await prisma.team.update({
      where: { id: params.id },
      data: updateData,
      include: {
        owner: { select: { id: true, name: true, image: true } },
      },
    });

    return NextResponse.json({
      success: true,
      team: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isOwner: true,
        owner: updated.owner,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating user team:', error);
    return NextResponse.json(
      { error: 'Failed to update team', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/teams/:id - Delete team (owner) or leave team (member)
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const team = await prisma.team.findUnique({
      where: { id: params.id },
      include: {
        members: true,
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    const isOwner = team.ownerId === userId;
    const isMember = team.members.some(m => m.userId === userId);

    if (isOwner) {
      // Owner deletes/dissolves the entire group
      await prisma.team.delete({
        where: { id: params.id },
      });

      return NextResponse.json({
        success: true,
        deleted: true,
        message: `Team "${team.name}" has been dissolved`,
      });
    } else if (isMember) {
      // Member leaves the team
      await prisma.teamMember.deleteMany({
        where: {
          teamId: params.id,
          userId,
        },
      });

      return NextResponse.json({
        success: true,
        left: true,
        message: `You have left "${team.name}"`,
      });
    } else {
      return NextResponse.json(
        { error: 'Access denied', message: 'You are not a member of this team' },
        { status: 403 }
      );
    }
  } catch (error) {
    console.error('Error deleting user team:', error);
    return NextResponse.json(
      { error: 'Failed to process request', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
