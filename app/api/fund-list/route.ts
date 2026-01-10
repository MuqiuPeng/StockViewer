import { NextResponse } from 'next/server';
import { API_CONFIG } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/fund-list
 *
 * Fetches the list of available funds/ETFs
 * Query parameters:
 *   - type: 'etf' (default) | 'lof' | 'all'
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'etf';

    const results: { code: string; name: string; type: string }[] = [];

    // Fetch ETF list
    if (type === 'etf' || type === 'all') {
      try {
        const etfUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/fund_etf_spot_em`;
        const etfResponse = await fetch(etfUrl);

        if (etfResponse.ok) {
          const etfData = await etfResponse.json();

          if (Array.isArray(etfData)) {
            etfData.forEach((item: any) => {
              const code = item['代码'] || item.code;
              const name = item['名称'] || item.name;

              if (code && name) {
                results.push({
                  code: String(code),
                  name: String(name),
                  type: 'etf'
                });
              }
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch ETF list:', err);
      }
    }

    // Fetch LOF fund list
    if (type === 'lof' || type === 'all') {
      try {
        const lofUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/fund_lof_spot_em`;
        const lofResponse = await fetch(lofUrl);

        if (lofResponse.ok) {
          const lofData = await lofResponse.json();

          if (Array.isArray(lofData)) {
            lofData.forEach((item: any) => {
              const code = item['代码'] || item.code;
              const name = item['名称'] || item.name;

              if (code && name) {
                results.push({
                  code: String(code),
                  name: String(name),
                  type: 'lof'
                });
              }
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch LOF fund list:', err);
      }
    }

    // Remove duplicates (prefer ETF)
    const uniqueFunds = new Map<string, { code: string; name: string; type: string }>();

    for (const fund of results) {
      const existing = uniqueFunds.get(fund.code);

      if (!existing || (existing.type !== 'etf' && fund.type === 'etf')) {
        uniqueFunds.set(fund.code, fund);
      }
    }

    const finalResults = Array.from(uniqueFunds.values());

    // Sort by code
    finalResults.sort((a, b) => a.code.localeCompare(b.code));

    return NextResponse.json({
      success: true,
      type,
      count: finalResults.length,
      funds: finalResults
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
