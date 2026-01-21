/**
 * Get user's items for sharing
 * GET /api/subscription/posts/my-items - Get user's datasets, indicators, and strategies
 *
 * Note: Only returns items the user created/owns (not subscribed items)
 * because only creators should be able to share content
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

    // Get user's datasets (any dataset in their collection can be shared)
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

    // Get user's indicators (only those created by user - subscribers can't share)
    const indicators = await prisma.indicator.findMany({
      where: {
        createdBy: userId,
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

    // Get user's strategies (only those created by user - subscribers can't share)
    const strategies = await prisma.strategy.findMany({
      where: {
        createdBy: userId,
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
        isOwner: true, // Only owned indicators returned
      })),
      strategies: strategies.map((str) => ({
        id: str.id,
        name: str.name,
        description: str.description,
        strategyType: str.strategyType,
        isOwner: true, // Only owned strategies returned
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
