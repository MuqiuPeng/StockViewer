/**
 * Subscription Posts API
 * GET /api/subscription/posts - List all share posts with subscription status
 * POST /api/subscription/posts - Create a new share post
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
    const search = searchParams.get('search'); // Search in title/content
    const userEmail = searchParams.get('userEmail'); // Filter by user email
    const dateFrom = searchParams.get('dateFrom'); // Filter by date range
    const dateTo = searchParams.get('dateTo');

    // Build where clause
    const where: Record<string, unknown> = {};
    if (type === 'dataset') {
      where.stockId = { not: null };
    } else if (type === 'indicator') {
      where.indicatorId = { not: null };
    } else if (type === 'strategy') {
      where.strategyId = { not: null };
    }

    // Search in title or content
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { content: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    // Filter by user email
    if (userEmail && userEmail.trim()) {
      where.user = {
        email: { contains: userEmail.trim(), mode: 'insensitive' },
      };
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        (where.createdAt as Record<string, Date>).gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Include the entire end day
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        (where.createdAt as Record<string, Date>).lte = endDate;
      }
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

    // Check subscription status and subscriber count for each post
    const postsWithStatus = await Promise.all(
      posts.map(async (post) => {
        let isSubscribed = false;
        let subscriberCount = 0;

        if (post.stockId) {
          // Check if user has subscribed to this dataset
          const userStock = await prisma.userStock.findUnique({
            where: { userId_stockId: { userId, stockId: post.stockId } },
          });
          isSubscribed = !!userStock;

          // Count subscribers (users who have this stock, excluding the owner)
          subscriberCount = await prisma.userStock.count({
            where: {
              stockId: post.stockId,
              userId: { not: post.userId },
            },
          });
        } else if (post.indicatorId) {
          // Check if user has subscribed to this indicator
          const userIndicator = await prisma.userIndicator.findUnique({
            where: { userId_indicatorId: { userId, indicatorId: post.indicatorId } },
          });
          isSubscribed = !!userIndicator;

          // Count subscribers (excluding the creator)
          const indicator = await prisma.indicator.findUnique({
            where: { id: post.indicatorId },
            select: { createdBy: true },
          });
          if (indicator) {
            subscriberCount = await prisma.userIndicator.count({
              where: {
                indicatorId: post.indicatorId,
                userId: { not: indicator.createdBy },
              },
            });
          }
        } else if (post.strategyId) {
          // Check if user has subscribed to this strategy
          const userStrategy = await prisma.userStrategy.findUnique({
            where: { userId_strategyId: { userId, strategyId: post.strategyId } },
          });
          isSubscribed = !!userStrategy;

          // Count subscribers (excluding the creator)
          const strategy = await prisma.strategy.findUnique({
            where: { id: post.strategyId },
            select: { createdBy: true },
          });
          if (strategy) {
            subscriberCount = await prisma.userStrategy.count({
              where: {
                strategyId: post.strategyId,
                userId: { not: strategy.createdBy },
              },
            });
          }
        }

        return {
          ...post,
          isSubscribed,
          isOwner: post.userId === userId,
          subscriberCount,
        };
      })
    );

    return NextResponse.json({
      posts: postsWithStatus,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing subscription posts:', error);
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

    // Verify the item exists and user has access (must be the creator/owner)
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
      // Check if user created this indicator (only creators can share)
      const indicator = await prisma.indicator.findFirst({
        where: {
          id: itemId,
          createdBy: userId,
        },
      });
      if (!indicator) {
        return NextResponse.json(
          { error: 'Not found', message: 'Indicator not found or you are not the creator' },
          { status: 404 }
        );
      }
      indicatorId = itemId;
    } else if (type === 'strategy') {
      // Check if user created this strategy (only creators can share)
      const strategy = await prisma.strategy.findFirst({
        where: {
          id: itemId,
          createdBy: userId,
        },
      });
      if (!strategy) {
        return NextResponse.json(
          { error: 'Not found', message: 'Strategy not found or you are not the creator' },
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
