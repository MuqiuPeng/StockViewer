/**
 * Stock listing and search API
 * GET /api/stocks - List all stocks with pagination and search
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/stocks - List all stocks
export async function GET(request: Request) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = (page - 1) * limit;

    // Filters
    const query = searchParams.get('q') || '';
    const dataSource = searchParams.get('dataSource') || '';
    const category = searchParams.get('category') || '';

    // Sorting
    const sortBy = searchParams.get('sortBy') || 'symbol';
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';

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

    if (category) {
      where.category = category;
    }

    // Build orderBy
    const orderBy: any = {};
    if (['symbol', 'name', 'dataSource', 'lastDate', 'rowCount', 'createdAt'].includes(sortBy)) {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.symbol = 'asc';
    }

    // Execute queries in parallel
    const [stocks, total, dataSources, categories] = await Promise.all([
      prisma.stock.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
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
          createdAt: true,
        },
      }),
      prisma.stock.count({ where }),
      prisma.stock.findMany({
        select: { dataSource: true },
        distinct: ['dataSource'],
      }),
      prisma.stock.findMany({
        where: { category: { not: null } },
        select: { category: true },
        distinct: ['category'],
      }),
    ]);

    return NextResponse.json({
      stocks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        dataSources: dataSources.map(d => d.dataSource),
        categories: categories.map(c => c.category).filter(Boolean),
      },
    });
  } catch (error) {
    console.error('Error listing stocks:', error);
    return NextResponse.json(
      { error: 'Failed to list stocks', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
