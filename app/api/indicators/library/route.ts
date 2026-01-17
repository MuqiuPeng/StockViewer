/**
 * Public indicator library API
 * GET /api/indicators/library - Browse public indicators
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/indicators/library - Browse public indicators
export async function GET(request: Request) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = (page - 1) * limit;

    // Filters
    const query = searchParams.get('q') || '';
    const category = searchParams.get('category') || '';
    const tag = searchParams.get('tag') || '';

    // Sorting
    const sortBy = searchParams.get('sortBy') || 'downloadCount';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    // Build where clause
    const where: any = {
      visibility: 'PUBLIC',
    };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (tag) {
      where.tags = { has: tag };
    }

    // Build orderBy
    const orderBy: any = {};
    if (['name', 'downloadCount', 'rating', 'publishedAt', 'createdAt'].includes(sortBy)) {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.downloadCount = 'desc';
    }

    // Execute queries in parallel
    const [indicators, total, categories, allTags] = await Promise.all([
      prisma.indicator.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          outputColumn: true,
          isGroup: true,
          groupName: true,
          expectedOutputs: true,
          category: true,
          tags: true,
          version: true,
          downloadCount: true,
          rating: true,
          ratingCount: true,
          publishedAt: true,
          createdAt: true,
          owner: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          _count: {
            select: {
              subscriptions: true,
            },
          },
        },
      }),
      prisma.indicator.count({ where }),
      prisma.indicator.findMany({
        where: { visibility: 'PUBLIC', category: { not: null } },
        select: { category: true },
        distinct: ['category'],
      }),
      prisma.indicator.findMany({
        where: { visibility: 'PUBLIC' },
        select: { tags: true },
      }),
    ]);

    // Flatten and deduplicate tags
    const uniqueTags = [...new Set(allTags.flatMap(i => i.tags))].sort();

    return NextResponse.json({
      indicators: indicators.map(ind => ({
        ...ind,
        subscriberCount: ind._count.subscriptions,
        _count: undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        categories: categories.map(c => c.category).filter(Boolean),
        tags: uniqueTags,
      },
    });
  } catch (error) {
    console.error('Error browsing indicator library:', error);
    return NextResponse.json(
      { error: 'Failed to browse indicator library', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
