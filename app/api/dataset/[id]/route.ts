/**
 * Dataset Detail API (Compatibility Layer)
 * GET /api/dataset/:id - Get dataset with candles and indicator data
 *
 * This endpoint provides backwards compatibility with the frontend
 * by transforming Stock + StockPrice + IndicatorValue data to DatasetData format.
 *
 * Uses stockPriceId-based alignment and versioning for indicator values.
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
    // Get user's own indicators and indicators they have access to (public or shared with them)
    const allIndicators = await prisma.indicator.findMany({
      where: {
        OR: [
          { createdBy: userId },                  // Own indicators
          { visibleTo: { isEmpty: true } },       // Public indicators
          { visibleTo: { has: userId } },         // Shared with this user
        ],
      },
      select: {
        id: true,
        name: true,
        outputColumn: true,
        isGroup: true,
        groupName: true,
        expectedOutputs: true,
        version: true,  // Need version for cache validation
      },
    });

    // Build a map of indicator ID to version for filtering
    const indicatorVersionMap = new Map(allIndicators.map(i => [i.id, i.version]));

    // Get cached indicator values using stockPriceId-based join
    // Only fetch values with matching current version
    const indicatorValues = await prisma.indicatorValue.findMany({
      where: {
        indicatorId: { in: allIndicators.map(i => i.id) },
        stockPrice: {
          stockId: stock.id,
          ...(priceWhere.date && { date: priceWhere.date }),
        },
      },
      include: {
        stockPrice: {
          select: { id: true, date: true },
        },
      },
      orderBy: { stockPrice: { date: 'asc' } },
    });

    // Filter to only include values with current version
    const validValues = indicatorValues.filter(v => {
      const expectedVersion = indicatorVersionMap.get(v.indicatorId);
      return expectedVersion !== undefined && v.version === expectedVersion;
    });

    // Build indicator value lookup by date
    // Map: indicatorColumn -> date -> value
    const indicatorValuesByDate: Record<string, Map<string, number | null>> = {};

    // Process indicator values (using stockPriceId-aligned data)
    for (const value of validValues) {
      const indicator = allIndicators.find(i => i.id === value.indicatorId);
      if (!indicator) continue;

      // Get date from the joined stockPrice record
      const time = value.stockPrice.date.toISOString().split('T')[0];

      if (indicator.isGroup && value.groupValues) {
        // Group indicator - add each output column
        const groupValues = value.groupValues as Record<string, number | null>;
        for (const [key, val] of Object.entries(groupValues)) {
          const columnName = `${indicator.groupName}:${key}`;
          if (!indicatorValuesByDate[columnName]) {
            indicatorValuesByDate[columnName] = new Map();
          }
          indicatorValuesByDate[columnName].set(time, val);
        }
      } else {
        // Single indicator
        const columnName = indicator.outputColumn;
        if (!indicatorValuesByDate[columnName]) {
          indicatorValuesByDate[columnName] = new Map();
        }
        indicatorValuesByDate[columnName].set(
          time,
          value.value ? Number(value.value) : null
        );
      }
    }

    // Build indicator data map - ensure all dates are present (fill nulls for missing)
    const indicators: Record<string, IndicatorData[]> = {};
    const indicatorColumns: string[] = Object.keys(indicatorValuesByDate);

    // For each indicator, create entries for ALL price dates (fill 0 for missing)
    // Using 0 instead of null because lightweight-charts doesn't support null values
    for (const columnName of indicatorColumns) {
      const valueMap = indicatorValuesByDate[columnName];
      indicators[columnName] = prices.map(p => {
        const time = p.date.toISOString().split('T')[0];
        return {
          time,
          value: valueMap.get(time) ?? 0,  // 0 if not computed for this date
        };
      });
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
