import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import type { DatasetMetadata } from '@/lib/dataset-metadata';
import Papa from 'papaparse';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }

    const identifier = params.name;
    const store = authResult.storage.getJsonStore<DatasetMetadata>('datasetMetadata');
    const fileStore = authResult.storage.getFileStore();

    // Find dataset by code, name, or filename using metadata
    const datasets = await store.getAll();
    let metadata = datasets.find(ds => ds.id === identifier);
    if (!metadata) {
      metadata = datasets.find(
        ds => ds.filename === identifier || ds.filename.replace(/\.csv$/i, '') === identifier
      );
    }
    if (!metadata) {
      metadata = datasets.find(ds => ds.name === identifier);
    }
    if (!metadata) {
      const codeMatches = datasets.filter(ds => ds.code === identifier);
      if (codeMatches.length === 1) {
        metadata = codeMatches[0];
      }
    }

    if (!metadata) {
      return NextResponse.json(
        { error: 'Dataset not found', message: `No dataset found with identifier: ${identifier}` },
        { status: 404 }
      );
    }

    // Load the CSV file
    const fileContent = await fileStore.readText(metadata.filename);
    const parsed = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    const data = parsed.data as Record<string, any>[];

    // Transform raw data into candles format
    const candles = data.map(row => ({
      time: row.date,
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
    })).filter(c => c.time && !isNaN(c.open) && !isNaN(c.close));

    // Base indicators from the stock API data
    const baseIndicators = ['volume', 'turnover', 'amplitude', 'change_pct', 'change_amount', 'turnover_rate'];
    // OHLC columns that are used for candles, not indicators
    const ohlcColumns = ['date', 'open', 'high', 'low', 'close'];

    // All indicator columns = base indicators + any custom indicators (not OHLC)
    const indicatorColumns = (metadata.columns || []).filter(col => !ohlcColumns.includes(col));

    // Build indicators object
    const indicators: Record<string, Array<{time: string; value: number | null}>> = {};
    for (const col of indicatorColumns) {
      indicators[col] = data.map(row => ({
        time: row.date,
        value: row[col] !== undefined && row[col] !== '' ? parseFloat(row[col]) : null,
      })).filter(d => d.time);
    }

    // Meta indicators = custom indicators only (not base indicators)
    const customIndicators = metadata.indicators || [];
    // All available indicators for display = base + custom
    const allIndicators = [...baseIndicators.filter(b => indicatorColumns.includes(b)), ...customIndicators];

    // Build dataset response in the format the frontend expects
    const dataset = {
      candles,
      indicators,
      meta: {
        filename: metadata.filename,
        name: metadata.name,
        code: metadata.code,
        dataSource: metadata.dataSource,
        columns: metadata.columns || [],
        indicators: allIndicators,
        rowCount: candles.length,
        firstDate: metadata.firstDate,
        lastDate: metadata.lastDate,
        lastUpdate: metadata.lastUpdate,
      },
    };

    return NextResponse.json(dataset);
  } catch (error) {
    console.error('Error loading dataset:', error);
    return NextResponse.json(
      { error: 'Failed to load dataset', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
