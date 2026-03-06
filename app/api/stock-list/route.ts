import { NextResponse } from 'next/server';
import { dataService, StockItem } from '@/lib/data-service-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/stock-list
 *
 * Fetches the complete list of A-share stocks with their codes and names.
 *
 * Query parameters:
 *   - source: 'active' (default) | 'all' (includes delisted)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || 'active';
    const includeDelisted = source === 'all';

    // Fetch from Data Service
    const response = await dataService.getStockList('a_share', includeDelisted);

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
