/**
 * Individual Indicator API
 * GET /api/indicators/:id - Get indicator details
 * PUT /api/indicators/:id - Update indicator
 * DELETE /api/indicators/:id - Remove from collection or delete if owner
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { validatePythonCode } from '@/lib/indicator-validator';
import { detectDependencies } from '@/lib/detect-dependencies';

export const runtime = 'nodejs';

// GET /api/indicators/:id - Get indicator details
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

    const indicator = await prisma.indicator.findUnique({
      where: { id: params.id },
    });

    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    // Check access
    const isOwner = indicator.createdBy === userId;
    const isPublic = indicator.visibleTo.length === 0;
    const hasAccess = indicator.visibleTo.includes(userId);

    if (!isOwner && !isPublic && !hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      indicator: {
        ...indicator,
        createdAt: indicator.createdAt.toISOString(),
        updatedAt: indicator.updatedAt.toISOString(),
        isOwner,
      },
    });
  } catch (error) {
    console.error('Error getting indicator:', error);
    return NextResponse.json(
      { error: 'Failed to get indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/indicators/:id - Update indicator (only owner can update)
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

    const indicator = await prisma.indicator.findUnique({
      where: { id: params.id },
    });

    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    // Only owner can update
    if (indicator.createdBy !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the owner can update this indicator' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name, description, pythonCode, outputColumn,
      isGroup, groupName, expectedOutputs, externalDatasets,
      category, tags, visibleTo
    } = body;

    // Validate Python code if provided
    if (pythonCode) {
      const validation = validatePythonCode(pythonCode);
      if (!validation.valid) {
        return NextResponse.json(
          { error: 'Invalid Python code', message: validation.error },
          { status: 400 }
        );
      }
    }

    // Check for duplicate name if changing
    if (name && name !== indicator.name) {
      const existing = await prisma.indicator.findUnique({
        where: { name },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'Duplicate name', message: `Indicator with name "${name}" already exists` },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (pythonCode !== undefined) updateData.pythonCode = pythonCode;
    if (outputColumn !== undefined) updateData.outputColumn = outputColumn;
    if (isGroup !== undefined) updateData.isGroup = isGroup;
    if (groupName !== undefined) updateData.groupName = groupName;
    if (expectedOutputs !== undefined) {
      updateData.expectedOutputs = expectedOutputs.filter((o: string) => o.trim() !== '');
    }
    if (externalDatasets !== undefined) updateData.externalDatasets = externalDatasets;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = tags;
    if (visibleTo !== undefined) updateData.visibleTo = visibleTo;

    // Re-detect dependencies if code changed
    if (pythonCode !== undefined) {
      const allIndicators = await prisma.indicator.findMany({
        select: { id: true, name: true, outputColumn: true, isGroup: true, groupName: true, expectedOutputs: true },
      });
      const { dependencies, dependencyColumns } = detectDependencies(pythonCode, allIndicators, params.id);
      updateData.dependencies = dependencies;
      updateData.dependencyColumns = dependencyColumns;
    }

    const updated = await prisma.indicator.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      indicator: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        isOwner: true,
      },
    });
  } catch (error) {
    console.error('Error updating indicator:', error);
    return NextResponse.json(
      { error: 'Failed to update indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/indicators/:id - Remove from collection or delete if owner
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

    const url = new URL(request.url);
    const checkOnly = url.searchParams.get('checkOnly') === 'true';
    const cascade = url.searchParams.get('cascade') === 'true';

    const indicator = await prisma.indicator.findUnique({
      where: { id: params.id },
    });

    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    const isOwner = indicator.createdBy === userId;

    // Find dependent indicators
    const dependents = await prisma.indicator.findMany({
      where: {
        dependencies: { has: params.id },
      },
      select: { id: true, name: true },
    });

    // If checkOnly, return dependent info
    if (checkOnly) {
      return NextResponse.json({
        hasDependents: dependents.length > 0,
        dependents,
        isOwner,
      });
    }

    if (isOwner) {
      // Owner can delete the indicator entirely
      if (dependents.length > 0 && !cascade) {
        return NextResponse.json(
          {
            error: 'Indicator has dependents',
            message: `Cannot delete "${indicator.name}" because other indicators depend on it`,
            dependents,
          },
          { status: 400 }
        );
      }

      // Delete indicator (and dependents if cascade)
      if (cascade && dependents.length > 0) {
        // Delete all dependents first
        await prisma.indicator.deleteMany({
          where: { id: { in: dependents.map(d => d.id) } },
        });
      }

      await prisma.indicator.delete({
        where: { id: params.id },
      });

      return NextResponse.json({
        success: true,
        deleted: true,
        deletedCount: cascade ? dependents.length + 1 : 1,
      });
    } else {
      // Non-owner can only remove from their collection
      const deleted = await prisma.userIndicator.deleteMany({
        where: {
          userId,
          indicatorId: params.id,
        },
      });

      if (deleted.count === 0) {
        return NextResponse.json(
          { error: 'Indicator not in your collection' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        removed: true,
        message: `Removed "${indicator.name}" from your collection`,
      });
    }
  } catch (error) {
    console.error('Error deleting indicator:', error);
    return NextResponse.json(
      { error: 'Failed to delete indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
