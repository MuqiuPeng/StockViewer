/**
 * Strategies API
 * GET /api/strategies - List user's strategy collection
 * POST /api/strategies - Create new strategy
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { detectDependencies } from '@/lib/detect-dependencies';
import { logger } from '@/lib/logger';
import { LogSource } from '@prisma/client';

export const runtime = 'nodejs';

// GET /api/strategies - List user's strategy collection
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Get user's strategy collection with strategy details
    const userStrategies = await prisma.userStrategy.findMany({
      where: { userId },
      include: { strategy: true },
      orderBy: { strategy: { name: 'asc' } },
    });

    // Transform to expected format
    const strategies = userStrategies.map(us => ({
      id: us.strategy.id,
      name: us.strategy.name,
      description: us.strategy.description,
      pythonCode: us.strategy.pythonCode,
      strategyType: us.strategy.strategyType,
      category: us.strategy.category,
      tags: us.strategy.tags,
      parameters: us.strategy.parameters,
      constraints: us.strategy.constraints,
      externalDatasets: us.strategy.externalDatasets,
      dependencies: us.strategy.dependencies,
      createdAt: us.strategy.createdAt.toISOString(),
      updatedAt: us.strategy.updatedAt.toISOString(),
      isOwner: us.strategy.createdBy === userId,
    }));

    return NextResponse.json({ strategies });
  } catch (error) {
    console.error('Error loading strategies:', error);
    return NextResponse.json(
      { error: 'Failed to load strategies', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/strategies - Create new strategy
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { name, description, pythonCode, parameters, strategyType, constraints, externalDatasets, category, tags } = body;

    // Validate required fields
    if (!name || !pythonCode) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'name and pythonCode are required' },
        { status: 400 }
      );
    }

    // Basic validation: check if code contains calculate function
    if (!pythonCode.includes('def calculate')) {
      return NextResponse.json(
        { error: 'Invalid Python code', message: 'Strategy code must define a calculate(data, parameters) function' },
        { status: 400 }
      );
    }

    // Validate strategy type
    const validStrategyType = strategyType === 'portfolio' ? 'portfolio' : 'signal';

    // For portfolio strategies, validate signal format requirement
    if (validStrategyType === 'portfolio' && !pythonCode.includes('data_map')) {
      return NextResponse.json(
        { error: 'Invalid portfolio strategy', message: 'Portfolio strategies must accept data_map parameter (not data)' },
        { status: 400 }
      );
    }

    // Check for duplicate names (globally unique)
    const existing = await prisma.strategy.findUnique({
      where: { name },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Duplicate name', message: `Strategy with name "${name}" already exists` },
        { status: 400 }
      );
    }

    // Detect dependencies from Python code
    const allIndicators = await prisma.indicator.findMany({
      select: { id: true, name: true, outputColumn: true, isGroup: true, groupName: true, expectedOutputs: true },
    });
    const { dependencies, dependencyColumns, importedDatasets } = detectDependencies(pythonCode, allIndicators);

    // Auto-detect external dataset references from code
    let resolvedExternalDatasets = externalDatasets || {};
    if (importedDatasets.length > 0) {
      const dsStocks = await prisma.stock.findMany({
        where: { symbol: { in: importedDatasets } },
        select: { id: true, symbol: true },
      });
      for (const ds of dsStocks) {
        const alreadyPresent = Object.values(resolvedExternalDatasets as Record<string, any>).some(
          (v: any) => v?.datasetName === ds.symbol
        );
        if (!alreadyPresent) {
          (resolvedExternalDatasets as Record<string, any>)[`auto_${ds.symbol}`] = { groupId: '', datasetName: ds.symbol };
        }
      }
    }

    // Create strategy
    const strategy = await prisma.strategy.create({
      data: {
        createdBy: userId,
        name,
        description,
        pythonCode,
        strategyType: validStrategyType,
        category: category || undefined,
        tags: tags || undefined,
        parameters: parameters || {},
        constraints: validStrategyType === 'portfolio' ? constraints : undefined,
        externalDatasets: Object.keys(resolvedExternalDatasets as Record<string, any>).length > 0 ? resolvedExternalDatasets : undefined,
        dependencies,
      },
    });

    // Add to user's collection
    await prisma.userStrategy.create({
      data: {
        userId,
        strategyId: strategy.id,
      },
    });

    logger.info(LogSource.API, 'save_strategy', 'Created strategy', { userId, metadata: { strategyId: strategy.id } });

    return NextResponse.json({
      success: true,
      strategy: {
        ...strategy,
        createdAt: strategy.createdAt.toISOString(),
        updatedAt: strategy.updatedAt.toISOString(),
        isOwner: true,
      },
    });
  } catch (error) {
    console.error('Error creating strategy:', error);
    return NextResponse.json(
      { error: 'Failed to create strategy', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
