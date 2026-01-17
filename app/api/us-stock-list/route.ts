import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/us-stock-list
 *
 * Fetches the list of available US stocks
 */
export async function GET(request: Request) {
  try {
    const usUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/stock_us_spot_em`;
    const response = await fetch(usUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch US stock list', message: `API returned status ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: 'Invalid response', message: 'API did not return an array' },
        { status: 502 }
      );
    }

    // Transform to standard format
    const stocks = data.map((item: any) => {
      const code = item['代码'] || item.code || item.symbol;
      const name = item['名称'] || item.name;

      return {
        code: String(code || ''),
        name: String(name || ''),
      };
    }).filter(item => item.code && item.name);

    // Sort by code
    stocks.sort((a, b) => a.code.localeCompare(b.code));

    return NextResponse.json({
      success: true,
      count: stocks.length,
      stocks
    });

  } catch (error) {
    console.error('Error fetching US stock list:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch US stock list',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
