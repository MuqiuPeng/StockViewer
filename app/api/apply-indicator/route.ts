/**
 * Apply indicator API
 * POST /api/apply-indicator - Compute and cache indicator values for stocks
 */

import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import { computeIndicator, computeIndicators, ComputeResult } from '@/lib/indicator-compute';

export const runtime = 'nodejs';

// POST /api/apply-indicator - Apply indicator to stock(s)
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { indicatorId, stockIds, forceRecompute, startDate, endDate } = body;

    // Validate request
    if (!indicatorId) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'indicatorId is required' },
        { status: 400 }
      );
    }

    if (!stockIds || !Array.isArray(stockIds) || stockIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'stockIds (non-empty array) is required' },
        { status: 400 }
      );
    }

    // Parse date options
    const options: {
      forceRecompute?: boolean;
      startDate?: Date;
      endDate?: Date;
    } = {};

    if (forceRecompute === true) {
      options.forceRecompute = true;
    }

    if (startDate) {
      options.startDate = new Date(startDate);
    }

    if (endDate) {
      options.endDate = new Date(endDate);
    }

    // Compute indicator for each stock
    const results: Record<string, ComputeResult> = {};

    for (const stockId of stockIds) {
      const result = await computeIndicator(indicatorId, stockId, userId, options);
      results[stockId] = result;
    }

    // Check if all succeeded
    const allSuccess = Object.values(results).every(r => r.success);
    const successCount = Object.values(results).filter(r => r.success).length;
    const failCount = stockIds.length - successCount;

    return NextResponse.json({
      success: allSuccess,
      message: allSuccess
        ? `Successfully computed indicator for ${successCount} stock(s)`
        : `Computed for ${successCount} stock(s), failed for ${failCount}`,
      results,
    });
  } catch (error) {
    console.error('Error applying indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to apply indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
