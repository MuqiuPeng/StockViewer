/**
 * Dataset Detail API (Compatibility Layer)
 * GET /api/dataset/:id - Get dataset with candles and indicator data
 *
 * This endpoint provides backwards compatibility with the frontend
 * by transforming Stock + StockPrice + IndicatorValue data to DatasetData format.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

/**
 * CandleData format expected by frontend
 */
interface CandleData {
  time: string;  // YYYY-MM-DD format
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * IndicatorData format expected by frontend
 */
interface IndicatorData {
  time: string;  // YYYY-MM-DD format
  value: number | null;
}

/**
 * DatasetData format expected by frontend
 */
interface DatasetData {
  meta: {
    name: string;
    code: string;
    filename: string;
    columns: string[];
    indicators: string[];
    rowCount: number;
    dataSource?: string;
    firstDate?: string;
    lastDate?: string;
    lastUpdate?: string;
  };
  candles: CandleData[];
  indicators: Record<string, IndicatorData[]>;
}

// GET /api/dataset/:id - Get full dataset data
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10000', 10), 50000);

    // Try to find stock by ID first, then by symbol/filename
    let stock = await prisma.stock.findUnique({
      where: { id: params.id },
    });

    // If not found by ID, try to parse as filename (symbol_dataSource)
    if (!stock) {
      const parts = params.id.split('_');
      if (parts.length >= 2) {
        const symbol = parts[0];
        const dataSource = parts.slice(1).join('_');
        stock = await prisma.stock.findFirst({
          where: { symbol, dataSource },
        });
      }
    }

    // Try by symbol only
    if (!stock) {
      stock = await prisma.stock.findFirst({
        where: { symbol: params.id },
      });
    }

    if (!stock) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    // Build price query
    const priceWhere: any = { stockId: stock.id };
    if (startDate) {
      priceWhere.date = { ...priceWhere.date, gte: new Date(startDate) };
    }
    if (endDate) {
      priceWhere.date = { ...priceWhere.date, lte: new Date(endDate) };
    }

    // Get price data
    const prices = await prisma.stockPrice.findMany({
      where: priceWhere,
      orderBy: { date: 'asc' },
      take: limit,
    });

    // Transform to candles
    const candles: CandleData[] = prices.map(p => ({
      time: p.date.toISOString().split('T')[0],
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
    }));

    // Get indicator values
    // First, get user's own indicators and subscribed public indicators
    const [ownIndicators, subscriptions] = await Promise.all([
      prisma.indicator.findMany({
        where: { ownerId: userId },
        select: { id: true, name: true, outputColumn: true, isGroup: true, groupName: true, expectedOutputs: true },
      }),
      prisma.indicatorSubscription.findMany({
        where: { userId },
        include: {
          indicator: {
            select: { id: true, name: true, outputColumn: true, isGroup: true, groupName: true, expectedOutputs: true },
          },
        },
      }),
    ]);

    const subscribedIndicators = subscriptions.map(s => s.indicator);
    const allIndicators = [...ownIndicators, ...subscribedIndicators];

    // Get cached indicator values
    const indicatorIds = allIndicators.map(i => i.id);

    // Get from shared cache (public indicators)
    const sharedValues = await prisma.indicatorValue.findMany({
      where: {
        indicatorId: { in: indicatorIds },
        stockId: stock.id,
        date: priceWhere.date,
      },
      orderBy: { date: 'asc' },
    });

    // Get from user cache (private indicators)
    const userValues = await prisma.indicatorValueCache.findMany({
      where: {
        userId,
        indicatorId: { in: indicatorIds },
        stockId: stock.id,
        date: priceWhere.date,
      },
      orderBy: { date: 'asc' },
    });

    // Build indicator data map
    const indicators: Record<string, IndicatorData[]> = {};
    const indicatorColumns: string[] = [];

    // Process shared values
    for (const value of sharedValues) {
      const indicator = allIndicators.find(i => i.id === value.indicatorId);
      if (!indicator) continue;

      const time = value.date.toISOString().split('T')[0];

      if (indicator.isGroup && value.groupValues) {
        // Group indicator - add each output column
        const groupValues = value.groupValues as Record<string, number | null>;
        for (const [key, val] of Object.entries(groupValues)) {
          const columnName = `${indicator.groupName}:${key}`;
          if (!indicators[columnName]) {
            indicators[columnName] = [];
            indicatorColumns.push(columnName);
          }
          indicators[columnName].push({ time, value: val });
        }
      } else {
        // Single indicator
        const columnName = indicator.outputColumn;
        if (!indicators[columnName]) {
          indicators[columnName] = [];
          indicatorColumns.push(columnName);
        }
        indicators[columnName].push({
          time,
          value: value.value ? Number(value.value) : null,
        });
      }
    }

