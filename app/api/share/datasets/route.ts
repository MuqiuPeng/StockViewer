/**
 * Shared Datasets API
 * GET /api/share/datasets - List all shared/public datasets (stocks)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const dataSource = searchParams.get('dataSource') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const excludeOwned = searchParams.get('excludeOwned') === 'true';

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { symbol: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (dataSource) {
      where.dataSource = dataSource;
    }

    // Get user's owned stock IDs to exclude if requested
    let ownedStockIds: string[] = [];
    if (excludeOwned) {
      const userStocks = await prisma.userStock.findMany({
        where: { userId },
        select: { stockId: true },
      });
      ownedStockIds = userStocks.map((us) => us.stockId);

      if (ownedStockIds.length > 0) {
        where.id = { notIn: ownedStockIds };
      }
    }

    // Get total count
    const totalCount = await prisma.stock.count({ where });

    // Get stocks
    const stocks = await prisma.stock.findMany({
      where,
      select: {
        id: true,
        symbol: true,
        name: true,
        dataSource: true,
        category: true,
        exchange: true,
        firstDate: true,
        lastDate: true,
        rowCount: true,
        lastUpdate: true,
      },
      orderBy: [{ dataSource: 'asc' }, { symbol: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    // Get unique data sources for filtering
    const dataSources = await prisma.stock.groupBy({
      by: ['dataSource'],
      _count: { dataSource: true },
      orderBy: { dataSource: 'asc' },
    });

    // Check which stocks user already owns
    const userStockSet = new Set(ownedStockIds);
    const stocksWithOwnership = stocks.map((stock) => ({
      ...stock,
      isOwned: userStockSet.has(stock.id),
    }));

    return NextResponse.json({
      stocks: stocksWithOwnership,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      dataSources: dataSources.map((ds) => ({
        name: ds.dataSource,
        count: ds._count.dataSource,
      })),
    });
  } catch (error) {
    console.error('Error listing shared datasets:', error);
    return NextResponse.json(
      { error: 'Failed to list datasets', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
