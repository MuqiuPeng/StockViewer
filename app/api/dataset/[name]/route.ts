import { NextResponse } from 'next/server';
import { loadDataset } from '@/lib/csv';
import { listCsvFiles } from '@/lib/datasets';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const name = params.name;
    
    // Find the CSV file that matches the name
    const csvFiles = await listCsvFiles();
    const filename = csvFiles.find(f => f.replace(/\.csv$/i, '') === name);

    if (!filename) {
      return NextResponse.json(
        { error: 'Dataset not found', message: `No dataset found with name: ${name}` },
        { status: 404 }
      );
    }

    const dataset = await loadDataset(filename);
    return NextResponse.json(dataset);
  } catch (error) {
    console.error('Error loading dataset:', error);
    return NextResponse.json(
      { error: 'Failed to load dataset', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

