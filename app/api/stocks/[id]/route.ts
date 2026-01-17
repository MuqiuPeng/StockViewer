/**
 * Individual stock API
 * GET /api/stocks/:id - Get stock details with price data
 * DELETE /api/stocks/:id - Delete a stock
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/stocks/:id - Get stock details with optional price data
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);

    // Options for price data
    const includePrices = searchParams.get('prices') !== 'false';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const priceLimit = Math.min(parseInt(searchParams.get('priceLimit') || '5000', 10), 10000);

    // Find stock by ID or symbol
    let stock = await prisma.stock.findUnique({
      where: { id: params.id },
    });

    // If not found by ID, try by symbol
    if (!stock) {
      stock = await prisma.stock.findFirst({
        where: { symbol: params.id },
      });
    }

    if (!stock) {
      return NextResponse.json(
        { error: 'Stock not found' },
        { status: 404 }
      );
    }

    // Build response
    const result: any = {
      stock: {
        id: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        dataSource: stock.dataSource,
        category: stock.category,
        exchange: stock.exchange,
        firstDate: stock.firstDate,
        lastDate: stock.lastDate,
        rowCount: stock.rowCount,
        lastUpdate: stock.lastUpdate,
        createdAt: stock.createdAt,
        updatedAt: stock.updatedAt,
      },
    };

    // Fetch price data if requested
    if (includePrices) {
      const priceWhere: any = { stockId: stock.id };

      if (startDate) {
        priceWhere.date = { ...priceWhere.date, gte: new Date(startDate) };
      }
      if (endDate) {
        priceWhere.date = { ...priceWhere.date, lte: new Date(endDate) };
      }

      const prices = await prisma.stockPrice.findMany({
        where: priceWhere,
        orderBy: { date: 'asc' },
        take: priceLimit,
      });

      // Convert to frontend format (candles)
      result.candles = prices.map(p => ({
        time: p.date.toISOString().split('T')[0], // YYYY-MM-DD
        open: Number(p.open),
        high: Number(p.high),
        low: Number(p.low),
        close: Number(p.close),
      }));

      // Include extended data as indicators
      result.indicators = {
        volume: prices.map(p => ({
          time: p.date.toISOString().split('T')[0],
          value: Number(p.volume),
        })),
      };

      // Include optional fields if present
      if (prices.some(p => p.turnover !== null)) {
        result.indicators.turnover = prices.map(p => ({
          time: p.date.toISOString().split('T')[0],
          value: p.turnover ? Number(p.turnover) : null,
        }));
      }
      if (prices.some(p => p.changePct !== null)) {
        result.indicators.change_pct = prices.map(p => ({
          time: p.date.toISOString().split('T')[0],
          value: p.changePct ? Number(p.changePct) : null,
        }));
      }
      if (prices.some(p => p.amplitude !== null)) {
        result.indicators.amplitude = prices.map(p => ({
          time: p.date.toISOString().split('T')[0],
          value: p.amplitude ? Number(p.amplitude) : null,
        }));
      }
      if (prices.some(p => p.turnoverRate !== null)) {
        result.indicators.turnover_rate = prices.map(p => ({
          time: p.date.toISOString().split('T')[0],
          value: p.turnoverRate ? Number(p.turnoverRate) : null,
        }));
      }

      result.meta = {
        name: stock.name,
        code: stock.symbol,
        rowCount: prices.length,
        columns: ['date', 'open', 'high', 'low', 'close', ...Object.keys(result.indicators)],
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error getting stock:', error);
    return NextResponse.json(
      { error: 'Failed to get stock', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/stocks/:id - Delete a stock and its price data
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    // Find stock
    const stock = await prisma.stock.findUnique({
      where: { id: params.id },
    });

    if (!stock) {
      return NextResponse.json(
        { error: 'Stock not found' },
        { status: 404 }
      );
    }

    // Delete stock (cascade will delete price data)
    await prisma.stock.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: `Deleted stock ${stock.symbol} and all its price data`,
    });
  } catch (error) {
    console.error('Error deleting stock:', error);
    return NextResponse.json(
      { error: 'Failed to delete stock', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
