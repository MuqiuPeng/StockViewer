import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import type { BacktestHistoryEntry } from '@/lib/backtest-history-storage';

// DELETE /api/backtest-history/[id] - Delete a backtest history entry
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<BacktestHistoryEntry>('backtestHistory');

    // Check if exists
    const existing = await store.getById(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    await store.delete(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete backtest history entry:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete backtest history entry',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// PATCH /api/backtest-history/[id] - Update backtest history entry metadata
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<BacktestHistoryEntry>('backtestHistory');

    const body = await request.json();
    const { starred, notes, tags } = body;

    // Check if exists
    const existing = await store.getById(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    const updates: Partial<BacktestHistoryEntry> = {};
    if (starred !== undefined) updates.starred = starred;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = tags;

    const updatedEntry = await store.update(params.id, updates);
    return NextResponse.json({ entry: updatedEntry });
  } catch (error) {
    console.error('Failed to update backtest history entry:', error);
    return NextResponse.json(
      {
        error: 'Failed to update backtest history entry',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
