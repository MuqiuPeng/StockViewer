import { NextResponse } from 'next/server';
import { Strategy } from '@/lib/strategy-storage';
import { getApiStorage } from '@/lib/api-auth';

// GET /api/strategies/[id] - Get single strategy
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const strategy = await authResult.storage.getJsonStore<Strategy>('strategies').getById(params.id);

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ strategy });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// PUT /api/strategies/[id] - Update strategy
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<Strategy>('strategies');

    const body = await request.json();
    const { name, description, pythonCode, parameters, constraints, externalDatasets } = body;

    // Validate that strategy exists
    const existing = await store.getById(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Partial<Strategy> = {};
    if (name !== undefined) {
      // Check for duplicate names
      const allStrategies = await store.getAll();
      const duplicate = allStrategies.find(
        (s) => s.id !== params.id && s.name.toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        return NextResponse.json(
          { error: 'Duplicate strategy', message: `Strategy with name "${name}" already exists` },
          { status: 409 }
        );
      }
      updates.name = name;
    }
    if (description !== undefined) updates.description = description;
    if (pythonCode !== undefined) {
      // Basic validation
      if (!pythonCode.includes('def calculate')) {
        return NextResponse.json(
          { error: 'Invalid Python code', message: 'Strategy code must define a calculate(data, parameters) function' },
          { status: 400 }
        );
      }

      // Validate portfolio strategy code format
      if (existing.strategyType === 'portfolio' && !pythonCode.includes('data_map')) {
        return NextResponse.json(
          { error: 'Invalid portfolio strategy', message: 'Portfolio strategies must accept data_map parameter (not data)' },
          { status: 400 }
        );
      }

      updates.pythonCode = pythonCode;
    }
    if (parameters !== undefined) updates.parameters = parameters;
    if (externalDatasets !== undefined) updates.externalDatasets = externalDatasets;

    // Allow updating constraints for portfolio strategies
    if (constraints !== undefined && existing.strategyType === 'portfolio') {
      updates.constraints = constraints;
    }

    const updated = await store.update(params.id, updates);
    return NextResponse.json({ strategy: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE /api/strategies/[id] - Delete strategy
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const store = authResult.storage.getJsonStore<Strategy>('strategies');

    // Check if exists
    const existing = await store.getById(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    await store.delete(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to delete strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
