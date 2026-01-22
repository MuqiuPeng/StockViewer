/**
 * Posts API
 * GET /api/posts - List all posts
 * POST /api/posts - Create a new post with attachments
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/posts - List posts
export async function GET(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
    const before = searchParams.get('before');

    const where: any = {};
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const posts = await prisma.post.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, image: true } },
        images: { orderBy: { position: 'asc' } },
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      posts: posts.map(p => ({
        id: p.id,
        user: p.user,
        content: p.content,
        images: p.images,
        attachments: p.attachments.map(a => ({
          id: a.id,
          type: a.type,
          originalId: a.originalId,
          originalName: a.originalName,
          snapshot: a.snapshot,
          dependencies: a.dependencies,
        })),
        createdAt: p.createdAt.toISOString(),
      })),
      hasMore: posts.length === limit,
    });
  } catch (error) {
    console.error('Error listing posts:', error);
    return NextResponse.json(
      { error: 'Failed to list posts', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/posts - Create a post
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { content, images, attachments } = body;

    // Validate: must have content or images or attachments
    if (!content && (!images || images.length === 0) && (!attachments || attachments.length === 0)) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'Post must have content, images, or attachments' },
        { status: 400 }
      );
    }

    // Build attachments with snapshots
    const attachmentData = [];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        let snapshot: any = null;
        let dependencies: any = null;

        switch (att.type) {
          case 'indicator': {
            const indicator = await prisma.indicator.findUnique({
              where: { id: att.id },
              select: {
                id: true,
                name: true,
                description: true,
                pythonCode: true,
                outputColumn: true,
                dependencies: true,
                dependencyColumns: true,
                isGroup: true,
                groupName: true,
                expectedOutputs: true,
                externalDatasets: true,
                category: true,
                tags: true,
              },
            });
            if (!indicator) {
              return NextResponse.json(
                { error: 'Indicator not found', message: `Indicator ${att.id} not found` },
                { status: 404 }
              );
            }
            snapshot = indicator;
            break;
          }
          case 'strategy': {
            const strategy = await prisma.strategy.findUnique({
              where: { id: att.id },
              select: {
                id: true,
                name: true,
                description: true,
                pythonCode: true,
                strategyType: true,
                constraints: true,
                parameters: true,
                externalDatasets: true,
                dependencies: true,
              },
            });
            if (!strategy) {
              return NextResponse.json(
                { error: 'Strategy not found', message: `Strategy ${att.id} not found` },
                { status: 404 }
              );
            }
            snapshot = strategy;
            break;
          }
          case 'stockGroup': {
            const group = await prisma.stockGroup.findUnique({
              where: { id: att.id },
              select: {
                id: true,
                name: true,
                description: true,
                stockIds: true,
              },
            });
            if (!group) {
              return NextResponse.json(
                { error: 'Stock group not found', message: `Stock group ${att.id} not found` },
                { status: 404 }
              );
            }
            snapshot = group;
            break;
          }
          case 'viewSetting': {
            const viewSetting = await prisma.viewSetting.findUnique({
              where: { id: att.id },
              select: {
                id: true,
                name: true,
                enabledIndicators1: true,
                enabledIndicators2: true,
                constantLines1: true,
                constantLines2: true,
              },
            });
            if (!viewSetting) {
              return NextResponse.json(
                { error: 'View setting not found', message: `View setting ${att.id} not found` },
                { status: 404 }
              );
            }
            snapshot = viewSetting;
            break;
          }
          case 'backtestHistory': {
            const history = await prisma.backtestHistoryEntry.findUnique({
              where: { id: att.id },
              include: {
                strategy: {
                  select: { id: true, name: true },
                },
              },
            });
            if (!history) {
              return NextResponse.json(
                { error: 'Backtest history not found', message: `Backtest history ${att.id} not found` },
                { status: 404 }
              );
            }
            // Check ownership
            if (history.userId !== userId) {
              return NextResponse.json(
                { error: 'Permission denied', message: 'You can only share your own backtest history' },
                { status: 403 }
              );
            }
            snapshot = {
              id: history.id,
              strategyName: history.strategyName,
              strategyType: history.strategyType,
              target: history.target,
              parameters: history.parameters,
              result: history.result,
              totalReturn: history.totalReturn,
              totalReturnPct: history.totalReturnPct,
              sharpeRatio: history.sharpeRatio,
              tradeCount: history.tradeCount,
              duration: history.duration,
              notes: history.notes,
              tags: history.tags,
            };
            // Build dependencies
            const target = history.target as any;
            dependencies = {
              strategyId: history.strategyId,
              strategyName: history.strategyName,
              stockIds: target?.stockIds || [],
              stockGroupId: target?.groupId || null,
              stockGroupName: target?.groupName || null,
            };
            break;
          }
          default:
            return NextResponse.json(
              { error: 'Invalid attachment type', message: `Unknown type: ${att.type}` },
              { status: 400 }
            );
        }

        attachmentData.push({
          type: att.type,
          originalId: att.id,
          originalName: snapshot.name || snapshot.strategyName || 'Unnamed',
          snapshot,
          dependencies,
        });
      }
    }

    // Create the post
    const post = await prisma.post.create({
      data: {
        userId,
        content: content?.trim() || null,
        images: images && images.length > 0 ? {
          create: images.map((img: any, i: number) => ({
            url: img.url,
            caption: img.caption || null,
            position: i,
          })),
        } : undefined,
        attachments: attachmentData.length > 0 ? {
          create: attachmentData,
        } : undefined,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        images: { orderBy: { position: 'asc' } },
        attachments: true,
      },
    });

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        user: post.user,
        content: post.content,
        images: post.images,
        attachments: post.attachments.map(a => ({
          id: a.id,
          type: a.type,
          originalId: a.originalId,
          originalName: a.originalName,
          snapshot: a.snapshot,
          dependencies: a.dependencies,
        })),
        createdAt: post.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json(
      { error: 'Failed to create post', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
