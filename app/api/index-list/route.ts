import { NextResponse } from 'next/server';
import { dataService, IndexItem } from '@/lib/data-service-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    // Validate source
    if (!['zh', 'hk', 'us', 'global'].includes(source)) {
      return NextResponse.json(
        { error: 'Invalid source', message: 'Source must be zh, hk, us, or global' },
        { status: 400 }
      );
    }

    // Fetch from Data Service
    const response = await dataService.getIndexList(source as 'zh' | 'hk' | 'us' | 'global');

    if (!response.success || !response.data) {
      return NextResponse.json(
        {
          error: 'Failed to fetch index list',
          message: response.error?.message || 'Unknown error'
        },
        { status: 502 }
      );
    }

    // Transform to standard format and sort by code
    const indices = response.data.items.map((item: IndexItem) => ({
      code: item.code,
      name: item.name,
      source
    })).sort((a, b) => a.code.localeCompare(b.code));

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
