import { NextResponse } from 'next/server';
import { dataService, StockItem } from '@/lib/data-service-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKETS = ['a_share', 'hk', 'us'] as const;
type Market = (typeof MARKETS)[number];

/**
 * GET /api/stock-list
 *
 * Lists the stocks of one market.
 *
 * Query parameters:
 *   - market: 'a_share' (default) | 'hk' | 'us'
 *   - source: 'active' (default) | 'all' (includes delisted)
 *
 * The market is validated rather than cast through. The bug this replaces
 * was the parameter being ignored altogether, so picking Hong Kong or US
 * quietly returned A-shares — wrong data presented as the right answer,
 * which nothing downstream could detect. Defaulting on an unrecognised
 * value would bring that back for any spelling we did not expect.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || 'active';
    const includeDelisted = source === 'all';

    const requested = (searchParams.get('market') || 'a_share') as Market;
    if (!MARKETS.includes(requested)) {
      return NextResponse.json(
        {
          error: 'Invalid market',
          message: `market must be one of: ${MARKETS.join(', ')}`,
          stocks: [],
        },
        { status: 400 }
      );
    }

    // Fetch from Data Service
    const response = await dataService.getStockList(requested, includeDelisted);

    if (!response.success || !response.data) {
      return NextResponse.json(
        {
          error: 'Failed to fetch stock list',
          message: response.error?.message || 'Unknown error',
          stocks: []
        },
        { status: 503 }
      );
    }

    // Transform to the expected format
    const stocks = response.data.items.map((item: StockItem) => ({
      code: item.code,
      name: item.name,
      status: item.status || 'active'
    }));

    // Sort by code
    stocks.sort((a, b) => a.code.localeCompare(b.code));

    return NextResponse.json({
      success: true,
      count: stocks.length,
      stocks
    });

  } catch (error) {
    console.error('Error fetching stock list:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch stock list',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
