import { NextResponse } from 'next/server';
import { Strategy } from '@/lib/strategy-storage';
import { getApiStorage } from '@/lib/api-auth';

// GET /api/strategies - List all strategies
export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const strategies = await authResult.storage.getJsonStore<Strategy>('strategies').getAll();
    return NextResponse.json({ strategies });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load strategies',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
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
    const store = authResult.storage.getJsonStore<Strategy>('strategies');

    const body = await request.json();
    const { name, description, pythonCode, parameters, strategyType, constraints, externalDatasets } = body;

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

    // Check for duplicate names
    const allStrategies = await store.getAll();
    const duplicate = allStrategies.find(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      return NextResponse.json(
        { error: 'Duplicate strategy', message: `Strategy with name "${name}" already exists` },
        { status: 409 }
      );
    }

    // Create strategy
    const strategy = await store.create({
      name,
      description,
      pythonCode,
      strategyType: validStrategyType,
      parameters: parameters || {},
      constraints: validStrategyType === 'portfolio' ? constraints : undefined,
      externalDatasets: externalDatasets || undefined,
    });

    return NextResponse.json({ strategy }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to create strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
