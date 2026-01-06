import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export const runtime = 'nodejs';

const NAMES_FILE = join(process.cwd(), 'data', 'datasets', 'names.json');

interface NamesData {
  [filename: string]: string;
}

async function loadNames(): Promise<NamesData> {
  try {
    const content = await readFile(NAMES_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveNames(names: NamesData): Promise<void> {
  await writeFile(NAMES_FILE, JSON.stringify(names, null, 2), 'utf-8');
}

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

    const names = await loadNames();
    names[filename] = name.trim();
    await saveNames(names);

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

    const names = await loadNames();
    const customName = names[filename];

    return NextResponse.json({
      filename,
      customName: customName || null,
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
