import { NextResponse } from 'next/server';
import { getAllBacktestHistory } from '@/lib/backtest-history-storage';

// GET /api/backtest-history - Get all backtest history entries with optional filtering
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const starred = searchParams.get('starred');
    const strategyId = searchParams.get('strategyId');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);

    let entries = await getAllBacktestHistory();

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
