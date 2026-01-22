/**
 * Profile Stats API
 * GET /api/profile/stats - Get user's resource reference statistics
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

    // Get all indicators created by the user
    const userIndicators = await prisma.indicator.findMany({
      where: { createdBy: userId },
      select: { id: true },
    });
    const indicatorIds = userIndicators.map(i => i.id);

    // Get all strategies created by the user
    const userStrategies = await prisma.strategy.findMany({
      where: { createdBy: userId },
      select: { id: true },
    });
    const strategyIds = userStrategies.map(s => s.id);

    // Get all stock groups created by the user
    const userStockGroups = await prisma.stockGroup.findMany({
      where: { createdBy: userId },
      select: { id: true },
    });
    const stockGroupIds = userStockGroups.map(g => g.id);

    // Count unique users who have imported each resource type (excluding the creator)
    const [indicatorImports, strategyImports, stockGroupImports] = await Promise.all([
      indicatorIds.length > 0
        ? prisma.userIndicator.findMany({
            where: {
              indicatorId: { in: indicatorIds },
              userId: { not: userId },
            },
            select: { userId: true },
          })
        : [],
      strategyIds.length > 0
        ? prisma.userStrategy.findMany({
            where: {
              strategyId: { in: strategyIds },
              userId: { not: userId },
            },
            select: { userId: true },
          })
        : [],
      stockGroupIds.length > 0
        ? prisma.userStockGroup.findMany({
            where: {
              groupId: { in: stockGroupIds },
              userId: { not: userId },
            },
            select: { userId: true },
          })
        : [],
    ]);

    // Count unique users for each type
    const indicatorUsers = new Set(indicatorImports.map(i => i.userId));
    const strategyUsers = new Set(strategyImports.map(s => s.userId));
    const stockGroupUsers = new Set(stockGroupImports.map(g => g.userId));

    // Also count total imports (not unique users)
    const totalIndicatorImports = indicatorImports.length;
    const totalStrategyImports = strategyImports.length;
    const totalStockGroupImports = stockGroupImports.length;

    return NextResponse.json({
      indicators: {
        created: indicatorIds.length,
        uniqueUsers: indicatorUsers.size,
        totalImports: totalIndicatorImports,
      },
      strategies: {
        created: strategyIds.length,
        uniqueUsers: strategyUsers.size,
        totalImports: totalStrategyImports,
      },
      stockGroups: {
        created: stockGroupIds.length,
        uniqueUsers: stockGroupUsers.size,
        totalImports: totalStockGroupImports,
      },
    });
  } catch (error) {
    console.error('Error fetching profile stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
