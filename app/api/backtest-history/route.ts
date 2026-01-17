/**
 * Backtest History API
 * GET /api/backtest-history - List backtest history entries for user
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/backtest-history - List all backtest history entries for user
export async function GET(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);

    // Filters
    const strategyId = searchParams.get('strategyId');
    const starred = searchParams.get('starred');
    const tag = searchParams.get('tag');

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = { userId };

    if (strategyId) {
      where.strategyId = strategyId;
    }

    if (starred === 'true') {
      where.starred = true;
    } else if (starred === 'false') {
      where.starred = false;
    }

    if (tag) {
      where.tags = { has: tag };
    }

    // Get total count
    const total = await prisma.backtestHistoryEntry.count({ where });

    // Get paginated entries
    const entries = await prisma.backtestHistoryEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    // Return summary data (without full result for performance)
    const summaries = entries.map(entry => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      strategyId: entry.strategyId,
      strategyName: entry.strategyName,
      strategyType: entry.strategyType,
      target: entry.target,
      parameters: entry.parameters,
      summary: {
        totalReturn: entry.totalReturn,
        totalReturnPct: entry.totalReturnPct,
        sharpeRatio: entry.sharpeRatio,
        tradeCount: entry.tradeCount,
        duration: entry.duration,
      },
      starred: entry.starred,
      notes: entry.notes,
      tags: entry.tags,
    }));

    // Get unique tags for filtering
    const allEntries = await prisma.backtestHistoryEntry.findMany({
      where: { userId },
      select: { tags: true },
    });
    const allTags = new Set<string>();
    allEntries.forEach(e => e.tags?.forEach(t => allTags.add(t)));

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
      { error: 'Failed to list backtest history', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
