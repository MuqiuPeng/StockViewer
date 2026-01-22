/**
 * Import Shared Resource API
 * POST /api/user-groups/:id/import - Import a shared resource from group chat
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// POST /api/user-groups/:id/import - Import a shared resource
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
    const { type, resourceId } = body;

    if (!type || !resourceId) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'type and resourceId are required' },
        { status: 400 }
      );
    }

    // Verify the resource was shared in this group
    const sharedMessage = await prisma.userGroupMessage.findFirst({
      where: {
        groupId: params.id,
        ...(type === 'indicator' && { indicatorId: resourceId }),
        ...(type === 'strategy' && { strategyId: resourceId }),
        ...(type === 'stockGroup' && { stockGroupId: resourceId }),
        ...(type === 'viewSetting' && { viewSettingId: resourceId }),
      },
    });

    if (!sharedMessage) {
      return NextResponse.json(
        { error: 'Resource not found', message: 'This resource has not been shared in this group' },
        { status: 404 }
      );
    }

    let result: any = null;

    switch (type) {
      case 'indicator':
        const indicator = await prisma.indicator.findUnique({ where: { id: resourceId } });
        if (!indicator) {
          return NextResponse.json({ error: 'Indicator not found' }, { status: 404 });
        }
        // Check if already in collection
        const existingIndicator = await prisma.userIndicator.findUnique({
          where: { userId_indicatorId: { userId, indicatorId: resourceId } },
        });
        if (existingIndicator) {
          return NextResponse.json(
            { error: 'Already imported', message: 'This indicator is already in your collection' },
            { status: 400 }
          );
        }
        await prisma.userIndicator.create({
          data: { userId, indicatorId: resourceId },
        });
        result = { name: indicator.name, type: 'indicator' };
        break;

      case 'strategy':
        const strategy = await prisma.strategy.findUnique({ where: { id: resourceId } });
        if (!strategy) {
          return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }
        const existingStrategy = await prisma.userStrategy.findUnique({
          where: { userId_strategyId: { userId, strategyId: resourceId } },
        });
        if (existingStrategy) {
          return NextResponse.json(
            { error: 'Already imported', message: 'This strategy is already in your collection' },
            { status: 400 }
          );
        }
        await prisma.userStrategy.create({
          data: { userId, strategyId: resourceId },
        });
        result = { name: strategy.name, type: 'strategy' };
        break;

      case 'stockGroup':
        const stockGroup = await prisma.stockGroup.findUnique({ where: { id: resourceId } });
        if (!stockGroup) {
          return NextResponse.json({ error: 'Stock group not found' }, { status: 404 });
        }
        const existingStockGroup = await prisma.userStockGroup.findUnique({
          where: { userId_groupId: { userId, groupId: resourceId } },
        });
        if (existingStockGroup) {
          return NextResponse.json(
            { error: 'Already imported', message: 'This stock group is already in your collection' },
            { status: 400 }
          );
        }
        await prisma.userStockGroup.create({
          data: { userId, groupId: resourceId },
        });
        result = { name: stockGroup.name, type: 'stockGroup' };
        break;

      case 'viewSetting':
        const viewSetting = await prisma.viewSetting.findUnique({ where: { id: resourceId } });
        if (!viewSetting) {
          return NextResponse.json({ error: 'View setting not found' }, { status: 404 });
        }
        const existingViewSetting = await prisma.userViewSetting.findUnique({
          where: { userId_viewSettingId: { userId, viewSettingId: resourceId } },
        });
        if (existingViewSetting) {
          return NextResponse.json(
            { error: 'Already imported', message: 'This view setting is already in your collection' },
            { status: 400 }
          );
        }
        await prisma.userViewSetting.create({
          data: { userId, viewSettingId: resourceId },
        });
        result = { name: viewSetting.name, type: 'viewSetting' };
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid type', message: 'type must be indicator, strategy, stockGroup, or viewSetting' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      message: `${result.name} has been added to your collection`,
      imported: result,
    });
  } catch (error) {
    console.error('Error importing resource:', error);
    return NextResponse.json(
      { error: 'Failed to import resource', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
