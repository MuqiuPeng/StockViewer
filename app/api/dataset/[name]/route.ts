import { NextResponse } from 'next/server';
import { loadDataset } from '@/lib/csv';
import { findDataset } from '@/lib/dataset-metadata';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const identifier = params.name;

    // Find dataset by code, name, or filename using metadata
    const metadata = await findDataset(identifier);

    if (!metadata) {
      return NextResponse.json(
        { error: 'Dataset not found', message: `No dataset found with identifier: ${identifier}` },
        { status: 404 }
      );
    }

    const dataset = await loadDataset(metadata.filename);
    return NextResponse.json(dataset);
  } catch (error) {
    console.error('Error loading dataset:', error);
    return NextResponse.json(
      { error: 'Failed to load dataset', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

