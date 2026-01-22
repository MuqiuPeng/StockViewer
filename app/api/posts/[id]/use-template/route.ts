/**
 * Use Template API
 * POST /api/posts/:id/use-template - Create a new resource from a post attachment template
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

export const runtime = 'nodejs';

// POST /api/posts/:id/use-template - Create resource from template
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

    const body = await request.json();
    const { attachmentId, newName } = body;

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
    const baseName = newName || snapshot.name || snapshot.strategyName || 'Template';

    // Generate unique name
    const generateUniqueName = async (table: string, name: string): Promise<string> => {
      let uniqueName = name;
      let counter = 1;
      while (true) {
        const existing = await (prisma as any)[table].findUnique({
          where: { name: uniqueName },
        });
        if (!existing) break;
        uniqueName = `${name} (${counter})`;
        counter++;
      }
      return uniqueName;
    };

    let created: any = null;

    switch (attachment.type) {
      case 'indicator': {
        const uniqueName = await generateUniqueName('indicator', baseName);
        created = await prisma.indicator.create({
          data: {
            createdBy: userId,
            name: uniqueName,
            description: snapshot.description || '',
            pythonCode: snapshot.pythonCode || '',
            outputColumn: uniqueName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            dependencies: snapshot.dependencies || [],
            dependencyColumns: snapshot.dependencyColumns || [],
            isGroup: snapshot.isGroup || false,
            groupName: snapshot.groupName || null,
            expectedOutputs: snapshot.expectedOutputs || [],
            externalDatasets: snapshot.externalDatasets || null,
            category: snapshot.category || null,
            tags: snapshot.tags || [],
          },
        });
        // Add to user's collection
        await prisma.userIndicator.create({
          data: { userId, indicatorId: created.id },
        });
        break;
      }
      case 'strategy': {
        const uniqueName = await generateUniqueName('strategy', baseName);
        created = await prisma.strategy.create({
          data: {
            createdBy: userId,
            name: uniqueName,
            description: snapshot.description || '',
            pythonCode: snapshot.pythonCode || '',
            strategyType: snapshot.strategyType || 'single',
            constraints: snapshot.constraints || null,
            parameters: snapshot.parameters || null,
            externalDatasets: snapshot.externalDatasets || null,
            dependencies: snapshot.dependencies || [],
          },
        });
        // Add to user's collection
        await prisma.userStrategy.create({
          data: { userId, strategyId: created.id },
        });
        break;
      }
      case 'stockGroup': {
        const uniqueName = await generateUniqueName('stockGroup', baseName);
        created = await prisma.stockGroup.create({
          data: {
            createdBy: userId,
            name: uniqueName,
            description: snapshot.description || null,
            stockIds: snapshot.stockIds || [],
          },
        });
        // Add to user's collection
        await prisma.userStockGroup.create({
          data: { userId, groupId: created.id },
        });
        break;
      }
      case 'viewSetting': {
        const uniqueName = await generateUniqueName('viewSetting', baseName);
        created = await prisma.viewSetting.create({
          data: {
            createdBy: userId,
            name: uniqueName,
            enabledIndicators1: snapshot.enabledIndicators1 || [],
            enabledIndicators2: snapshot.enabledIndicators2 || [],
            constantLines1: snapshot.constantLines1 || [],
            constantLines2: snapshot.constantLines2 || [],
          },
        });
        // Add to user's collection
        await prisma.userViewSetting.create({
          data: { userId, viewSettingId: created.id },
        });
        break;
      }
      case 'backtestHistory': {
        // For backtest history, we just copy the entry to the user's history
        // The user can then re-run it with the same parameters
        const deps = attachment.dependencies as any;

        // Find or use the strategy
        let strategyId = deps?.strategyId;
        if (strategyId) {
          const existingStrategy = await prisma.strategy.findUnique({
            where: { id: strategyId },
          });
          if (!existingStrategy) {
            strategyId = null;
          }
        }

        created = await prisma.backtestHistoryEntry.create({
          data: {
            userId,
            strategyId: strategyId || '',
            strategyName: snapshot.strategyName || 'Template Strategy',
            strategyType: snapshot.strategyType || 'single',
            target: snapshot.target || {},
            parameters: snapshot.parameters || {},
            result: snapshot.result || {},
            totalReturn: snapshot.totalReturn || 0,
            totalReturnPct: snapshot.totalReturnPct || 0,
            sharpeRatio: snapshot.sharpeRatio || 0,
            tradeCount: snapshot.tradeCount || 0,
            duration: snapshot.duration || 0,
            notes: `[Template from post] ${snapshot.notes || ''}`,
            tags: [...(snapshot.tags || []), 'template'],
          },
        });
        break;
      }
      default:
        return NextResponse.json(
          { error: 'Invalid attachment type' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      message: `Created ${attachment.type} from template`,
      resource: {
        id: created.id,
        name: created.name || created.strategyName,
        type: attachment.type,
      },
    });
  } catch (error) {
    console.error('Error using template:', error);
    return NextResponse.json(
      { error: 'Failed to use template', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
