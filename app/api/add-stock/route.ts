import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getCsvDirectory } from '@/lib/datasets';
import { getDatasetInfo } from '@/lib/csv';
import Papa from 'papaparse';

export const runtime = 'nodejs';

// Column mapping from Chinese to English
const COLUMN_MAPPING: Record<string, string> = {
  '日期': 'date',
  '开盘': 'open',
  '收盘': 'close',
  '最高': 'high',
  '最低': 'low',
  '成交量': 'volume',
  '成交额': 'turnover',
  '振幅': 'amplitude',
  '涨跌幅': 'change_pct',
  '涨跌额': 'change_amount',
  '换手率': 'turnover_rate'
};

interface RequestBody {
  symbol: string;
}

function validateStockSymbol(symbol: string): boolean {
  // Chinese A-share stocks are 6 digits
  return /^\d{6}$/.test(symbol);
}

function getDateRange(): { startDate: string; endDate: string } {
  const endDate = new Date();

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };

  return {
    startDate: '19000101', // Fetch all historical data
    endDate: formatDate(endDate)
  };
}

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const { symbol } = body;

    // Validate symbol
    if (!symbol || !validateStockSymbol(symbol)) {
      return NextResponse.json(
        { error: 'Invalid stock symbol', message: 'Stock symbol must be 6 digits' },
        { status: 400 }
      );
    }

    // Get date range
    const { startDate, endDate } = getDateRange();

    // Fetch data from local API
    const apiUrl = `http://127.0.0.1:8080/api/public/stock_zh_a_hist?symbol=${symbol}&start_date=${startDate}&end_date=${endDate}&adjust=qfq`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch stock data', message: `API returned status ${response.status}` },
        { status: 502 }
      );
    }

    const jsonData = await response.json();

    // Validate response
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      return NextResponse.json(
        { error: 'No data available', message: 'The API returned no data for this stock symbol' },
        { status: 404 }
      );
    }

    // Transform data: map Chinese columns to English
    const transformedData = jsonData.map(row => {
      const newRow: Record<string, any> = {};
      for (const [chineseCol, englishCol] of Object.entries(COLUMN_MAPPING)) {
        if (row[chineseCol] !== undefined) {
          newRow[englishCol] = row[chineseCol];
        }
      }
      return newRow;
    });

    // Generate CSV
    const csv = Papa.unparse(transformedData);

    // Ensure directory exists
    const csvDir = getCsvDirectory();
    await mkdir(csvDir, { recursive: true });

    // Write file
    const filename = `${symbol}.csv`;
    const filePath = join(csvDir, filename);
    await writeFile(filePath, csv, 'utf-8');

    // Get dataset info
    const datasetInfo = await getDatasetInfo(filename);

    return NextResponse.json({
      success: true,
      dataset: datasetInfo
    });

  } catch (error) {
    console.error('Error adding stock:', error);
    return NextResponse.json(
      {
        error: 'Failed to add stock',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
