/**
 * Backtest History API
 * GET /api/backtest-history - List backtest history entries
 */

import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import { getAllBacktestHistory } from '@/lib/backtest-history-storage';

export const runtime = 'nodejs';

// GET /api/backtest-history - List all backtest history entries
export async function GET(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { storage } = authResult;

    const { searchParams } = new URL(request.url);

    // Filters
    const strategyId = searchParams.get('strategyId');
    const starred = searchParams.get('starred');
    const tag = searchParams.get('tag');

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

    // Get all entries
    let entries = await getAllBacktestHistory(storage);

    // Apply filters
    if (strategyId) {
      entries = entries.filter(e => e.strategyId === strategyId);
    }

    if (starred === 'true') {
      entries = entries.filter(e => e.starred);
    } else if (starred === 'false') {
      entries = entries.filter(e => !e.starred);
    }

    if (tag) {
      entries = entries.filter(e => e.tags?.includes(tag));
    }

    // Calculate pagination
    const total = entries.length;
    const offset = (page - 1) * limit;
    const paginatedEntries = entries.slice(offset, offset + limit);

    // Return summary data (without full result for performance)
    const summaries = paginatedEntries.map(entry => ({
      id: entry.id,
      createdAt: entry.createdAt,
      strategyId: entry.strategyId,
      strategyName: entry.strategyName,
      strategyType: entry.strategyType,
      target: entry.target,
      parameters: {
        initialCash: entry.parameters.initialCash,
        commission: entry.parameters.commission,
        startDate: entry.parameters.startDate,
        endDate: entry.parameters.endDate,
      },
      summary: entry.summary,
      starred: entry.starred,
      notes: entry.notes,
      tags: entry.tags,
    }));

    // Get unique tags for filtering
    const allTags = new Set<string>();
    entries.forEach(e => e.tags?.forEach(t => allTags.add(t)));

    return NextResponse.json({
      entries: summaries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        tags: Array.from(allTags).sort(),
      },
    });
  } catch (error) {
    console.error('Error listing backtest history:', error);
    return NextResponse.json(
      {
        error: 'Failed to list backtest history',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
