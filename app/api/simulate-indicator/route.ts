/**
 * Simulate indicator calculation with virtual OHLC data
 * POST /api/simulate-indicator
 *
 * Appends a virtual candle to real price data, runs indicator Python code,
 * and returns ONLY the last row's values. Nothing is written to the database.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { loadIndicator, IndicatorMeta } from '@/lib/indicator-compute';
import { executePythonIndicator, ResourceManifest } from '@/lib/python-executor';
import { isPythonBusy } from '@/lib/python-child';
import { logger } from '@/lib/logger';
import { LogSource } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Simple period aggregation for simulation
function aggregatePricesToPeriod(
  prices: Array<{ date: Date; open: number; high: number; low: number; close: number; volume: any; turnover: number | null; amplitude: number | null; changePct: number | null; changeAmount: number | null; turnoverRate: number | null }>,
  period: string
) {
  if (period === 'daily') return prices;
  // For non-daily, just return daily — simulation is only meant for daily
  return prices;
}

export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) return authResult.response;
    const { userId } = authResult;

    const body = await request.json();
    const { stockId, simulatedCandle, indicatorIds } = body;

    // Validate
    if (!stockId || !simulatedCandle || !indicatorIds || !Array.isArray(indicatorIds)) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'stockId, simulatedCandle, and indicatorIds are required' },
        { status: 400 },
      );
    }

    const { date, open, high, low, close, volume } = simulatedCandle;
    if (!date || open == null || high == null || low == null || close == null) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'simulatedCandle requires date, open, high, low, close' },
        { status: 400 },
      );
    }

    // Load stock prices from DB
    const prices = await prisma.stockPrice.findMany({
      where: { stockId },
      orderBy: { date: 'asc' },
    });

    if (prices.length === 0) {
      return NextResponse.json(
        { error: 'No data', message: 'No price data available for this stock' },
        { status: 400 },
      );
    }

    // Build price records with numbers + virtual candle appended
    const pricesWithNumbers = prices.map(p => ({
      date: p.date,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume),
      turnover: p.turnover ? Number(p.turnover) : null,
      amplitude: p.amplitude ? Number(p.amplitude) : null,
      changePct: p.changePct ? Number(p.changePct) : null,
      changeAmount: p.changeAmount ? Number(p.changeAmount) : null,
      turnoverRate: p.turnoverRate ? Number(p.turnoverRate) : null,
    }));

    // Calculate change values for the virtual candle
    const lastReal = pricesWithNumbers[pricesWithNumbers.length - 1];
    const virtualChangePct = lastReal.close > 0
      ? ((close - lastReal.close) / lastReal.close) * 100
      : null;
    const virtualChangeAmount = close - lastReal.close;

    // Append virtual candle
    const virtualDate = new Date(date);
    pricesWithNumbers.push({
      date: virtualDate,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume || 0),
      turnover: null,
      amplitude: high > 0 && low > 0 ? ((high - low) / lastReal.close) * 100 : null,
      changePct: virtualChangePct,
      changeAmount: virtualChangeAmount,
      turnoverRate: null,
    });

    // Build data records (same format as computeIndicator)
    const dataRecords = pricesWithNumbers.map(p => ({
      date: p.date instanceof Date ? p.date.toISOString().split('T')[0] : String(p.date),
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
      turnover: p.turnover,
      amplitude: p.amplitude,
      change_pct: p.changePct,
      change_amount: p.changeAmount,
      turnover_rate: p.turnoverRate,
    }));

    // Process each indicator
    const results: Record<string, { value?: number | null; groupValues?: Record<string, number | null>; error?: string }> = {};

    for (const indicatorId of indicatorIds) {
      try {
        const indicator = await loadIndicator(indicatorId);
        if (!indicator) {
          results[indicatorId] = { error: 'Indicator not found' };
          continue;
        }

        // Execute Python indicator
        const executionResult = await executePythonIndicator({
          code: indicator.pythonCode,
          data: dataRecords,
          isGroup: indicator.isGroup,
        });

        if (!executionResult.success) {
          results[indicatorId] = { error: executionResult.error || 'Execution failed' };
          continue;
        }

        // Extract only the last value (the simulated row)
        if (indicator.isGroup) {
          const valuesDict = executionResult.values as Record<string, (number | null)[]>;
          const groupValues: Record<string, number | null> = {};
          for (const [col, vals] of Object.entries(valuesDict)) {
            groupValues[col] = vals[vals.length - 1] ?? null;
          }
          results[indicatorId] = { groupValues };
        } else {
          const values = executionResult.values as (number | null)[];
          results[indicatorId] = { value: values[values.length - 1] ?? null };
        }
      } catch (err) {
        results[indicatorId] = { error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }

    logger.info(LogSource.API, 'simulate_indicator', `Simulated ${indicatorIds.length} indicator(s) for stock`, {
      userId,
      metadata: { stockId, date, indicatorCount: indicatorIds.length },
    });

    return NextResponse.json({ success: true, date, indicators: results });
  } catch (error) {
    logger.error(LogSource.API, 'simulate_indicator', 'Simulation failed', { error });
    return NextResponse.json(
      { error: 'Simulation failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: isPythonBusy(error) ? 503 : 500 },
    );
  }
}
