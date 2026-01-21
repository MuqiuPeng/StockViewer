import { NextResponse } from 'next/server';
import { validatePythonCode } from '@/lib/indicator-validator';
import { executePythonIndicator } from '@/lib/python-executor';
import { prisma } from '@/lib/prisma';
import { detectDependencies } from '@/lib/detect-dependencies';

// POST /api/validate-indicator - Validate Python code
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pythonCode, isGroup, externalDatasets } = body;

    console.log('[validate-indicator] Received request with externalDatasets:', externalDatasets);

    if (!pythonCode) {
      return NextResponse.json(
        { error: 'Missing pythonCode' },
        { status: 400 }
      );
    }

    // First, validate code structure
    const validation = validatePythonCode(pythonCode);
    if (!validation.valid) {
      return NextResponse.json({
        valid: false,
        error: validation.error,
      });
    }

    // Use detectDependencies to find indicator dependencies (same as apply flow)
    const allIndicators = await prisma.indicator.findMany({
      select: {
        id: true,
        name: true,
        outputColumn: true,
        isGroup: true,
        groupName: true,
        expectedOutputs: true,
      },
    });

    const { dependencies, dependencyColumns } = detectDependencies(pythonCode, allIndicators);

    // Build sample data with mock values for dependencies
    const sampleData: Record<string, any>[] = [
      { date: '2024-01-01T00:00:00.000', open: 100, high: 105, low: 99, close: 104, volume: 1000 },
      { date: '2024-01-02T00:00:00.000', open: 104, high: 106, low: 103, close: 105, volume: 1200 },
      { date: '2024-01-03T00:00:00.000', open: 105, high: 107, low: 104, close: 106, volume: 1100 },
      { date: '2024-01-04T00:00:00.000', open: 106, high: 108, low: 105, close: 107, volume: 1300 },
      { date: '2024-01-05T00:00:00.000', open: 107, high: 109, low: 106, close: 108, volume: 1250 },
    ];

    // Add mock values for dependency columns
    for (const col of dependencyColumns) {
      for (let i = 0; i < sampleData.length; i++) {
        // Use simple mock values (random-ish based on index)
        sampleData[i][col] = 100 + i * 0.5 + Math.sin(i) * 2;
      }
    }

    try {
      const result = await executePythonIndicator({
        code: pythonCode,
        data: sampleData,
        isGroup: isGroup || false,
        externalDatasets: externalDatasets || undefined,
      });

      if (!result.success) {
        return NextResponse.json({
          valid: false,
          error: result.error || 'Python execution failed',
          errorType: result.type,
          details: result.details,
        });
      }

      return NextResponse.json({
        valid: true,
        sampleResult: result.values,
        dependencies: dependencyColumns.length > 0 ? dependencyColumns : undefined,
      });
    } catch (execError) {
      return NextResponse.json({
        valid: false,
        error: execError instanceof Error ? execError.message : 'Execution error',
      });
    }
  } catch (error) {
    console.error('Error validating indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to validate indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
