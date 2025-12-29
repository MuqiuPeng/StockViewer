import { NextResponse } from 'next/server';
import { listCsvFiles } from '@/lib/datasets';
import { getDatasetInfo } from '@/lib/csv';

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

