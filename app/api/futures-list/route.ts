import { NextResponse } from 'next/server';
import { dataService, FuturesItem } from '@/lib/data-service-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/futures-list
 *
 * Fetches the list of available futures contracts
 */
export async function GET() {
  try {
    // Fetch from Data Service
    const response = await dataService.getFuturesList();

    if (!response.success || !response.data) {
      return NextResponse.json(
        {
          error: 'Failed to fetch futures list',
          message: response.error?.message || 'Unknown error'
        },
        { status: 502 }
      );
    }

    // Transform to standard format
    const futures = response.data.items.map((item: FuturesItem) => ({
      code: item.code,
      name: item.name,
      exchange: item.exchange || ''
    }));

    // Group by exchange for better organization
    const byExchange: Record<string, typeof futures> = {};
    futures.forEach(item => {
      const ex = item.exchange || 'unknown';
      if (!byExchange[ex]) {
        byExchange[ex] = [];
      }
      byExchange[ex].push(item);
    });

    return NextResponse.json({
      success: true,
      count: futures.length,
      futures,
      byExchange
    });

  } catch (error) {
    console.error('Error fetching futures list:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch futures list',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
