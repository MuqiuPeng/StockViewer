/**
 * Shared Indicators API
 * GET /api/share/indicators - List shared/public indicators
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
    const category = searchParams.get('category') || '';
    const tag = searchParams.get('tag') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const excludeSubscribed = searchParams.get('excludeSubscribed') === 'true';

    // Build where clause for shared/public indicators not created by user
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

    if (category) {
      where.category = category;
    }

    if (tag) {
      where.tags = { has: tag };
    }

    // Exclude already subscribed indicators if requested
    if (excludeSubscribed) {
      const userIndicators = await prisma.userIndicator.findMany({
        where: { userId },
        select: { indicatorId: true },
      });
      const subscribedIds = userIndicators.map((ui) => ui.indicatorId);

      if (subscribedIds.length > 0) {
        where.id = { notIn: subscribedIds };
      }
    }

    // Get total count
    const totalCount = await prisma.indicator.count({ where });

    // Get indicators
    const indicators = await prisma.indicator.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        outputColumn: true,
        category: true,
        tags: true,
        isGroup: true,
        groupName: true,
        expectedOutputs: true,
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
            userIndicators: true, // Subscriber count
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Get unique categories for filtering
    const categories = await prisma.indicator.groupBy({
      by: ['category'],
      where: {
        createdBy: { not: userId },
        OR: [{ visibleTo: { isEmpty: true } }, { visibleTo: { has: userId } }],
        category: { not: null },
      },
      _count: { category: true },
      orderBy: { category: 'asc' },
    });

    // Check which indicators user has already subscribed to
    const userIndicators = await prisma.userIndicator.findMany({
      where: { userId },
      select: { indicatorId: true },
    });
    const subscribedSet = new Set(userIndicators.map((ui) => ui.indicatorId));

    const indicatorsWithStatus = indicators.map((ind) => ({
      ...ind,
      subscriberCount: ind._count.userIndicators,
      isSubscribed: subscribedSet.has(ind.id),
      _count: undefined,
    }));

    return NextResponse.json({
      indicators: indicatorsWithStatus,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      categories: categories
        .filter((c) => c.category)
        .map((c) => ({
          name: c.category,
          count: c._count.category,
        })),
    });
  } catch (error) {
    console.error('Error listing shared indicators:', error);
    return NextResponse.json(
      { error: 'Failed to list indicators', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
