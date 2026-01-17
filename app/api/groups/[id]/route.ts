/**
 * Individual Stock Group API
 * GET /api/groups/:id - Get group details
 * PUT /api/groups/:id - Update group
 * DELETE /api/groups/:id - Remove from collection or delete if owner
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/groups/:id - Get group details
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

    const group = await prisma.stockGroup.findUnique({
      where: { id: params.id },
    });

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check access
    const isOwner = group.createdBy === userId;
    const isPublic = group.visibleTo.length === 0;
    const hasAccess = group.visibleTo.includes(userId);

    if (!isOwner && !isPublic && !hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      group: {
        ...group,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
        isOwner,
      },
    });
  } catch (error) {
    console.error('Error getting group:', error);
    return NextResponse.json(
      { error: 'Failed to get group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/groups/:id - Update group (only owner can update)
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

    const group = await prisma.stockGroup.findUnique({
      where: { id: params.id },
    });

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check if this is a data source group (auto-generated, cannot be edited)
    if (group.isDataSource) {
      return NextResponse.json(
        { error: 'Cannot edit data source group', message: 'Data source groups are auto-generated and cannot be modified' },
        { status: 403 }
      );
    }

    // Only owner can update
    if (group.createdBy !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the owner can update this group' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, stockIds, visibleTo } = body;

    // Build update data
    const updateData: any = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json(
          { error: 'Invalid input', message: 'name must be a non-empty string' },
          { status: 400 }
        );
      }
      // Check for duplicate name
      if (name.trim() !== group.name) {
        const existing = await prisma.stockGroup.findUnique({
          where: { name: name.trim() },
        });
        if (existing) {
          return NextResponse.json(
            { error: 'Duplicate name', message: `Group with name "${name}" already exists` },
            { status: 400 }
          );
        }
      }
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }
    if (stockIds !== undefined) {
      if (!Array.isArray(stockIds)) {
        return NextResponse.json(
          { error: 'Invalid input', message: 'stockIds must be an array' },
          { status: 400 }
        );
      }
      updateData.stockIds = stockIds;
    }
    if (visibleTo !== undefined) {
      updateData.visibleTo = visibleTo;
    }

    const updated = await prisma.stockGroup.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      group: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        isOwner: true,
      },
    });
  } catch (error) {
    console.error('Error updating group:', error);
    return NextResponse.json(
      { error: 'Failed to update group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/groups/:id - Remove from collection or delete if owner
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

    const group = await prisma.stockGroup.findUnique({
      where: { id: params.id },
    });

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check if this is a data source group (auto-generated, cannot be deleted)
    if (group.isDataSource) {
      return NextResponse.json(
        { error: 'Cannot delete data source group', message: 'Data source groups are auto-generated and cannot be deleted' },
        { status: 403 }
      );
    }

    const isOwner = group.createdBy === userId;

    if (isOwner) {
      // Owner can delete the group entirely
      await prisma.stockGroup.delete({
        where: { id: params.id },
      });

      return NextResponse.json({
        success: true,
        deleted: true,
        message: `Deleted group "${group.name}"`,
      });
    } else {
      // Non-owner can only remove from their collection
      const deleted = await prisma.userStockGroup.deleteMany({
        where: { userId, groupId: params.id },
      });

      if (deleted.count === 0) {
        return NextResponse.json(
          { error: 'Group not in your collection' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        removed: true,
        message: `Removed "${group.name}" from your collection`,
      });
    }
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json(
      { error: 'Failed to delete group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
