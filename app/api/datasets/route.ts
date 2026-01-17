/**
 * Datasets API (Compatibility Layer)
 * GET /api/datasets - List all datasets (transforms Stock table to DatasetInfo format)
 *
 * This endpoint provides backwards compatibility with the frontend
 * by transforming the new Stock database model to the old DatasetInfo format.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

/**
 * DatasetInfo format expected by frontend
 */
interface DatasetInfo {
  id: string;
  name: string;
  code: string;
  filename: string;  // For compatibility, we'll use symbol_dataSource
  columns: string[];
  indicators: string[];
  rowCount: number;
  dataSource?: string;
  firstDate?: string;
  lastDate?: string;
  lastUpdate?: string;
}

// GET /api/datasets - List all datasets (from Stock table)
export async function GET(request: Request) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const dataSource = searchParams.get('dataSource') || '';

    // Build where clause
    const where: any = {};

    if (query) {
      where.OR = [
        { symbol: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (dataSource) {
      where.dataSource = dataSource;
    }

    // Get stocks from database
    const stocks = await prisma.stock.findMany({
      where,
      orderBy: { symbol: 'asc' },
      take: 500, // Limit for performance
    });

    // Get computed indicator columns for each stock
    // For now, we'll return basic OHLCV columns + any cached indicators
    const baseColumns = ['date', 'open', 'high', 'low', 'close', 'volume'];

    // Transform to DatasetInfo format
    const datasets: DatasetInfo[] = stocks.map(stock => ({
      id: stock.id,
      name: stock.name,
      code: stock.symbol,
      filename: `${stock.symbol}_${stock.dataSource}`,
      columns: [...baseColumns],
      indicators: [], // Will be populated when user applies indicators
      rowCount: stock.rowCount,
      dataSource: stock.dataSource,
      firstDate: stock.firstDate?.toISOString().split('T')[0],
      lastDate: stock.lastDate?.toISOString().split('T')[0],
      lastUpdate: stock.lastUpdate?.toISOString(),
    }));

    // Get unique data sources for filtering
    const dataSources = await prisma.stock.findMany({
      select: { dataSource: true },
      distinct: ['dataSource'],
    });

    return NextResponse.json({
      datasets,
      dataSources: dataSources.map(d => d.dataSource),
    });
  } catch (error) {
    console.error('Error listing datasets:', error);
    return NextResponse.json(
      { error: 'Failed to list datasets', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/datasets - Delete a dataset by identifier
export async function DELETE(request: Request) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const body = await request.json();
    const { identifier } = body;

    if (!identifier) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'identifier is required' },
        { status: 400 }
      );
    }

    // Find stock by ID first
    let stock = await prisma.stock.findUnique({
      where: { id: identifier },
    });

    // If not found by ID, try to parse as filename (symbol_dataSource)
    if (!stock) {
      const parts = identifier.split('_');
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
        where: { symbol: identifier },
      });
    }

    if (!stock) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    // Delete stock (cascade will delete price data)
    await prisma.stock.delete({
      where: { id: stock.id },
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
