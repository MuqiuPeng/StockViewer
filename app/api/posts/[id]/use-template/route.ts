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
    const { attachmentId, renamedItems } = body;

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

    // Get the name for an item (from renamedItems or original)
    const getName = (id: string, originalName: string): string => {
      return renamedItems?.[id] || originalName;
    };

    // Track created resources for dependency mapping
    const createdResources: Record<string, { id: string; type: string }> = {};
    const importedItems: { id: string; name: string; type: string }[] = [];

    // Helper to add user subscription
    const addToUserCollection = async (type: string, resourceId: string) => {
      switch (type) {
        case 'indicator':
          await prisma.userIndicator.upsert({
            where: { userId_indicatorId: { userId, indicatorId: resourceId } },
            update: {},
            create: { userId, indicatorId: resourceId },
          });
          break;
        case 'strategy':
          await prisma.userStrategy.upsert({
            where: { userId_strategyId: { userId, strategyId: resourceId } },
            update: {},
            create: { userId, strategyId: resourceId },
          });
          break;
        case 'stockGroup':
          await prisma.userStockGroup.upsert({
            where: { userId_groupId: { userId, groupId: resourceId } },
            update: {},
            create: { userId, groupId: resourceId },
          });
          break;
        case 'viewSetting':
          await prisma.userViewSetting.upsert({
            where: { userId_viewSettingId: { userId, viewSettingId: resourceId } },
            update: {},
            create: { userId, viewSettingId: resourceId },
          });
          break;
      }
    };

    // Import indicator dependencies first (for both indicator and strategy types)
    const indicatorDeps = snapshot.dependencies as string[] || [];
    for (const depId of indicatorDeps) {
      const depIndicator = await prisma.indicator.findUnique({
        where: { id: depId },
      });
      if (depIndicator) {
        const newName = getName(depId, depIndicator.name);

        // Check if user already has this indicator
        const existingUserInd = await prisma.userIndicator.findUnique({
          where: { userId_indicatorId: { userId, indicatorId: depId } },
        });

        if (existingUserInd) {
          // Already subscribed, just track it
          createdResources[depId] = { id: depId, type: 'indicator' };
        } else {
          // Create new indicator with new name
          const newIndicator = await prisma.indicator.create({
            data: {
              createdBy: userId,
              name: newName,
              description: depIndicator.description,
              pythonCode: depIndicator.pythonCode,
              outputColumn: newName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
              dependencies: depIndicator.dependencies as string[] || [],
              dependencyColumns: depIndicator.dependencyColumns as string[] || [],
              isGroup: depIndicator.isGroup,
              groupName: depIndicator.groupName,
              expectedOutputs: depIndicator.expectedOutputs as string[] || [],
              externalDatasets: depIndicator.externalDatasets ?? undefined,
              category: depIndicator.category,
              tags: depIndicator.tags as string[] || [],
            },
          });
          await addToUserCollection('indicator', newIndicator.id);
          createdResources[depId] = { id: newIndicator.id, type: 'indicator' };
          importedItems.push({ id: newIndicator.id, name: newName, type: 'indicator' });
        }
      }
    }

    let mainCreated: any = null;
    const mainName = getName(attachment.id, snapshot.name || snapshot.strategyName || 'Template');

    switch (attachment.type) {
      case 'indicator': {
        mainCreated = await prisma.indicator.create({
          data: {
            createdBy: userId,
            name: mainName,
            description: snapshot.description || '',
            pythonCode: snapshot.pythonCode || '',
            outputColumn: mainName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            dependencies: indicatorDeps.map(depId => createdResources[depId]?.id || depId),
            dependencyColumns: snapshot.dependencyColumns || [],
            isGroup: snapshot.isGroup || false,
            groupName: snapshot.groupName || null,
            expectedOutputs: snapshot.expectedOutputs || [],
            externalDatasets: snapshot.externalDatasets || null,
            category: snapshot.category || null,
            tags: snapshot.tags || [],
          },
        });
        await addToUserCollection('indicator', mainCreated.id);
        importedItems.push({ id: mainCreated.id, name: mainName, type: 'indicator' });
        break;
      }
      case 'strategy': {
        mainCreated = await prisma.strategy.create({
          data: {
            createdBy: userId,
            name: mainName,
            description: snapshot.description || '',
            pythonCode: snapshot.pythonCode || '',
            strategyType: snapshot.strategyType || 'signal',
            constraints: snapshot.constraints || null,
            parameters: snapshot.parameters || null,
            externalDatasets: snapshot.externalDatasets || null,
            dependencies: indicatorDeps.map(depId => createdResources[depId]?.id || depId),
          },
        });
        await addToUserCollection('strategy', mainCreated.id);
        importedItems.push({ id: mainCreated.id, name: mainName, type: 'strategy' });
        break;
      }
      case 'stockGroup': {
        mainCreated = await prisma.stockGroup.create({
          data: {
            createdBy: userId,
            name: mainName,
            description: snapshot.description || null,
            stockIds: snapshot.stockIds || [],
          },
        });
        await addToUserCollection('stockGroup', mainCreated.id);
        importedItems.push({ id: mainCreated.id, name: mainName, type: 'stockGroup' });
        break;
      }
      case 'viewSetting': {
        mainCreated = await prisma.viewSetting.create({
          data: {
            createdBy: userId,
            name: mainName,
            enabledIndicators1: snapshot.enabledIndicators1 || [],
            enabledIndicators2: snapshot.enabledIndicators2 || [],
            constantLines1: snapshot.constantLines1 || [],
            constantLines2: snapshot.constantLines2 || [],
          },
        });
        await addToUserCollection('viewSetting', mainCreated.id);
        importedItems.push({ id: mainCreated.id, name: mainName, type: 'viewSetting' });
        break;
      }
      case 'backtestHistory': {
        // Import strategy dependency if exists
        let strategyId = dependencies?.strategyId;
        if (strategyId) {
          const strategy = await prisma.strategy.findUnique({
            where: { id: strategyId },
          });
          if (strategy) {
            const existingUserStrategy = await prisma.userStrategy.findUnique({
              where: { userId_strategyId: { userId, strategyId } },
            });

            if (!existingUserStrategy) {
              const newStrategyName = getName(strategyId, strategy.name);
              const newStrategy = await prisma.strategy.create({
                data: {
                  createdBy: userId,
                  name: newStrategyName,
                  description: strategy.description,
                  pythonCode: strategy.pythonCode,
                  strategyType: strategy.strategyType,
                  constraints: strategy.constraints ?? undefined,
                  parameters: strategy.parameters ?? undefined,
                  externalDatasets: strategy.externalDatasets ?? undefined,
                  dependencies: (strategy.dependencies as string[] || []).map(
                    depId => createdResources[depId]?.id || depId
                  ),
                },
              });
              await addToUserCollection('strategy', newStrategy.id);
              strategyId = newStrategy.id;
              importedItems.push({ id: newStrategy.id, name: newStrategyName, type: 'strategy' });
            }
          }
        }

        // Import stock group dependency if exists
        let stockGroupId = dependencies?.stockGroupId;
        if (stockGroupId) {
          const group = await prisma.stockGroup.findUnique({
            where: { id: stockGroupId },
          });
          if (group) {
            const existingUserGroup = await prisma.userStockGroup.findUnique({
              where: { userId_groupId: { userId, groupId: stockGroupId } },
            });

            if (!existingUserGroup) {
              const newGroupName = getName(stockGroupId, group.name);
              const newGroup = await prisma.stockGroup.create({
                data: {
                  createdBy: userId,
                  name: newGroupName,
                  description: group.description,
                  stockIds: group.stockIds as string[] || [],
                },
              });
              await addToUserCollection('stockGroup', newGroup.id);
              stockGroupId = newGroup.id;
              importedItems.push({ id: newGroup.id, name: newGroupName, type: 'stockGroup' });
            }
          }
        }

        mainCreated = await prisma.backtestHistoryEntry.create({
          data: {
            userId,
            strategyId: strategyId || '',
            strategyName: snapshot.strategyName || 'Template Strategy',
            strategyType: snapshot.strategyType || 'signal',
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
        importedItems.push({
          id: mainCreated.id,
          name: snapshot.strategyName || 'Template Strategy',
          type: 'backtestHistory'
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
      message: `Imported ${importedItems.length} item(s)`,
      resource: {
        id: mainCreated.id,
        name: mainCreated.name || mainCreated.strategyName,
        type: attachment.type,
      },
      importedItems,
    });
  } catch (error) {
    console.error('Error using template:', error);
    return NextResponse.json(
      { error: 'Failed to use template', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
