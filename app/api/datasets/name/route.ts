import { NextResponse } from 'next/server';
import { updateDatasetName, findDataset } from '@/lib/dataset-metadata';

export const runtime = 'nodejs';

// PUT /api/datasets/name - Update dataset name
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { filename, name } = body;

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid filename' },
        { status: 400 }
      );
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid name' },
        { status: 400 }
      );
    }

    // Update name in metadata
    await updateDatasetName(filename, name.trim());

    return NextResponse.json({
      success: true,
      message: 'Dataset name updated successfully',
    });
  } catch (error) {
    console.error('Error updating dataset name:', error);
    return NextResponse.json(
      {
        error: 'Failed to update dataset name',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET /api/datasets/name?filename=xxx - Get custom name for a dataset
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return NextResponse.json(
        { error: 'Missing filename parameter' },
        { status: 400 }
      );
    }

    // Get dataset from metadata
    const dataset = await findDataset(filename);

    return NextResponse.json({
      filename,
      customName: dataset?.name || null,
    });
  } catch (error) {
    console.error('Error getting dataset name:', error);
    return NextResponse.json(
      {
        error: 'Failed to get dataset name',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