    // Process user-specific values (override if exists)
    for (const value of userValues) {
      const indicator = allIndicators.find(i => i.id === value.indicatorId);
      if (!indicator) continue;

      const time = value.date.toISOString().split('T')[0];

      if (indicator.isGroup && value.groupValues) {
        const groupValues = value.groupValues as Record<string, number | null>;
        for (const [key, val] of Object.entries(groupValues)) {
          const columnName = `${indicator.groupName}:${key}`;
          if (!indicators[columnName]) {
            indicators[columnName] = [];
            indicatorColumns.push(columnName);
          }
          // Find and update existing entry or add new
          const existing = indicators[columnName].find(d => d.time === time);
          if (existing) {
            existing.value = val;
          } else {
            indicators[columnName].push({ time, value: val });
          }
        }
      } else {
        const columnName = indicator.outputColumn;
        if (!indicators[columnName]) {
          indicators[columnName] = [];
          indicatorColumns.push(columnName);
        }
        const existing = indicators[columnName].find(d => d.time === time);
        if (existing) {
          existing.value = value.value ? Number(value.value) : null;
        } else {
          indicators[columnName].push({
            time,
            value: value.value ? Number(value.value) : null,
          });
        }
      }
    }

    // Sort indicator data by time
    for (const col of Object.keys(indicators)) {
      indicators[col].sort((a, b) => a.time.localeCompare(b.time));
    }

    // Add volume and other price-derived indicators
    const volumeData: IndicatorData[] = prices.map(p => ({
      time: p.date.toISOString().split('T')[0],
      value: Number(p.volume),
    }));
    indicators['volume'] = volumeData;
    if (!indicatorColumns.includes('volume')) {
      indicatorColumns.push('volume');
    }

    // Add optional price data as indicators if present
    if (prices.some(p => p.turnover !== null)) {
      indicators['turnover'] = prices.map(p => ({
        time: p.date.toISOString().split('T')[0],
        value: p.turnover ? Number(p.turnover) : null,
      }));
      indicatorColumns.push('turnover');
    }

    if (prices.some(p => p.changePct !== null)) {
      indicators['change_pct'] = prices.map(p => ({
        time: p.date.toISOString().split('T')[0],
        value: p.changePct ? Number(p.changePct) : null,
      }));
      indicatorColumns.push('change_pct');
    }

    if (prices.some(p => p.amplitude !== null)) {
      indicators['amplitude'] = prices.map(p => ({
        time: p.date.toISOString().split('T')[0],
        value: p.amplitude ? Number(p.amplitude) : null,
      }));
      indicatorColumns.push('amplitude');
    }

    if (prices.some(p => p.turnoverRate !== null)) {
      indicators['turnover_rate'] = prices.map(p => ({
        time: p.date.toISOString().split('T')[0],
        value: p.turnoverRate ? Number(p.turnoverRate) : null,
      }));
      indicatorColumns.push('turnover_rate');
    }

    // Build response
    const baseColumns = ['date', 'open', 'high', 'low', 'close'];
    const allColumns = [...baseColumns, ...indicatorColumns];

    const result: DatasetData = {
      meta: {
        name: stock.name,
        code: stock.symbol,
        filename: `${stock.symbol}_${stock.dataSource}`,
        columns: allColumns,
        indicators: indicatorColumns,
        rowCount: candles.length,
        dataSource: stock.dataSource,
        firstDate: stock.firstDate?.toISOString().split('T')[0],
        lastDate: stock.lastDate?.toISOString().split('T')[0],
        lastUpdate: stock.lastUpdate?.toISOString(),
      },
      candles,
      indicators,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error getting dataset:', error);
    return NextResponse.json(
      { error: 'Failed to get dataset', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/dataset/:id - Delete a dataset
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    // Find stock
    let stock = await prisma.stock.findUnique({
      where: { id: params.id },
    });

    if (!stock) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    // Delete stock (cascade will delete price data)
    await prisma.stock.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: `Deleted dataset ${stock.symbol}`,
    });
  } catch (error) {
    console.error('Error deleting dataset:', error);
    return NextResponse.json(
      { error: 'Failed to delete dataset', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
