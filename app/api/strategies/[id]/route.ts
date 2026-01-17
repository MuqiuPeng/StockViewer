/**
 * Individual Strategy API
 * GET /api/strategies/:id - Get strategy details
 * PUT /api/strategies/:id - Update strategy
 * DELETE /api/strategies/:id - Remove from collection or delete if owner
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/strategies/:id - Get strategy details
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

    const strategy = await prisma.strategy.findUnique({
      where: { id: params.id },
    });

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Check access
    const isOwner = strategy.createdBy === userId;
    const isPublic = strategy.visibleTo.length === 0;
    const hasAccess = strategy.visibleTo.includes(userId);

    if (!isOwner && !isPublic && !hasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      strategy: {
        ...strategy,
        createdAt: strategy.createdAt.toISOString(),
        updatedAt: strategy.updatedAt.toISOString(),
        isOwner,
      },
    });
  } catch (error) {
    console.error('Error getting strategy:', error);
    return NextResponse.json(
      { error: 'Failed to get strategy', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/strategies/:id - Update strategy (only owner can update)
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

    const strategy = await prisma.strategy.findUnique({
      where: { id: params.id },
    });

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Only owner can update
    if (strategy.createdBy !== userId) {
      return NextResponse.json(
        { error: 'Permission denied', message: 'Only the owner can update this strategy' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, pythonCode, parameters, constraints, externalDatasets, visibleTo } = body;

    // Validate Python code if provided
    if (pythonCode) {
      if (!pythonCode.includes('def calculate')) {
        return NextResponse.json(
          { error: 'Invalid Python code', message: 'Strategy code must define a calculate(data, parameters) function' },
          { status: 400 }
        );
      }

      // Validate portfolio strategy code format
      if (strategy.strategyType === 'portfolio' && !pythonCode.includes('data_map')) {
        return NextResponse.json(
          { error: 'Invalid portfolio strategy', message: 'Portfolio strategies must accept data_map parameter (not data)' },
          { status: 400 }
        );
      }
    }

    // Check for duplicate name if changing
    if (name && name !== strategy.name) {
      const existing = await prisma.strategy.findUnique({
        where: { name },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'Duplicate name', message: `Strategy with name "${name}" already exists` },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (pythonCode !== undefined) updateData.pythonCode = pythonCode;
    if (parameters !== undefined) updateData.parameters = parameters;
    if (externalDatasets !== undefined) updateData.externalDatasets = externalDatasets;
    if (visibleTo !== undefined) updateData.visibleTo = visibleTo;

    // Allow updating constraints for portfolio strategies
    if (constraints !== undefined && strategy.strategyType === 'portfolio') {
      updateData.constraints = constraints;
    }

    const updated = await prisma.strategy.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      strategy: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        isOwner: true,
      },
    });
  } catch (error) {
    console.error('Error updating strategy:', error);
    return NextResponse.json(
      { error: 'Failed to update strategy', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/strategies/:id - Remove from collection or delete if owner
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

    const strategy = await prisma.strategy.findUnique({
      where: { id: params.id },
    });

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    const isOwner = strategy.createdBy === userId;

    if (isOwner) {
      // Owner can delete the strategy entirely
      await prisma.strategy.delete({
        where: { id: params.id },
      });

      return NextResponse.json({
        success: true,
        deleted: true,
        message: `Deleted strategy "${strategy.name}"`,
      });
    } else {
      // Non-owner can only remove from their collection
      const deleted = await prisma.userStrategy.deleteMany({
        where: {
          userId,
          strategyId: params.id,
        },
      });

      if (deleted.count === 0) {
        return NextResponse.json(
          { error: 'Strategy not in your collection' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        removed: true,
        message: `Removed "${strategy.name}" from your collection`,
      });
    }
  } catch (error) {
    console.error('Error deleting strategy:', error);
    return NextResponse.json(
      { error: 'Failed to delete strategy', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
