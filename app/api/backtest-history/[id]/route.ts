/**
 * Individual Backtest History Entry API
 * GET /api/backtest-history/:id - Get full backtest entry with results
 * PUT /api/backtest-history/:id - Update entry (starred, notes, tags)
 * DELETE /api/backtest-history/:id - Delete entry
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/backtest-history/:id - Get full entry with results
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

    const entry = await prisma.backtestHistoryEntry.findFirst({
      where: {
        id: params.id,
        userId,  // Ensure user can only access their own entries
      },
    });

    if (!entry) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      entry: {
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting backtest history entry:', error);
    return NextResponse.json(
      { error: 'Failed to get backtest history entry', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/backtest-history/:id - Update entry
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

    const body = await request.json();
    const { starred, notes, tags } = body;

    // Check if entry exists and belongs to user
    const existing = await prisma.backtestHistoryEntry.findFirst({
      where: {
        id: params.id,
        userId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    // Build updates
    const updateData: any = {};
    if (starred !== undefined) updateData.starred = starred;
    if (notes !== undefined) updateData.notes = notes;
    if (tags !== undefined) updateData.tags = tags;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      );
    }

    const entry = await prisma.backtestHistoryEntry.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: entry.id,
        starred: entry.starred,
        notes: entry.notes,
        tags: entry.tags,
      },
    });
  } catch (error) {
    console.error('Error updating backtest history entry:', error);
    return NextResponse.json(
      { error: 'Failed to update backtest history entry', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/backtest-history/:id - Delete entry
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

    // Check if entry exists and belongs to user
    const existing = await prisma.backtestHistoryEntry.findFirst({
      where: {
        id: params.id,
        userId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    await prisma.backtestHistoryEntry.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Backtest history entry deleted',
    });
  } catch (error) {
    console.error('Error deleting backtest history entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete backtest history entry', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
