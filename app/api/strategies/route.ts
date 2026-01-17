/**
 * Strategies API
 * GET /api/strategies - List user's strategy collection
 * POST /api/strategies - Create new strategy
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';

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
      parameters: us.strategy.parameters,
      constraints: us.strategy.constraints,
      externalDatasets: us.strategy.externalDatasets,
      dependencies: us.strategy.dependencies,
      createdAt: us.strategy.createdAt.toISOString(),
      updatedAt: us.strategy.updatedAt.toISOString(),
      isOwner: us.strategy.createdBy === userId,
      visibleTo: us.strategy.visibleTo,
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
    const { name, description, pythonCode, parameters, strategyType, constraints, externalDatasets, visibleTo } = body;

    // Validate required fields
    if (!name || !description || !pythonCode) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'name, description, and pythonCode are required' },
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
    const validStrategyType = strategyType === 'portfolio' ? 'portfolio' : 'single';

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

    // Create strategy
    const strategy = await prisma.strategy.create({
      data: {
        createdBy: userId,
        visibleTo: visibleTo || [], // Empty = public by default
        name,
        description,
        pythonCode,
        strategyType: validStrategyType,
        parameters: parameters || {},
        constraints: validStrategyType === 'portfolio' ? constraints : undefined,
        externalDatasets: externalDatasets || undefined,
        dependencies: [],
      },
    });

    // Add to user's collection
    await prisma.userStrategy.create({
      data: {
        userId,
        strategyId: strategy.id,
      },
    });

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
