import { NextResponse } from 'next/server';
import { loadIndicators, saveIndicator } from '@/lib/indicator-storage';
import { validatePythonCode } from '@/lib/indicator-validator';
import { detectDependencies } from '@/lib/detect-dependencies';

export const runtime = 'nodejs';

// GET /api/indicators - List all indicators
export async function GET() {
  try {
    const indicators = await loadIndicators();
    return NextResponse.json({ indicators });
  } catch (error) {
    console.error('Error loading indicators:', error);
    return NextResponse.json(
      {
        error: 'Failed to load indicators',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST /api/indicators - Create new indicator
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, pythonCode, outputColumn, isGroup, groupName, expectedOutputs, externalDatasets } = body;

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

      // Filter out empty strings
      const filteredOutputs = expectedOutputs.filter((output: string) => output.trim() !== '');
      if (filteredOutputs.length === 0) {
        return NextResponse.json(
          { error: 'Invalid expectedOutputs', message: 'expectedOutputs must contain at least one non-empty string' },
          { status: 400 }
        );
      }
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
    const allIndicators = await loadIndicators();
    const { dependencies, dependencyColumns } = detectDependencies(pythonCode, allIndicators);

    // Create indicator
    const indicator = await saveIndicator({
      name,
      description,
      pythonCode,
      outputColumn: isGroup ? groupName : (outputColumn || name),  // Use groupName for groups
      dependencies,
      dependencyColumns,
      isGroup: isGroup || false,
      groupName: isGroup ? groupName : undefined,
      expectedOutputs: isGroup ? expectedOutputs.filter((output: string) => output.trim() !== '') : undefined,
      externalDatasets: externalDatasets || undefined,
    });

    return NextResponse.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Error creating indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to create indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
