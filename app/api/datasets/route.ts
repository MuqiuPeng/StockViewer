import { NextResponse } from 'next/server';
import { getCsvFileStats } from '@/lib/datasets';
import { unlink } from 'fs/promises';
import { loadMetadata, migrateDatasetIds } from '@/lib/dataset-metadata';

export const runtime = 'nodejs';

export async function GET() {
  try {
    let datasets = await loadMetadata();

    // Auto-migration: If any dataset is missing ID, run migration
    if (datasets.length > 0 && !datasets[0].id) {
      console.log('Datasets missing IDs, running migration...');
      await migrateDatasetIds();
      datasets = await loadMetadata();
    }

    return NextResponse.json(datasets);
  } catch (error) {
    console.error('Error listing datasets:', error);
    return NextResponse.json(
      { error: 'Failed to list datasets', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/datasets - Delete a dataset
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { identifier, name } = body; // Accept both identifier (new) and name (legacy)

    const lookupValue = identifier || name;
    if (!lookupValue) {
      return NextResponse.json(
        { error: 'Missing required field', message: 'identifier or name is required' },
        { status: 400 }
      );
    }

    // Find dataset by ID (or name/filename for backward compatibility)
    const { findDataset, removeDataset } = await import('@/lib/dataset-metadata');
    const dataset = await findDataset(lookupValue);

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    // Delete CSV file
    const fileStats = await getCsvFileStats(dataset.filename);
    if (fileStats.exists) {
      await unlink(fileStats.path);
    }

    // Remove from metadata
    await removeDataset(dataset.filename);

    return NextResponse.json({ success: true, message: `Dataset ${dataset.name} deleted successfully` });
  } catch (error) {
    console.error('Error deleting dataset:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete dataset',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

