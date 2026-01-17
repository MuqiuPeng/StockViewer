/**
 * Stock Groups API
 * GET /api/groups - List user's group collection
 * POST /api/groups - Create new group
 * PUT /api/groups - Update a group (legacy, prefer /api/groups/[id])
 * DELETE /api/groups - Delete a group (legacy, prefer /api/groups/[id])
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// Helper function to sync data source groups
async function syncDataSourceGroups(userId: string): Promise<void> {
  // Get all stocks from user's collection
  const userStocks = await prisma.userStock.findMany({
    where: { userId },
    include: { stock: true },
  });

  // Get all data source groups (system-generated)
  const dataSourceGroups = await prisma.stockGroup.findMany({
    where: { isDataSource: true },
  });

  // Get unique data sources from user's stocks
  const dataSources = new Set<string>();
  for (const us of userStocks) {
    if (us.stock.dataSource) {
      dataSources.add(us.stock.dataSource);
    }
  }

  // Create/update data source groups for this user
  for (const dataSource of dataSources) {
    const stockIds = userStocks
      .filter(us => us.stock.dataSource === dataSource)
      .map(us => us.stock.id);

    const existingGroup = dataSourceGroups.find(
      g => g.dataSourceName === dataSource
    );

    if (existingGroup) {
      // Update if stocks changed
      if (JSON.stringify(existingGroup.stockIds.sort()) !== JSON.stringify(stockIds.sort())) {
        await prisma.stockGroup.update({
          where: { id: existingGroup.id },
          data: { stockIds },
        });
      }
      // Ensure user has this group in their collection
      await prisma.userStockGroup.upsert({
        where: { userId_groupId: { userId, groupId: existingGroup.id } },
        create: { userId, groupId: existingGroup.id },
        update: {},
      });
    } else {
      // Create new data source group
      const group = await prisma.stockGroup.create({
        data: {
          createdBy: userId,
          visibleTo: [], // Public
          name: `[${dataSource}]`,
          description: `Auto-generated group for ${dataSource} data source`,
          stockIds,
          isDataSource: true,
          dataSourceName: dataSource,
        },
      });
      // Add to user's collection
      await prisma.userStockGroup.create({
        data: { userId, groupId: group.id },
      });
    }
  }
}

// GET /api/groups - List user's group collection
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Sync data source groups before returning
    await syncDataSourceGroups(userId);

    // Get user's group collection with group details
    const userGroups = await prisma.userStockGroup.findMany({
      where: { userId },
      include: { group: true },
      orderBy: { group: { name: 'asc' } },
    });

    // Transform to expected format
    const groups = userGroups.map(ug => ({
      id: ug.group.id,
      name: ug.group.name,
      description: ug.group.description,
      stockIds: ug.group.stockIds,
      isDataSource: ug.group.isDataSource,
      dataSourceName: ug.group.dataSourceName,
      createdAt: ug.group.createdAt.toISOString(),
      updatedAt: ug.group.updatedAt.toISOString(),
      isOwner: ug.group.createdBy === userId,
      visibleTo: ug.group.visibleTo,
    }));

    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Error loading groups:', error);
    return NextResponse.json(
      { error: 'Failed to load groups', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/groups - Create a new group
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { name, description, stockIds, visibleTo } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Invalid input', message: 'name is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Check for duplicate names (globally unique)
    const existing = await prisma.stockGroup.findUnique({
      where: { name: name.trim() },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Duplicate name', message: `Group with name "${name}" already exists` },
        { status: 400 }
      );
    }

    // Create group
    const group = await prisma.stockGroup.create({
      data: {
        createdBy: userId,
        visibleTo: visibleTo || [], // Empty = public by default
        name: name.trim(),
        description: description?.trim() || null,
        stockIds: Array.isArray(stockIds) ? stockIds : [],
        isDataSource: false,
        dataSourceName: null,
      },
    });

    // Add to user's collection
    await prisma.userStockGroup.create({
      data: { userId, groupId: group.id },
    });

    return NextResponse.json({
      success: true,
      group: {
        ...group,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
        isOwner: true,
      },
    });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json(
      { error: 'Failed to create group', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/groups - Update a group (legacy endpoint, prefer /api/groups/[id])
export async function PUT(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { id, name, description, stockIds, visibleTo } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'id is required' },
        { status: 400 }
      );
    }

    const group = await prisma.stockGroup.findUnique({
      where: { id },
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
      where: { id },
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

// DELETE /api/groups - Delete a group (legacy endpoint, prefer /api/groups/[id])
export async function DELETE(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'id is required' },
        { status: 400 }
      );
    }

    const group = await prisma.stockGroup.findUnique({
      where: { id },
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
        where: { id },
      });

      return NextResponse.json({
        success: true,
        deleted: true,
        message: `Deleted group "${group.name}"`,
      });
    } else {
      // Non-owner can only remove from their collection
      const deleted = await prisma.userStockGroup.deleteMany({
        where: { userId, groupId: id },
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
