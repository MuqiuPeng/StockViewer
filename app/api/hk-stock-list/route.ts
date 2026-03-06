import { NextResponse } from 'next/server';
import { dataService, StockItem } from '@/lib/data-service-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/hk-stock-list
 *
 * Fetches the list of available Hong Kong stocks
 */
export async function GET() {
  try {
    // Fetch from Data Service
    const response = await dataService.getStockList('hk');

    if (!response.success || !response.data) {
      return NextResponse.json(
        {
          error: 'Failed to fetch HK stock list',
          message: response.error?.message || 'Unknown error'
        },
        { status: 502 }
      );
    }

    // Transform to standard format
    const stocks = response.data.items.map((item: StockItem) => ({
      code: item.code,
      name: item.name,
    }));

    // Sort by code
    stocks.sort((a, b) => a.code.localeCompare(b.code));

    return NextResponse.json({
      success: true,
      count: stocks.length,
      stocks
    });

  } catch (error) {
    console.error('Error fetching HK stock list:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch HK stock list',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
