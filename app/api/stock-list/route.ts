import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/lib/env';
import { fetchWithRetry } from '@/lib/fetch-utils';

export const runtime = 'nodejs';

/**
 * GET /api/stock-list
 *
 * Fetches the complete list of stocks with their codes and names.
 *
 * Query parameters:
 *   - source: 'active' (default) | 'delisted_sh' | 'delisted_sz' | 'all'
 *   - cache: 'true' | 'false' (default true) - whether to cache the result
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || 'active';

    const results: { code: string; name: string; status: string }[] = [];
    const errors: string[] = [];

    // Fetch active stocks
    if (source === 'active' || source === 'all') {
      try {
        const activeUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/stock_info_a_code_name`;
        const activeResponse = await fetchWithRetry(activeUrl);

        if (activeResponse.ok) {
          const activeData = await activeResponse.json();

          // Transform to standard format
          if (Array.isArray(activeData)) {
            activeData.forEach((item: any) => {
              // Handle both possible column names
              const code = item.code || item['代码'] || item.symbol;
              const name = item.name || item['名称'];

              if (code && name) {
                results.push({
                  code: String(code),
                  name: String(name),
                  status: 'active'
                });
              }
            });
          }
        } else {
          errors.push(`Active stocks API returned ${activeResponse.status}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Failed to fetch active stocks:', errMsg);
        errors.push(`Failed to fetch active stocks: ${errMsg}`);
      }
    }

    // Fetch Shanghai delisted stocks
    if (source === 'delisted_sh' || source === 'all') {
      try {
        const shDelistUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/stock_info_sh_delist?symbol=全部`;
        const shDelistResponse = await fetchWithRetry(shDelistUrl);

        if (shDelistResponse.ok) {
          const shDelistData = await shDelistResponse.json();

          if (Array.isArray(shDelistData)) {
            shDelistData.forEach((item: any) => {
              const code = item['公司代码'] || item.code;
              const name = item['公司简称'] || item.name;

              if (code && name) {
                results.push({
                  code: String(code),
                  name: String(name),
                  status: 'delisted_sh'
                });
              }
            });
          }
        } else {
          errors.push(`Shanghai delisted API returned ${shDelistResponse.status}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Failed to fetch Shanghai delisted stocks:', errMsg);
        errors.push(`Failed to fetch Shanghai delisted stocks: ${errMsg}`);
      }
    }

    // Fetch Shenzhen delisted stocks
    if (source === 'delisted_sz' || source === 'all') {
      try {
        const szDelistUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/stock_info_sz_delist?symbol=终止上市公司`;
        const szDelistResponse = await fetchWithRetry(szDelistUrl);

        if (szDelistResponse.ok) {
          const szDelistData = await szDelistResponse.json();

          if (Array.isArray(szDelistData)) {
            szDelistData.forEach((item: any) => {
              const code = item['证券代码'] || item.code;
              const name = item['证券简称'] || item.name;

              if (code && name) {
                results.push({
                  code: String(code),
                  name: String(name),
                  status: 'delisted_sz'
                });
              }
            });
          }
        } else {
          errors.push(`Shenzhen delisted API returned ${szDelistResponse.status}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Failed to fetch Shenzhen delisted stocks:', errMsg);
        errors.push(`Failed to fetch Shenzhen delisted stocks: ${errMsg}`);
      }
    }

    // Remove duplicates (prefer active status)
    const uniqueStocks = new Map<string, { code: string; name: string; status: string }>();

    for (const stock of results) {
      const existing = uniqueStocks.get(stock.code);

      // If not exists, or existing is delisted but new is active, update
      if (!existing || (existing.status !== 'active' && stock.status === 'active')) {
        uniqueStocks.set(stock.code, stock);
      }
    }

    const finalResults = Array.from(uniqueStocks.values());

    // Sort by code
    finalResults.sort((a, b) => a.code.localeCompare(b.code));

    // If no results and there were errors, return error response
    if (finalResults.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Failed to fetch stock list',
          message: errors.join('; '),
          stocks: []
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      count: finalResults.length,
      stocks: finalResults,
      ...(errors.length > 0 && { warnings: errors })
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
