/**
 * Team Members API
 * GET /api/teams/:id/members - Get members list
 * DELETE /api/teams/:id/members - Remove a member (owner only)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { LogSource } from '@prisma/client';

export const runtime = 'nodejs';

// GET /api/teams/:id/members - Get members list
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
        owner: { select: { id: true, name: true, email: true, image: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Check access
    const isOwner = team.ownerId === userId;
    const isMember = team.members.some(m => m.userId === userId);

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get pending invitations (only visible to owner)
    let pendingInvitations: any[] = [];
    if (isOwner) {
      const invitations = await prisma.teamInvitation.findMany({
        where: { teamId: params.id, status: 'pending' },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: 'desc' },
      });
      pendingInvitations = invitations.map(inv => ({
        id: inv.id,
        user: inv.user,
        status: inv.status,
        createdAt: inv.createdAt.toISOString(),
      }));
    }

    return NextResponse.json({
      owner: team.owner,
      members: team.members.map(m => ({
        ...m.user,
        joinedAt: m.joinedAt.toISOString(),
      })),
      pendingInvitations,
    });
  } catch (error) {
    console.error('Error getting group members:', error);
    return NextResponse.json(
      { error: 'Failed to get members', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/teams/:id/members - Remove a member (owner only)
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
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Only owner can remove members
    if (team.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the owner can remove members' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { memberId } = body;

    if (!memberId) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'memberId is required' },
        { status: 400 }
      );
    }

    // Cannot remove yourself (owner)
    if (memberId === userId) {
      return NextResponse.json(
        { error: 'Invalid operation', message: 'Owner cannot remove themselves. Transfer ownership first.' },
        { status: 400 }
      );
    }

    // Remove the member
    const deleted = await prisma.teamMember.deleteMany({
      where: {
        teamId: params.id,
        userId: memberId,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    logger.info(LogSource.API, 'remove_member', 'Removed member from team', { userId, metadata: { teamId: params.id, memberId } });

    return NextResponse.json({
      success: true,
      message: 'Member removed from group',
    });
  } catch (error) {
    logger.error(LogSource.API, 'remove_member', 'Failed to remove member', { error, metadata: { teamId: params.id } });
    console.error('Error removing member:', error);
    return NextResponse.json(
      { error: 'Failed to remove member', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
