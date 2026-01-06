import { NextResponse } from 'next/server';
import { listCsvFiles, getCsvFileStats } from '@/lib/datasets';
import { getDatasetInfo } from '@/lib/csv';
import { unlink } from 'fs/promises';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const csvFiles = await listCsvFiles();
    const datasets = [];

    for (const filename of csvFiles) {
      try {
        const info = await getDatasetInfo(filename);
        datasets.push(info);
      } catch (error) {
        // Skip invalid CSV files
        console.warn(`Skipping invalid CSV file ${filename}:`, error);
      }
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
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field', message: 'name is required' },
        { status: 400 }
      );
    }

    const fileStats = await getCsvFileStats(name);
    if (!fileStats.exists) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    await unlink(fileStats.path);

    return NextResponse.json({ success: true, message: `Dataset ${name} deleted successfully` });
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

