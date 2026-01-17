/**
 * View Settings API
 * GET /api/view-settings - List user's view setting collection
 * POST /api/view-settings - Create new view setting
 * PUT /api/view-settings - Update a view setting
 * DELETE /api/view-settings - Delete a view setting
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/view-settings - List user's view setting collection
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Get user's view setting collection with details
    const userViewSettings = await prisma.userViewSetting.findMany({
      where: { userId },
      include: { viewSetting: true },
      orderBy: { viewSetting: { name: 'asc' } },
    });

    // Transform to expected format
    const settings = userViewSettings.map(uvs => ({
      id: uvs.viewSetting.id,
      name: uvs.viewSetting.name,
      enabledIndicators1: uvs.viewSetting.enabledIndicators1,
      enabledIndicators2: uvs.viewSetting.enabledIndicators2,
      constantLines1: uvs.viewSetting.constantLines1,
      constantLines2: uvs.viewSetting.constantLines2,
      createdAt: uvs.viewSetting.createdAt.toISOString(),
      updatedAt: uvs.viewSetting.updatedAt.toISOString(),
      isOwner: uvs.viewSetting.createdBy === userId,
      visibleTo: uvs.viewSetting.visibleTo,
    }));

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error loading view settings:', error);
    return NextResponse.json(
      { error: 'Failed to load view settings', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/view-settings - Create new view setting
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { name, enabledIndicators1, enabledIndicators2, constantLines1, constantLines2, visibleTo } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'Name is required' },
        { status: 400 }
      );
    }

    // Check for duplicate names (globally unique)
    const existing = await prisma.viewSetting.findUnique({
      where: { name: name.trim() },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Duplicate name', message: `View setting with name "${name}" already exists` },
        { status: 400 }
      );
    }

    // Create view setting
    const setting = await prisma.viewSetting.create({
      data: {
        createdBy: userId,
        visibleTo: visibleTo || [], // Empty = public by default
        name: name.trim(),
        enabledIndicators1: enabledIndicators1 || [],
        enabledIndicators2: enabledIndicators2 || [],
        constantLines1: constantLines1 || [],
        constantLines2: constantLines2 || [],
      },
    });

    // Add to user's collection
    await prisma.userViewSetting.create({
      data: { userId, viewSettingId: setting.id },
    });

    return NextResponse.json({
      success: true,
      setting: {
        ...setting,
        createdAt: setting.createdAt.toISOString(),
        updatedAt: setting.updatedAt.toISOString(),
        isOwner: true,
      },
    });
  } catch (error) {
    console.error('Error creating view setting:', error);
    return NextResponse.json(
      { error: 'Failed to create view setting', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/view-settings - Update a view setting (only owner can update)
export async function PUT(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { id, name, enabledIndicators1, enabledIndicators2, constantLines1, constantLines2, visibleTo } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'ID is required' },
        { status: 400 }
      );
    }

    const setting = await prisma.viewSetting.findUnique({
      where: { id },
    });

    if (!setting) {
      return NextResponse.json(
        { error: 'View setting not found' },
        { status: 404 }
      );
    }

    // Only owner can update
    if (setting.createdBy !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the owner can update this view setting' },
        { status: 403 }
      );
    }

    // Check for duplicate name if changing
    if (name !== undefined && name.trim() !== setting.name) {
      const existing = await prisma.viewSetting.findUnique({
        where: { name: name.trim() },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'Duplicate name', message: `View setting with name "${name}" already exists` },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (enabledIndicators1 !== undefined) updateData.enabledIndicators1 = enabledIndicators1;
    if (enabledIndicators2 !== undefined) updateData.enabledIndicators2 = enabledIndicators2;
    if (constantLines1 !== undefined) updateData.constantLines1 = constantLines1;
    if (constantLines2 !== undefined) updateData.constantLines2 = constantLines2;
    if (visibleTo !== undefined) updateData.visibleTo = visibleTo;

    const updated = await prisma.viewSetting.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      setting: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        isOwner: true,
      },
    });
  } catch (error) {
    console.error('Error updating view setting:', error);
    return NextResponse.json(
      { error: 'Failed to update view setting', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/view-settings - Remove from collection or delete if owner
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
        { error: 'Invalid input', message: 'ID is required' },
        { status: 400 }
      );
    }

    const setting = await prisma.viewSetting.findUnique({
      where: { id },
    });

    if (!setting) {
      return NextResponse.json(
        { error: 'View setting not found' },
        { status: 404 }
      );
    }

    const isOwner = setting.createdBy === userId;

    if (isOwner) {
      // Owner can delete the view setting entirely
      await prisma.viewSetting.delete({
        where: { id },
      });

      return NextResponse.json({
        success: true,
        deleted: true,
        message: `Deleted view setting "${setting.name}"`,
      });
    } else {
      // Non-owner can only remove from their collection
      const deleted = await prisma.userViewSetting.deleteMany({
        where: { userId, viewSettingId: id },
      });

      if (deleted.count === 0) {
        return NextResponse.json(
          { error: 'View setting not in your collection' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        removed: true,
        message: `Removed "${setting.name}" from your collection`,
      });
    }
  } catch (error) {
    console.error('Error deleting view setting:', error);
    return NextResponse.json(
      { error: 'Failed to delete view setting', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
