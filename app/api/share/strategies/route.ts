/**
 * Shared Strategies API
 * GET /api/share/strategies - List shared/public strategies
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
    const strategyType = searchParams.get('strategyType') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const excludeSubscribed = searchParams.get('excludeSubscribed') === 'true';

    // Build where clause for shared/public strategies not created by user
    const where: any = {
      createdBy: { not: userId }, // Not created by current user
      OR: [
        { visibleTo: { isEmpty: true } }, // Public
        { visibleTo: { has: userId } }, // Shared with user
      ],
    };

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (strategyType) {
      where.strategyType = strategyType;
    }

    // Exclude already subscribed strategies if requested
    if (excludeSubscribed) {
      const userStrategies = await prisma.userStrategy.findMany({
        where: { userId },
        select: { strategyId: true },
      });
      const subscribedIds = userStrategies.map((us) => us.strategyId);

      if (subscribedIds.length > 0) {
        where.id = { notIn: subscribedIds };
      }
    }

    // Get total count
    const totalCount = await prisma.strategy.count({ where });

    // Get strategies
    const strategies = await prisma.strategy.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        strategyType: true,
        createdAt: true,
        creator: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        _count: {
          select: {
            userStrategies: true, // Subscriber count
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Get unique strategy types for filtering
    const strategyTypes = await prisma.strategy.groupBy({
      by: ['strategyType'],
      where: {
        createdBy: { not: userId },
        OR: [{ visibleTo: { isEmpty: true } }, { visibleTo: { has: userId } }],
      },
      _count: { strategyType: true },
      orderBy: { strategyType: 'asc' },
    });

    // Check which strategies user has already subscribed to
    const userStrategies = await prisma.userStrategy.findMany({
      where: { userId },
      select: { strategyId: true },
    });
    const subscribedSet = new Set(userStrategies.map((us) => us.strategyId));

    const strategiesWithStatus = strategies.map((strat) => ({
      ...strat,
      subscriberCount: strat._count.userStrategies,
      isSubscribed: subscribedSet.has(strat.id),
      _count: undefined,
    }));

    return NextResponse.json({
      strategies: strategiesWithStatus,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      strategyTypes: strategyTypes.map((st) => ({
        name: st.strategyType,
        count: st._count.strategyType,
      })),
    });
  } catch (error) {
    console.error('Error listing shared strategies:', error);
    return NextResponse.json(
      { error: 'Failed to list strategies', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
