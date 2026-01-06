import { NextResponse } from 'next/server';
import {
  loadStrategies,
  saveStrategy,
  Strategy,
} from '@/lib/strategy-storage';

// GET /api/strategies - List all strategies
export async function GET() {
  try {
    const strategies = await loadStrategies();
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
    const body = await request.json();
    const { name, description, pythonCode, parameters } = body;

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

    // Create strategy
    const strategy = await saveStrategy({
      name,
      description,
      pythonCode,
      parameters: parameters || {},
    });

    return NextResponse.json({ strategy }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json(
        { error: 'Duplicate strategy', message: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to create strategy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

