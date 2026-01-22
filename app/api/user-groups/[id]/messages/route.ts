/**
 * User Group Messages API
 * GET /api/user-groups/:id/messages - Get group chat messages
 * POST /api/user-groups/:id/messages - Send message or share resource
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/user-groups/:id/messages - Get group chat messages
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const group = await prisma.userGroup.findUnique({
      where: { id: params.id },
      include: { members: true },
    });

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check access
    const isOwner = group.ownerId === userId;
    const isMember = group.members.some(m => m.userId === userId);

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Pagination
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const before = searchParams.get('before'); // cursor for pagination

    const where: any = { groupId: params.id };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await prisma.userGroupMessage.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, image: true } },
        indicator: {
          select: {
            id: true,
            name: true,
            description: true,
            outputColumn: true,
            isGroup: true,
            groupName: true,
            dependencies: true,
          },
        },
        strategy: {
          select: {
            id: true,
            name: true,
            description: true,
            strategyType: true,
            dependencies: true,
          },
        },
        stockGroup: {
          select: {
            id: true,
            name: true,
            description: true,
            stockIds: true,
          },
        },
        viewSetting: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Check which shared resources user has already imported
    const indicatorIds = messages.filter(m => m.indicatorId).map(m => m.indicatorId!);
    const strategyIds = messages.filter(m => m.strategyId).map(m => m.strategyId!);
    const stockGroupIds = messages.filter(m => m.stockGroupId).map(m => m.stockGroupId!);
    const viewSettingIds = messages.filter(m => m.viewSettingId).map(m => m.viewSettingId!);

    const [userIndicators, userStrategies, userStockGroups, userViewSettings] = await Promise.all([
      indicatorIds.length > 0
        ? prisma.userIndicator.findMany({
            where: { userId, indicatorId: { in: indicatorIds } },
            select: { indicatorId: true },
          })
        : [],
      strategyIds.length > 0
        ? prisma.userStrategy.findMany({
            where: { userId, strategyId: { in: strategyIds } },
            select: { strategyId: true },
          })
        : [],
      stockGroupIds.length > 0
        ? prisma.userStockGroup.findMany({
            where: { userId, groupId: { in: stockGroupIds } },
            select: { groupId: true },
          })
        : [],
      viewSettingIds.length > 0
        ? prisma.userViewSetting.findMany({
            where: { userId, viewSettingId: { in: viewSettingIds } },
            select: { viewSettingId: true },
          })
        : [],
    ]);

    const importedIndicators = new Set(userIndicators.map(ui => ui.indicatorId));
    const importedStrategies = new Set(userStrategies.map(us => us.strategyId));
    const importedStockGroups = new Set(userStockGroups.map(usg => usg.groupId));
    const importedViewSettings = new Set(userViewSettings.map(uvs => uvs.viewSettingId));

    return NextResponse.json({
      messages: messages.reverse().map(m => ({
        id: m.id,
        user: m.user,
        content: m.content,
        indicator: m.indicator ? { ...m.indicator, isImported: importedIndicators.has(m.indicatorId!) } : null,
        strategy: m.strategy ? { ...m.strategy, isImported: importedStrategies.has(m.strategyId!) } : null,
        stockGroup: m.stockGroup ? { ...m.stockGroup, isImported: importedStockGroups.has(m.stockGroupId!) } : null,
        viewSetting: m.viewSetting ? { ...m.viewSetting, isImported: importedViewSettings.has(m.viewSettingId!) } : null,
        createdAt: m.createdAt.toISOString(),
      })),
      hasMore: messages.length === limit,
    });
  } catch (error) {
    console.error('Error loading messages:', error);
    return NextResponse.json(
      { error: 'Failed to load messages', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/user-groups/:id/messages - Send message or share resource
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const group = await prisma.userGroup.findUnique({
      where: { id: params.id },
      include: { members: true },
    });

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Check access
    const isOwner = group.ownerId === userId;
    const isMember = group.members.some(m => m.userId === userId);

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { content, indicatorId, strategyId, stockGroupId, viewSettingId } = body;

    // Must have content or one resource
    const hasResource = indicatorId || strategyId || stockGroupId || viewSettingId;
    if (!content && !hasResource) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'Message must have content or share a resource' },
        { status: 400 }
      );
    }

    // Verify resource ownership if sharing
    if (indicatorId) {
      const indicator = await prisma.indicator.findUnique({ where: { id: indicatorId } });
      if (!indicator || indicator.createdBy !== userId) {
        return NextResponse.json(
          { error: 'Invalid resource', message: 'You can only share indicators you own' },
          { status: 400 }
        );
      }
    }
    if (strategyId) {
      const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } });
      if (!strategy || strategy.createdBy !== userId) {
        return NextResponse.json(
          { error: 'Invalid resource', message: 'You can only share strategies you own' },
          { status: 400 }
        );
      }
    }
    if (stockGroupId) {
      const stockGroup = await prisma.stockGroup.findUnique({ where: { id: stockGroupId } });
      if (!stockGroup || stockGroup.createdBy !== userId) {
        return NextResponse.json(
          { error: 'Invalid resource', message: 'You can only share stock groups you own' },
          { status: 400 }
        );
      }
    }
    if (viewSettingId) {
      const viewSetting = await prisma.viewSetting.findUnique({ where: { id: viewSettingId } });
      if (!viewSetting || viewSetting.createdBy !== userId) {
        return NextResponse.json(
          { error: 'Invalid resource', message: 'You can only share view settings you own' },
          { status: 400 }
        );
      }
    }

    const message = await prisma.userGroupMessage.create({
      data: {
        groupId: params.id,
        userId,
        content: content?.trim() || null,
        indicatorId: indicatorId || null,
        strategyId: strategyId || null,
        stockGroupId: stockGroupId || null,
        viewSettingId: viewSettingId || null,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        indicator: {
          select: {
            id: true,
            name: true,
            description: true,
            outputColumn: true,
            isGroup: true,
            groupName: true,
            dependencies: true,
          },
        },
        strategy: {
          select: {
            id: true,
            name: true,
            description: true,
            strategyType: true,
            dependencies: true,
          },
        },
        stockGroup: {
          select: {
            id: true,
            name: true,
            description: true,
            stockIds: true,
          },
        },
        viewSetting: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        user: message.user,
        content: message.content,
        indicator: message.indicator ? { ...message.indicator, isImported: true } : null,
        strategy: message.strategy ? { ...message.strategy, isImported: true } : null,
        stockGroup: message.stockGroup ? { ...message.stockGroup, isImported: true } : null,
        viewSetting: message.viewSetting ? { ...message.viewSetting, isImported: true } : null,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
