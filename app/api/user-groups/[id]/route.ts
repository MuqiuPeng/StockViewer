/**
 * Individual User Group API
 * GET /api/user-groups/:id - Get group details
 * PUT /api/user-groups/:id - Update group (owner only)
 * DELETE /api/user-groups/:id - Delete/dissolve group (owner only) or leave group (member)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/user-groups/:id - Get group details
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

    const group = await prisma.userGroup.findUnique({
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

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check access - user must be owner or member
    const isOwner = group.ownerId === userId;
    const isMember = group.members.some(m => m.userId === userId);

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        isOwner,
        owner: group.owner,
        memberCount: group._count.members,
        messageCount: group._count.messages,
        members: group.members.map(m => ({
          ...m.user,
          joinedAt: m.joinedAt.toISOString(),
        })),
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting user group:', error);
    return NextResponse.json(
      { error: 'Failed to get group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/user-groups/:id - Update group (owner only)
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

    const group = await prisma.userGroup.findUnique({
      where: { id: params.id },
    });

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Only owner can update
    if (group.ownerId !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the owner can update the group' },
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

    const updated = await prisma.userGroup.update({
      where: { id: params.id },
      data: updateData,
      include: {
        owner: { select: { id: true, name: true, image: true } },
      },
    });

    return NextResponse.json({
      success: true,
      group: {
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
    console.error('Error updating user group:', error);
    return NextResponse.json(
      { error: 'Failed to update group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/user-groups/:id - Delete group (owner) or leave group (member)
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

    const group = await prisma.userGroup.findUnique({
      where: { id: params.id },
      include: {
        members: true,
      },
    });

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    const isOwner = group.ownerId === userId;
    const isMember = group.members.some(m => m.userId === userId);

    if (isOwner) {
      // Owner deletes/dissolves the entire group
      await prisma.userGroup.delete({
        where: { id: params.id },
      });

      return NextResponse.json({
        success: true,
        deleted: true,
        message: `Group "${group.name}" has been dissolved`,
      });
    } else if (isMember) {
      // Member leaves the group
      await prisma.userGroupMember.deleteMany({
        where: {
          groupId: params.id,
          userId,
        },
      });

      return NextResponse.json({
        success: true,
        left: true,
        message: `You have left "${group.name}"`,
      });
    } else {
      return NextResponse.json(
        { error: 'Access denied', message: 'You are not a member of this group' },
        { status: 403 }
      );
    }
  } catch (error) {
    console.error('Error deleting user group:', error);
    return NextResponse.json(
      { error: 'Failed to process request', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
