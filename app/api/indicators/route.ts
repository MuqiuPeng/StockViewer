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
    const { name, description, pythonCode, outputColumn } = body;

    // Validate required fields
    if (!name || !description || !pythonCode) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'name, description, and pythonCode are required' },
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
    const allIndicators = await loadIndicators();
    const dependencies = detectDependencies(pythonCode, allIndicators);

    // Create indicator
    const indicator = await saveIndicator({
      name,
      description,
      pythonCode,
      outputColumn: outputColumn || name,
      dependencies,
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
