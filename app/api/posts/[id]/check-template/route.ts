/**
 * Check Template API
 * GET /api/posts/:id/check-template - Check name conflicts before importing template
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

interface ImportItem {
  id: string;
  type: 'indicator' | 'strategy' | 'stockGroup' | 'viewSetting' | 'backtestHistory';
  originalName: string;
  suggestedName: string;
  hasConflict: boolean;
  isDependency: boolean;
}

// GET /api/posts/:id/check-template - Check conflicts for template import
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

    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('attachmentId');

    if (!attachmentId) {
      return NextResponse.json(
        { error: 'Invalid input', message: 'attachmentId is required' },
        { status: 400 }
      );
    }

    // Find the attachment
    const attachment = await prisma.postAttachment.findUnique({
      where: { id: attachmentId },
      include: { post: true },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    if (attachment.postId !== params.id) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Attachment does not belong to this post' },
        { status: 400 }
      );
    }

    const snapshot = attachment.snapshot as any;
    const dependencies = attachment.dependencies as any;
    const items: ImportItem[] = [];

    // Helper to check if name exists for user's collection
    const checkNameConflict = async (type: string, name: string): Promise<boolean> => {
      switch (type) {
        case 'indicator': {
          // Get user's indicators
          const userIndicators = await prisma.userIndicator.findMany({
            where: { userId },
            include: { indicator: { select: { name: true } } },
          });
          return userIndicators.some(ui => ui.indicator.name === name);
        }
        case 'strategy': {
          const userStrategies = await prisma.userStrategy.findMany({
            where: { userId },
            include: { strategy: { select: { name: true } } },
          });
          return userStrategies.some(us => us.strategy.name === name);
        }
        case 'stockGroup': {
          const userGroups = await prisma.userStockGroup.findMany({
            where: { userId },
            include: { group: { select: { name: true } } },
          });
          return userGroups.some(ug => ug.group.name === name);
        }
        case 'viewSetting': {
          const userSettings = await prisma.userViewSetting.findMany({
            where: { userId },
            include: { viewSetting: { select: { name: true } } },
          });
          return userSettings.some(uvs => uvs.viewSetting.name === name);
        }
        default:
          return false;
      }
    };

    // Helper to generate unique name suggestion
    const suggestUniqueName = async (type: string, baseName: string): Promise<string> => {
      let name = baseName;
      let counter = 1;
      while (await checkNameConflict(type, name)) {
        name = `${baseName} (${counter})`;
        counter++;
      }
      return name;
    };

    // Add main item
    const mainName = snapshot.name || snapshot.strategyName || 'Template';
    const mainHasConflict = await checkNameConflict(attachment.type, mainName);
    items.push({
      id: attachment.id,
      type: attachment.type as ImportItem['type'],
      originalName: mainName,
      suggestedName: mainHasConflict ? await suggestUniqueName(attachment.type, mainName) : mainName,
      hasConflict: mainHasConflict,
      isDependency: false,
    });

    // Check dependencies based on type
    if (attachment.type === 'indicator' && snapshot.dependencies?.length > 0) {
      // Get indicator dependencies from snapshot
      for (const depId of snapshot.dependencies) {
        // Try to find the dependency indicator in the database
        const depIndicator = await prisma.indicator.findUnique({
          where: { id: depId },
        });
        if (depIndicator) {
          const hasConflict = await checkNameConflict('indicator', depIndicator.name);
          items.push({
            id: depId,
            type: 'indicator',
            originalName: depIndicator.name,
            suggestedName: hasConflict ? await suggestUniqueName('indicator', depIndicator.name) : depIndicator.name,
            hasConflict,
            isDependency: true,
          });
        }
      }
    }

    if (attachment.type === 'strategy' && snapshot.dependencies?.length > 0) {
      // Get indicator dependencies from snapshot
      for (const depId of snapshot.dependencies) {
        const depIndicator = await prisma.indicator.findUnique({
          where: { id: depId },
        });
        if (depIndicator) {
          const hasConflict = await checkNameConflict('indicator', depIndicator.name);
          items.push({
            id: depId,
            type: 'indicator',
            originalName: depIndicator.name,
            suggestedName: hasConflict ? await suggestUniqueName('indicator', depIndicator.name) : depIndicator.name,
            hasConflict,
            isDependency: true,
          });
        }
      }
    }

    // For backtest history, include strategy and stock group dependencies
    if (attachment.type === 'backtestHistory' && dependencies) {
      if (dependencies.strategyId) {
        const strategy = await prisma.strategy.findUnique({
          where: { id: dependencies.strategyId },
        });
        if (strategy) {
          const hasConflict = await checkNameConflict('strategy', strategy.name);
          items.push({
            id: dependencies.strategyId,
            type: 'strategy',
            originalName: strategy.name,
            suggestedName: hasConflict ? await suggestUniqueName('strategy', strategy.name) : strategy.name,
            hasConflict,
            isDependency: true,
          });

          // Also check strategy's indicator dependencies
          const strategyDeps = strategy.dependencies as string[] || [];
          for (const depId of strategyDeps) {
            const depIndicator = await prisma.indicator.findUnique({
              where: { id: depId },
            });
            if (depIndicator) {
              const hasConflict = await checkNameConflict('indicator', depIndicator.name);
              items.push({
                id: depId,
                type: 'indicator',
                originalName: depIndicator.name,
                suggestedName: hasConflict ? await suggestUniqueName('indicator', depIndicator.name) : depIndicator.name,
                hasConflict,
                isDependency: true,
              });
            }
          }
        }
      }

      if (dependencies.stockGroupId) {
        const group = await prisma.stockGroup.findUnique({
          where: { id: dependencies.stockGroupId },
        });
        if (group) {
          const hasConflict = await checkNameConflict('stockGroup', group.name);
          items.push({
            id: dependencies.stockGroupId,
            type: 'stockGroup',
            originalName: group.name,
            suggestedName: hasConflict ? await suggestUniqueName('stockGroup', group.name) : group.name,
            hasConflict,
            isDependency: true,
          });
        }
      }
    }

    return NextResponse.json({
      items,
      hasConflicts: items.some(item => item.hasConflict),
    });
  } catch (error) {
    console.error('Error checking template:', error);
    return NextResponse.json(
      { error: 'Failed to check template', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
