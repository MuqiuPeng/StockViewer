import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import type { DatasetMetadata } from '@/lib/dataset-metadata';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const store = authResult.storage.getJsonStore<DatasetMetadata>('datasetMetadata');
    const fileStore = authResult.storage.getFileStore();
    const datasets = await store.getAll();

    // Check if each dataset's file exists locally
    const datasetsWithStatus = await Promise.all(
      datasets.map(async (dataset) => {
        const fileExists = await fileStore.exists(dataset.filename);
        return {
          ...dataset,
          fileMissing: !fileExists,
        };
      })
    );

    return NextResponse.json(datasetsWithStatus);
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
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const store = authResult.storage.getJsonStore<DatasetMetadata>('datasetMetadata');
    const fileStore = authResult.storage.getFileStore();

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
    const datasets = await store.getAll();
    let dataset = datasets.find(ds => ds.id === lookupValue);
    if (!dataset) {
      dataset = datasets.find(
        ds => ds.filename === lookupValue || ds.filename.replace(/\.csv$/i, '') === lookupValue
      );
    }
    if (!dataset) {
      dataset = datasets.find(ds => ds.name === lookupValue);
    }
    if (!dataset) {
      const codeMatches = datasets.filter(ds => ds.code === lookupValue);
      if (codeMatches.length === 1) {
        dataset = codeMatches[0];
      }
    }

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    // Delete CSV file
    const exists = await fileStore.exists(dataset.filename);
    if (exists) {
      await fileStore.delete(dataset.filename);
    }

    // Remove from metadata
    await store.delete(dataset.id);

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
