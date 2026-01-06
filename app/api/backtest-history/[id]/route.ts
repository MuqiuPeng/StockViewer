import { NextResponse } from 'next/server';
import {
  getBacktestHistoryById,
  updateBacktestHistoryEntry,
  deleteBacktestHistoryEntry,
  BacktestHistoryEntry,
} from '@/lib/backtest-history-storage';

// DELETE /api/backtest-history/[id] - Delete a backtest history entry
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await deleteBacktestHistoryEntry(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete backtest history entry:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete backtest history entry',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: error instanceof Error && error.message.includes('not found') ? 404 : 500 }
    );
  }
}

// PATCH /api/backtest-history/[id] - Update backtest history entry metadata
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { starred, notes, tags } = body;

    const updates: Partial<BacktestHistoryEntry> = {};
    if (starred !== undefined) updates.starred = starred;
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = tags;

    const updatedEntry = await updateBacktestHistoryEntry(params.id, updates);
    return NextResponse.json({ entry: updatedEntry });
  } catch (error) {
    console.error('Failed to update backtest history entry:', error);
    return NextResponse.json(
      {
        error: 'Failed to update backtest history entry',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: error instanceof Error && error.message.includes('not found') ? 404 : 500 }
    );
  }
}
