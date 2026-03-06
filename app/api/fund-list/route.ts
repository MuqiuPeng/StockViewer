import { NextResponse } from 'next/server';
import { dataService, FundItem } from '@/lib/data-service-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/fund-list
 *
 * Fetches the list of available funds/ETFs
 * Query parameters:
 *   - type: 'etf' (default) | 'lof'
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'etf';

    // Validate type
    if (!['etf', 'lof'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type', message: 'Type must be etf or lof' },
        { status: 400 }
      );
    }

    // Fetch from Data Service
    const response = await dataService.getFundList(type as 'etf' | 'lof');

    if (!response.success || !response.data) {
      return NextResponse.json(
        {
          error: 'Failed to fetch fund list',
          message: response.error?.message || 'Unknown error',
          funds: []
        },
        { status: 503 }
      );
    }

    // Transform to standard format and sort by code
    const funds = response.data.items.map((item: FundItem) => ({
      code: item.code,
      name: item.name,
      type: item.type || type
    })).sort((a, b) => a.code.localeCompare(b.code));

    return NextResponse.json({
      success: true,
      type,
      count: funds.length,
      funds
    });

  } catch (error) {
    console.error('Error fetching fund list:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch fund list',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
