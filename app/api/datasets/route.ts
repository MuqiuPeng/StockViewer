/**
 * Datasets API (User's Dataset Collection)
 * GET /api/datasets - List user's dataset collection
 * DELETE /api/datasets - Remove dataset from user's collection
 *
 * Stock data is shared across all users. Each user has their own collection
 * (UserStock) that references the shared Stock table.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

/**
 * DatasetInfo format expected by frontend
 */
interface DatasetInfo {
  id: string;
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
}

// GET /api/datasets - List user's dataset collection
export async function GET(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const dataSource = searchParams.get('dataSource') || '';

    // Build where clause for the Stock within UserStock
    const stockWhere: any = {};

    if (query) {
      stockWhere.OR = [
        { symbol: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (dataSource) {
      stockWhere.dataSource = dataSource;
    }

    // Get user's dataset collection with stock details
    const userStocks = await prisma.userStock.findMany({
      where: {
        userId,
        stock: stockWhere,
      },
      include: {
        stock: true,
      },
      orderBy: {
        stock: { symbol: 'asc' },
      },
    });

    const baseColumns = ['date', 'open', 'high', 'low', 'close', 'volume'];

    // Transform to DatasetInfo format
    const datasets: DatasetInfo[] = userStocks.map(us => ({
      id: us.stock.id,
      name: us.stock.name,
      code: us.stock.symbol,
      filename: `${us.stock.symbol}_${us.stock.dataSource}`,
      columns: [...baseColumns],
      indicators: [],
      rowCount: us.stock.rowCount,
      dataSource: us.stock.dataSource,
      firstDate: us.stock.firstDate?.toISOString().split('T')[0],
      lastDate: us.stock.lastDate?.toISOString().split('T')[0],
      lastUpdate: us.stock.lastUpdate?.toISOString(),
    }));

    // Get unique data sources from user's collection
    const dataSources = await prisma.userStock.findMany({
      where: { userId },
      select: {
        stock: {
          select: { dataSource: true },
        },
      },
      distinct: ['stockId'],
    });

    const uniqueDataSources = [...new Set(dataSources.map(d => d.stock.dataSource))];

    return NextResponse.json({
      datasets,
      dataSources: uniqueDataSources,
    });
  } catch (error) {
    console.error('Error listing datasets:', error);
    return NextResponse.json(
      { error: 'Failed to list datasets', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/datasets - Remove dataset from user's collection
export async function DELETE(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

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

    // Remove from user's collection (not deleting the shared stock data)
    const deleted = await prisma.userStock.deleteMany({
      where: {
        userId,
        stockId: stock.id,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json(
        { error: 'Dataset not in your collection' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Removed ${stock.symbol} from your collection`,
    });
  } catch (error) {
    console.error('Error removing dataset:', error);
    return NextResponse.json(
      { error: 'Failed to remove dataset', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
