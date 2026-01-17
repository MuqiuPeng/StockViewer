/**
 * Indicator values API
 * GET /api/indicator-values - Get computed indicator values for a stock
 * POST /api/indicator-values - Compute and get indicator values
 */

import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import { getIndicatorValues, computeIndicator } from '@/lib/indicator-compute';

export const runtime = 'nodejs';

// GET /api/indicator-values - Get cached indicator values
export async function GET(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const indicatorId = searchParams.get('indicatorId');
    const stockId = searchParams.get('stockId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const autoCompute = searchParams.get('autoCompute') !== 'false';

    if (!indicatorId || !stockId) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'indicatorId and stockId are required' },
        { status: 400 }
      );
    }

    const options: {
      startDate?: Date;
      endDate?: Date;
      autoCompute?: boolean;
    } = { autoCompute };

    if (startDate) {
      options.startDate = new Date(startDate);
    }

    if (endDate) {
      options.endDate = new Date(endDate);
    }

    const result = await getIndicatorValues(indicatorId, stockId, userId, options);

    if (result.error) {
      return NextResponse.json(
        { error: 'Failed to get indicator values', message: result.error },
        { status: 500 }
      );
    }

    // Format values for frontend
    const formattedValues = result.values.map(v => ({
      time: v.date.toISOString().split('T')[0],
      value: v.value,
      ...v.groupValues,
    }));

    return NextResponse.json({
      values: formattedValues,
      computed: result.computed,
      count: formattedValues.length,
    });
  } catch (error) {
    console.error('Error getting indicator values:', error);
    return NextResponse.json(
      {
        error: 'Failed to get indicator values',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST /api/indicator-values - Get multiple indicator values at once
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { indicatorIds, stockId, startDate, endDate, autoCompute = true } = body;

    if (!indicatorIds || !Array.isArray(indicatorIds) || indicatorIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'indicatorIds (non-empty array) is required' },
        { status: 400 }
      );
    }

    if (!stockId) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'stockId is required' },
        { status: 400 }
      );
    }

    const options: {
      startDate?: Date;
      endDate?: Date;
      autoCompute?: boolean;
    } = { autoCompute };

    if (startDate) {
      options.startDate = new Date(startDate);
    }

    if (endDate) {
      options.endDate = new Date(endDate);
    }

    // Get values for each indicator
    const results: Record<string, {
      values: any[];
      computed: boolean;
      error?: string;
    }> = {};

    for (const indicatorId of indicatorIds) {
      const result = await getIndicatorValues(indicatorId, stockId, userId, options);

      // Format values for frontend
      const formattedValues = result.values.map(v => ({
        time: v.date.toISOString().split('T')[0],
        value: v.value,
        ...v.groupValues,
      }));

      results[indicatorId] = {
        values: formattedValues,
        computed: result.computed,
        error: result.error,
      };
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Error getting indicator values:', error);
    return NextResponse.json(
      {
        error: 'Failed to get indicator values',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
