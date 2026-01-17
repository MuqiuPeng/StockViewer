/**
 * Indicators API
 * GET /api/indicators - List user's indicator collection
 * POST /api/indicators - Create new indicator
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { validatePythonCode } from '@/lib/indicator-validator';
import { detectDependencies } from '@/lib/detect-dependencies';

export const runtime = 'nodejs';

// GET /api/indicators - List user's indicator collection
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    // Get user's indicator collection with indicator details
    const userIndicators = await prisma.userIndicator.findMany({
      where: { userId },
      include: { indicator: true },
      orderBy: { indicator: { name: 'asc' } },
    });

    // Transform to expected format
    const indicators = userIndicators.map(ui => ({
      id: ui.indicator.id,
      name: ui.indicator.name,
      description: ui.indicator.description,
      pythonCode: ui.indicator.pythonCode,
      outputColumn: ui.indicator.outputColumn,
      dependencies: ui.indicator.dependencies,
      dependencyColumns: ui.indicator.dependencyColumns,
      isGroup: ui.indicator.isGroup,
      groupName: ui.indicator.groupName,
      expectedOutputs: ui.indicator.expectedOutputs,
      externalDatasets: ui.indicator.externalDatasets,
      category: ui.indicator.category,
      tags: ui.indicator.tags,
      createdAt: ui.indicator.createdAt.toISOString(),
      updatedAt: ui.indicator.updatedAt.toISOString(),
      isOwner: ui.indicator.createdBy === userId,
      visibleTo: ui.indicator.visibleTo,
    }));

    return NextResponse.json({ indicators });
  } catch (error) {
    console.error('Error loading indicators:', error);
    return NextResponse.json(
      { error: 'Failed to load indicators', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/indicators - Create new indicator
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const {
      name, description, pythonCode, outputColumn,
      isGroup, groupName, expectedOutputs, externalDatasets,
      category, tags, visibleTo
    } = body;

    // Validate required fields
    if (!name || !description || !pythonCode) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'name, description, and pythonCode are required' },
        { status: 400 }
      );
    }

    // For group indicators, validate expectedOutputs
    if (isGroup) {
      if (!groupName) {
        return NextResponse.json(
          { error: 'Missing required fields', message: 'groupName is required for group indicators' },
          { status: 400 }
        );
      }

      if (!expectedOutputs || !Array.isArray(expectedOutputs) || expectedOutputs.length === 0) {
        return NextResponse.json(
          { error: 'Invalid expectedOutputs', message: 'Group indicators must specify expectedOutputs as a non-empty array' },
          { status: 400 }
        );
      }
    }

    // Check for duplicate names (globally unique now)
    const existing = await prisma.indicator.findUnique({
      where: { name },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Duplicate name', message: `Indicator with name "${name}" already exists` },
        { status: 400 }
      );
    }

    // Validate Python code
    const validation = validatePythonCode(pythonCode);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid Python code', message: validation.error },
        { status: 400 }
      );
    }

    // Detect dependencies from Python code
    const allIndicators = await prisma.indicator.findMany({
      select: { id: true, name: true, outputColumn: true, isGroup: true, groupName: true, expectedOutputs: true },
    });
    const { dependencies, dependencyColumns } = detectDependencies(pythonCode, allIndicators);

    // Create indicator
    const indicator = await prisma.indicator.create({
      data: {
        createdBy: userId,
        visibleTo: visibleTo || [], // Empty = public by default
        name,
        description,
        pythonCode,
        outputColumn: isGroup ? groupName : (outputColumn || name),
        dependencies,
        dependencyColumns,
        isGroup: isGroup || false,
        groupName: isGroup ? groupName : null,
        expectedOutputs: isGroup ? expectedOutputs.filter((o: string) => o.trim() !== '') : [],
        externalDatasets: externalDatasets || undefined,
        category: category || null,
        tags: tags || [],
      },
    });

    // Add to user's collection
    await prisma.userIndicator.create({
      data: {
        userId,
        indicatorId: indicator.id,
      },
    });

    return NextResponse.json({
      success: true,
      indicator: {
        ...indicator,
        createdAt: indicator.createdAt.toISOString(),
        updatedAt: indicator.updatedAt.toISOString(),
        isOwner: true,
      },
    });
  } catch (error) {
    console.error('Error creating indicator:', error);
    return NextResponse.json(
      { error: 'Failed to create indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
