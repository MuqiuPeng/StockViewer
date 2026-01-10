import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/futures-list
 *
 * Fetches the list of available futures contracts
 */
export async function GET(request: Request) {
  try {
    // Fetch futures spot data (contains all active contracts)
    const futuresUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/futures_zh_spot`;
    const response = await fetch(futuresUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch futures list', message: `API returned status ${response.status}` },
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
    // Futures data typically has: 代码, 名称, 交易所
    const futures = data.map((item: any) => {
      const code = item['代码'] || item.code || item.symbol;
      const name = item['名称'] || item.name;
      const exchange = item['交易所'] || item.exchange || '';

      return {
        code: String(code || ''),
        name: String(name || ''),
        exchange: String(exchange),
      };
    }).filter(item => item.code && item.name);

    // Group by exchange for better organization
    const byExchange: Record<string, any[]> = {};
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
