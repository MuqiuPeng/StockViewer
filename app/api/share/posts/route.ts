/**
 * Share Posts API
 * GET /api/share/posts - List all share posts
 * POST /api/share/posts - Create a new share post
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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type'); // 'dataset', 'indicator', 'strategy', or null for all

    // Build where clause
    const where: Record<string, unknown> = {};
    if (type === 'dataset') {
      where.stockId = { not: null };
    } else if (type === 'indicator') {
      where.indicatorId = { not: null };
    } else if (type === 'strategy') {
      where.strategyId = { not: null };
    }

    // Get total count
    const total = await prisma.sharePost.count({ where });

    // Get posts with related data
    const posts = await prisma.sharePost.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        stock: {
          select: {
            id: true,
            symbol: true,
            name: true,
            dataSource: true,
            rowCount: true,
            firstDate: true,
            lastDate: true,
          },
        },
        indicator: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            tags: true,
          },
        },
        strategy: {
          select: {
            id: true,
            name: true,
            description: true,
            strategyType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Check if user has already imported each shared item
    const postsWithImportStatus = await Promise.all(
      posts.map(async (post) => {
        let isImported = false;

        if (post.stockId) {
          const userStock = await prisma.userStock.findUnique({
            where: { userId_stockId: { userId, stockId: post.stockId } },
          });
          isImported = !!userStock;
        } else if (post.indicatorId) {
          const userIndicator = await prisma.userIndicator.findUnique({
            where: { userId_indicatorId: { userId, indicatorId: post.indicatorId } },
          });
          isImported = !!userIndicator;
        } else if (post.strategyId) {
          const userStrategy = await prisma.userStrategy.findUnique({
            where: { userId_strategyId: { userId, strategyId: post.strategyId } },
          });
          isImported = !!userStrategy;
        }

        return {
          ...post,
          isImported,
          isOwner: post.userId === userId,
        };
      })
    );

    return NextResponse.json({
      posts: postsWithImportStatus,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing share posts:', error);
    return NextResponse.json(
      { error: 'Failed to list posts', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { title, content, type, itemId } = body;

    // Validate required fields
    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: 'Missing title', message: 'Title is required' },
        { status: 400 }
      );
    }

    if (!type || !['dataset', 'indicator', 'strategy'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type', message: 'Type must be dataset, indicator, or strategy' },
        { status: 400 }
      );
    }

    if (!itemId) {
      return NextResponse.json(
        { error: 'Missing itemId', message: 'Item ID is required' },
        { status: 400 }
      );
    }

    // Verify the item exists and user has access
    let stockId: string | null = null;
    let indicatorId: string | null = null;
    let strategyId: string | null = null;

    if (type === 'dataset') {
      // Check if user owns this stock
      const userStock = await prisma.userStock.findFirst({
        where: { userId, stockId: itemId },
      });
      if (!userStock) {
        return NextResponse.json(
          { error: 'Not found', message: 'Dataset not found in your collection' },
          { status: 404 }
        );
      }
      stockId = itemId;
    } else if (type === 'indicator') {
      // Check if user owns or created this indicator
      const indicator = await prisma.indicator.findFirst({
        where: {
          id: itemId,
          OR: [
            { createdBy: userId },
            { userIndicators: { some: { userId } } },
          ],
        },
      });
      if (!indicator) {
        return NextResponse.json(
          { error: 'Not found', message: 'Indicator not found in your collection' },
          { status: 404 }
        );
      }
      indicatorId = itemId;
    } else if (type === 'strategy') {
      // Check if user owns or created this strategy
      const strategy = await prisma.strategy.findFirst({
        where: {
          id: itemId,
          OR: [
            { createdBy: userId },
            { userStrategies: { some: { userId } } },
          ],
        },
      });
      if (!strategy) {
        return NextResponse.json(
          { error: 'Not found', message: 'Strategy not found in your collection' },
          { status: 404 }
        );
      }
      strategyId = itemId;
    }

    // Create the post
    const post = await prisma.sharePost.create({
      data: {
        userId,
        title: title.trim(),
        content: content?.trim() || null,
        stockId,
        indicatorId,
        strategyId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        stock: {
          select: {
            id: true,
            symbol: true,
            name: true,
            dataSource: true,
          },
        },
        indicator: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        strategy: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Post created successfully',
      post,
    });
  } catch (error) {
    console.error('Error creating share post:', error);
    return NextResponse.json(
      { error: 'Failed to create post', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
