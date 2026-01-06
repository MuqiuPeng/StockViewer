import { NextResponse } from 'next/server';
import {
  getStrategyById,
  updateStrategy,
  deleteStrategy,
  Strategy,
} from '@/lib/strategy-storage';

// GET /api/strategies/[id] - Get single strategy
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const strategy = await getStrategyById(params.id);

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
    const body = await request.json();
    const { name, description, pythonCode, parameters, constraints } = body;

    // Validate that strategy exists
    const existing = await getStrategyById(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Partial<Strategy> = {};
    if (name !== undefined) updates.name = name;
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

    // Allow updating constraints for portfolio strategies
    if (constraints !== undefined && existing.strategyType === 'portfolio') {
      updates.constraints = constraints;
    }

    const updated = await updateStrategy(params.id, updates);
    return NextResponse.json({ strategy: updated });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json(
        { error: 'Duplicate strategy', message: error.message },
        { status: 409 }
      );
    }

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
    await deleteStrategy(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Strategy not found', message: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to delete strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

