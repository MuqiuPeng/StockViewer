import { NextResponse } from 'next/server';
import { getIndicatorById, updateIndicator, deleteIndicator } from '@/lib/indicator-storage';
import { validatePythonCode } from '@/lib/indicator-validator';

export const runtime = 'nodejs';

// GET /api/indicators/[id] - Get single indicator
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const indicator = await getIndicatorById(params.id);

    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ indicator });
  } catch (error) {
    console.error('Error getting indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to get indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// PUT /api/indicators/[id] - Update indicator
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, description, pythonCode, outputColumn } = body;

    // Validate Python code if provided
    if (pythonCode) {
      const validation = validatePythonCode(pythonCode);
      if (!validation.valid) {
        return NextResponse.json(
          { error: 'Invalid Python code', message: validation.error },
          { status: 400 }
        );
      }
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (pythonCode !== undefined) updates.pythonCode = pythonCode;
    if (outputColumn !== undefined) updates.outputColumn = outputColumn;

    const indicator = await updateIndicator(params.id, updates);

    return NextResponse.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Error updating indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to update indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE /api/indicators/[id] - Delete indicator
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await deleteIndicator(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
