import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/index-list
 *
 * Fetches the list of available indices
 * Query parameters:
 *   - source: 'zh' (default) | 'hk' | 'us' | 'global'
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || 'zh';

    let apiUrl: string;
    let labelMapping: { code: string; name: string };

    switch (source) {
      case 'zh':
        // Chinese indices from East Money
        apiUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/stock_zh_index_spot_em`;
        labelMapping = { code: '代码', name: '名称' };
        break;

      case 'hk':
        // Hong Kong indices
        apiUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/stock_hk_index_spot_em`;
        labelMapping = { code: '代码', name: '名称' };
        break;

      case 'us':
        // US indices via Sina
        apiUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/index_us_stock_sina`;
        labelMapping = { code: 'symbol', name: 'name' };
        break;

      case 'global':
        // Global indices
        apiUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/index_global_spot_em`;
        labelMapping = { code: '代码', name: '名称' };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid source', message: 'Source must be zh, hk, us, or global' },
          { status: 400 }
        );
    }

    const response = await fetch(apiUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch index list', message: `API returned status ${response.status}` },
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
    const indices = data.map((item: any) => ({
      code: String(item[labelMapping.code] || item.code || ''),
      name: String(item[labelMapping.name] || item.name || ''),
      source
    })).filter(item => item.code && item.name);

    return NextResponse.json({
      success: true,
      source,
      count: indices.length,
      indices
    });

  } catch (error) {
    console.error('Error fetching index list:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch index list',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
