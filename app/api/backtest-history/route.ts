import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import type { BacktestHistoryEntry } from '@/lib/backtest-history-storage';

// GET /api/backtest-history - Get all backtest history entries with optional filtering
export async function GET(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const { searchParams } = new URL(request.url);
    const starred = searchParams.get('starred');
    const strategyId = searchParams.get('strategyId');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);

    let entries = await authResult.storage.getJsonStore<BacktestHistoryEntry>('backtestHistory').getAll();

    // Sort by createdAt descending
    entries = entries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply filters
    if (starred === 'true') {
      entries = entries.filter(e => e.starred);
    }

    if (strategyId) {
      entries = entries.filter(e => e.strategyId === strategyId);
    }

    if (tags && tags.length > 0) {
      entries = entries.filter(e =>
        e.tags?.some(t => tags.includes(t))
      );
    }

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Failed to get backtest history:', error);
    return NextResponse.json(
      {
        error: 'Failed to get backtest history',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
