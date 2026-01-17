/**
 * Individual Backtest History Entry API
 * GET /api/backtest-history/:id - Get full backtest entry with results
 * PUT /api/backtest-history/:id - Update entry (starred, notes, tags)
 * DELETE /api/backtest-history/:id - Delete entry
 */

import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import {
  getBacktestHistoryById,
  updateBacktestHistoryEntry,
  deleteBacktestHistoryEntry,
} from '@/lib/backtest-history-storage';

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
    const { storage } = authResult;

    const entry = await getBacktestHistoryById(params.id, storage);

    if (!entry) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('Error getting backtest history entry:', error);
    return NextResponse.json(
      {
        error: 'Failed to get backtest history entry',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
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
    const { storage } = authResult;

    const body = await request.json();
    const { starred, notes, tags } = body;

    // Check if entry exists
    const existing = await getBacktestHistoryById(params.id, storage);
    if (!existing) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    // Build updates
    const updates: any = {};
    if (starred !== undefined) updates.starred = starred;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = tags;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid updates provided' },
        { status: 400 }
      );
    }

    const entry = await updateBacktestHistoryEntry(params.id, updates, storage);

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
      {
        error: 'Failed to update backtest history entry',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
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
    const { storage } = authResult;

    // Check if entry exists
    const existing = await getBacktestHistoryById(params.id, storage);
    if (!existing) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    await deleteBacktestHistoryEntry(params.id, storage);

    return NextResponse.json({
      success: true,
      message: 'Backtest history entry deleted',
    });
  } catch (error) {
    console.error('Error deleting backtest history entry:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete backtest history entry',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
