/**
 * Get user's items for sharing
 * GET /api/share/posts/my-items - Get user's datasets, indicators, and strategies
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Get user's datasets
    const userStocks = await prisma.userStock.findMany({
      where: { userId },
      include: {
        stock: {
          select: {
            id: true,
            symbol: true,
            name: true,
            dataSource: true,
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    });

    // Get user's indicators (created by or subscribed to)
    const indicators = await prisma.indicator.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { userIndicators: { some: { userId } } },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        createdBy: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get user's strategies (created by or subscribed to)
    const strategies = await prisma.strategy.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { userStrategies: { some: { userId } } },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        strategyType: true,
        createdBy: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      datasets: userStocks.map((us) => ({
        id: us.stock.id,
        symbol: us.stock.symbol,
        name: us.stock.name,
        dataSource: us.stock.dataSource,
      })),
      indicators: indicators.map((ind) => ({
        id: ind.id,
        name: ind.name,
        description: ind.description,
        category: ind.category,
        isOwner: ind.createdBy === userId,
      })),
      strategies: strategies.map((str) => ({
        id: str.id,
        name: str.name,
        description: str.description,
        strategyType: str.strategyType,
        isOwner: str.createdBy === userId,
      })),
    });
  } catch (error) {
    console.error('Error fetching user items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
