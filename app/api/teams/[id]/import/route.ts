/**
 * Import Shared Resource API
 * POST /api/teams/:id/import - Import a shared resource from team chat
 *
 * When importing indicators or strategies, all dependencies are automatically imported as well.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// Helper: Recursively collect all indicator dependencies
async function collectIndicatorDependencies(
  indicatorId: string,
  collected: Set<string> = new Set()
): Promise<Set<string>> {
  if (collected.has(indicatorId)) return collected;
  collected.add(indicatorId);

  const indicator = await prisma.indicator.findUnique({
    where: { id: indicatorId },
    select: { dependencies: true },
  });

  if (indicator?.dependencies && indicator.dependencies.length > 0) {
    // Find indicators by name
    const depIndicators = await prisma.indicator.findMany({
      where: { name: { in: indicator.dependencies } },
      select: { id: true },
    });

    for (const dep of depIndicators) {
      await collectIndicatorDependencies(dep.id, collected);
    }
  }

  return collected;
}

// Helper: Collect strategy dependencies (indicators)
async function collectStrategyDependencies(strategyId: string): Promise<Set<string>> {
  const strategy = await prisma.strategy.findUnique({
    where: { id: strategyId },
    select: { dependencies: true },
  });

  const indicatorIds = new Set<string>();

  if (strategy?.dependencies && strategy.dependencies.length > 0) {
    // Find indicators by name
    const depIndicators = await prisma.indicator.findMany({
      where: { name: { in: strategy.dependencies } },
      select: { id: true },
    });

    for (const dep of depIndicators) {
      // Also collect transitive dependencies of each indicator
      const transitiveDeps = await collectIndicatorDependencies(dep.id);
      transitiveDeps.forEach(id => indicatorIds.add(id));
    }
  }

  return indicatorIds;
}

// POST /api/teams/:id/import - Import a shared resource
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

    const team = await prisma.team.findUnique({
      where: { id: params.id },
      include: { members: true },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Check access
    const isOwner = team.ownerId === userId;
    const isMember = team.members.some(m => m.userId === userId);

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

    // Verify the resource was shared in this team
    const sharedMessage = await prisma.teamMessage.findFirst({
      where: {
        teamId: params.id,
        ...(type === 'indicator' && { indicatorId: resourceId }),
        ...(type === 'strategy' && { strategyId: resourceId }),
        ...(type === 'stockGroup' && { stockGroupId: resourceId }),
        ...(type === 'viewSetting' && { viewSettingId: resourceId }),
      },
    });

    if (!sharedMessage) {
      return NextResponse.json(
        { error: 'Resource not found', message: 'This resource has not been shared in this team' },
        { status: 404 }
      );
    }

    const imported: Array<{ name: string; type: string }> = [];
    const alreadyHad: string[] = [];

    switch (type) {
      case 'indicator': {
        const indicator = await prisma.indicator.findUnique({ where: { id: resourceId } });
        if (!indicator) {
          return NextResponse.json({ error: 'Indicator not found' }, { status: 404 });
        }

        // Collect all dependencies (including the main indicator)
        const allIndicatorIds = await collectIndicatorDependencies(resourceId);

        // Get all indicator names for reporting
        const allIndicators = await prisma.indicator.findMany({
          where: { id: { in: Array.from(allIndicatorIds) } },
          select: { id: true, name: true },
        });

        // Check which ones user already has
        const existing = await prisma.userIndicator.findMany({
          where: {
            userId,
            indicatorId: { in: Array.from(allIndicatorIds) },
          },
          select: { indicatorId: true },
        });
        const existingIds = new Set(existing.map(e => e.indicatorId));

        // Import missing ones
        const toImport = allIndicators.filter(i => !existingIds.has(i.id));

        if (toImport.length > 0) {
          await prisma.userIndicator.createMany({
            data: toImport.map(i => ({ userId, indicatorId: i.id })),
            skipDuplicates: true,
          });
          toImport.forEach(i => imported.push({ name: i.name, type: 'indicator' }));
        }

        allIndicators.filter(i => existingIds.has(i.id)).forEach(i => alreadyHad.push(i.name));
        break;
      }

      case 'strategy': {
        const strategy = await prisma.strategy.findUnique({ where: { id: resourceId } });
        if (!strategy) {
          return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }

        // Check if strategy already exists
        const existingStrategy = await prisma.userStrategy.findUnique({
          where: { userId_strategyId: { userId, strategyId: resourceId } },
        });

        if (!existingStrategy) {
          await prisma.userStrategy.create({
            data: { userId, strategyId: resourceId },
          });
          imported.push({ name: strategy.name, type: 'strategy' });
        } else {
          alreadyHad.push(strategy.name);
        }

        // Collect and import all indicator dependencies
        const indicatorIds = await collectStrategyDependencies(resourceId);

        if (indicatorIds.size > 0) {
          const allIndicators = await prisma.indicator.findMany({
            where: { id: { in: Array.from(indicatorIds) } },
            select: { id: true, name: true },
          });

          const existing = await prisma.userIndicator.findMany({
            where: {
              userId,
              indicatorId: { in: Array.from(indicatorIds) },
            },
            select: { indicatorId: true },
          });
          const existingIds = new Set(existing.map(e => e.indicatorId));

          const toImport = allIndicators.filter(i => !existingIds.has(i.id));

          if (toImport.length > 0) {
            await prisma.userIndicator.createMany({
              data: toImport.map(i => ({ userId, indicatorId: i.id })),
              skipDuplicates: true,
            });
            toImport.forEach(i => imported.push({ name: i.name, type: 'indicator' }));
          }

          allIndicators.filter(i => existingIds.has(i.id)).forEach(i => {
            if (!alreadyHad.includes(i.name)) alreadyHad.push(i.name);
          });
        }
        break;
      }

      case 'stockGroup': {
        const stockGroup = await prisma.stockGroup.findUnique({ where: { id: resourceId } });
        if (!stockGroup) {
          return NextResponse.json({ error: 'Stock group not found' }, { status: 404 });
        }
        const existingStockGroup = await prisma.userStockGroup.findUnique({
          where: { userId_groupId: { userId, groupId: resourceId } },
        });
        if (!existingStockGroup) {
          await prisma.userStockGroup.create({
            data: { userId, groupId: resourceId },
          });
          imported.push({ name: stockGroup.name, type: 'stockGroup' });
        } else {
          alreadyHad.push(stockGroup.name);
        }
        break;
      }

      case 'viewSetting': {
        const viewSetting = await prisma.viewSetting.findUnique({ where: { id: resourceId } });
        if (!viewSetting) {
          return NextResponse.json({ error: 'View setting not found' }, { status: 404 });
        }
        const existingViewSetting = await prisma.userViewSetting.findUnique({
          where: { userId_viewSettingId: { userId, viewSettingId: resourceId } },
        });
        if (!existingViewSetting) {
          await prisma.userViewSetting.create({
            data: { userId, viewSettingId: resourceId },
          });
          imported.push({ name: viewSetting.name, type: 'viewSetting' });
        } else {
          alreadyHad.push(viewSetting.name);
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: 'Invalid type', message: 'type must be indicator, strategy, stockGroup, or viewSetting' },
          { status: 400 }
        );
    }

    // Build response message
    let message = '';
    if (imported.length > 0) {
      const names = imported.map(i => i.name).join(', ');
      message = `Imported: ${names}`;
    }
    if (alreadyHad.length > 0 && imported.length === 0) {
      message = 'All items are already in your collection';
    }

    return NextResponse.json({
      success: true,
      message,
      imported,
      alreadyHad,
    });
  } catch (error) {
    console.error('Error importing resource:', error);
    return NextResponse.json(
      { error: 'Failed to import resource', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
