import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getCsvDirectory } from '@/lib/datasets';
import { getDatasetInfo } from '@/lib/csv';
import { loadIndicators } from '@/lib/indicator-storage';
import { executePythonIndicator } from '@/lib/python-executor';
import { addIndicatorColumn, addIndicatorGroupColumns } from '@/lib/csv-updater';
import { topologicalSort } from '@/lib/indicator-dependencies';
import { API_CONFIG } from '@/lib/env';
import { getDataSourceConfig } from '@/lib/data-sources';
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
  '换手率': 'turnover_rate',
  '最新价': 'close',  // For some data sources
  '涨跌额': 'change_amount',
  '涨跌幅': 'change_pct',
  '代码': 'code',
  '名称': 'name'
};

interface RequestBody {
  symbol: string;
  dataSource?: string;
  customParams?: Record<string, any>;
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

/**
 * Build API URL based on data source configuration
 */
function buildApiUrl(
  dataSourceId: string,
  symbol: string,
  params: Record<string, any>
): string {
  const config = getDataSourceConfig(dataSourceId);
  if (!config) {
    throw new Error(`Unknown data source: ${dataSourceId}`);
  }

  // Merge default params with custom params
  const allParams = { ...config.defaultParams, ...params, symbol };

  // Build query string
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(allParams)) {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  }

  return `${API_CONFIG.AKTOOLS_URL}/api/public/${config.apiEndpoint}?${queryParams.toString()}`;
}

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const { symbol, dataSource = 'stock_zh_a_hist', customParams = {} } = body;

    // Validate symbol
    if (!symbol) {
      return NextResponse.json(
        { error: 'Invalid symbol', message: 'Symbol is required' },
        { status: 400 }
      );
    }

    // Get data source config
    const config = getDataSourceConfig(dataSource);
    if (!config) {
      return NextResponse.json(
        { error: 'Invalid data source', message: `Unknown data source: ${dataSource}` },
        { status: 400 }
      );
    }

    // Get date range if needed
    const { startDate, endDate } = getDateRange();
    const params: Record<string, any> = { ...customParams };

    // Add date range if required by the data source
    if (config.requiredParams.includes('start_date')) {
      params.start_date = params.start_date || startDate;
    }
    if (config.requiredParams.includes('end_date')) {
      params.end_date = params.end_date || endDate;
    }

    // Build API URL
    const apiUrl = buildApiUrl(dataSource, symbol, params);

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

    // Write file with data source in filename: {symbol}_{dataSource}.csv
    // Always include data source to prevent duplicates
    const filename = `${symbol}_${dataSource}.csv`;
    const filePath = join(csvDir, filename);
    await writeFile(filePath, csv, 'utf-8');

    // Automatically apply all indicators
    try {
      const indicators = await loadIndicators();

      if (indicators.length > 0) {
        // Sort indicators by dependencies (topological sort)
        const sortedIndicators = topologicalSort(indicators);
        console.log(`Applying ${sortedIndicators.length} indicators to ${symbol} in dependency order...`);

        for (const indicator of sortedIndicators) {
          try {
            // Reload CSV data each time to include previously applied indicators
            const { readFile } = await import('fs/promises');
            const currentCsvContent = await readFile(filePath, 'utf-8');
            const parsed = Papa.parse(currentCsvContent, { header: true, skipEmptyLines: true });
            const currentData = parsed.data as any[];

            // Convert to format expected by Python executor
            const dataRecords = currentData.map((row: any) => {
              const record: any = {
                date: row.date,
                open: parseFloat(row.open) || 0,
                high: parseFloat(row.high) || 0,
                low: parseFloat(row.low) || 0,
                close: parseFloat(row.close) || 0,
                volume: parseFloat(row.volume) || 0,
              };
              // Include all other columns (previously calculated indicators)
              for (const key in row) {
                if (!['date', 'open', 'high', 'low', 'close', 'volume'].includes(key)) {
                  const value = parseFloat(row[key]);
                  record[key] = isNaN(value) ? null : value;
                }
              }
              return record;
            });

            // Execute the indicator
            const result = await executePythonIndicator({
              code: indicator.pythonCode,
              data: dataRecords,
              isGroup: indicator.isGroup || false
            });

            if (result.success && result.values) {
              // Handle group indicators vs single indicators
              if (indicator.isGroup && indicator.groupName) {
                // Group indicator - add multiple columns
                const valuesDict = result.values as Record<string, (number | null)[]>;
                await addIndicatorGroupColumns(filename, indicator.groupName, valuesDict);
                console.log(`Applied group indicator ${indicator.name} to ${symbol}`);
              } else {
                // Single indicator - add one column
                const valuesArray = result.values as (number | null)[];
                await addIndicatorColumn(filename, indicator.outputColumn, valuesArray);
                console.log(`Applied indicator ${indicator.name} to ${symbol}`);
              }
            } else {
              console.warn(`Failed to apply indicator ${indicator.name} to ${symbol}:`, result.error);
            }
          } catch (err) {
            console.error(`Error applying indicator ${indicator.name} to ${symbol}:`, err);
            // Continue with other indicators even if one fails
          }
        }
      }
    } catch (err) {
      console.warn('Failed to apply indicators:', err);
      // Don't fail the whole operation if indicator application fails
    }

    // Get dataset info (after indicators have been applied)
    const datasetInfo = await getDatasetInfo(filename);

    // Fetch name for the symbol based on data source
    let stockName = symbol; // Default to symbol if API fails

    // Try to get name from stock info API (for A-shares only)
    if (dataSource.startsWith('stock_zh_a_')) {
      try {
        const infoApiUrl = `${API_CONFIG.AKTOOLS_URL}/api/public/stock_individual_info_em?symbol=${symbol}`;
        const infoResponse = await fetch(infoApiUrl);
        if (infoResponse.ok) {
          const infoData = await infoResponse.json();
          // Find the item with "股票简称" (Stock Short Name)
          const nameItem = infoData.find((item: any) => item.item === '股票简称');
          if (nameItem && nameItem.value) {
            stockName = nameItem.value;
            console.log(`Fetched stock name for ${symbol}: ${stockName}`);
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch stock name for ${symbol}, using symbol as name:`, err);
      }
    }

    // For other data sources, check if the data itself contains a name field
    if (stockName === symbol && transformedData.length > 0) {
      const firstRow = transformedData[0];
      if (firstRow.name) {
        stockName = firstRow.name;
      }
    }

    // Register dataset in metadata
    const { registerDataset } = await import('@/lib/dataset-metadata');
    await registerDataset({
      code: symbol,
      name: stockName, // Use fetched stock name or symbol as fallback
      filename,
      dataSource,
      firstDate: datasetInfo.firstDate,
      lastDate: datasetInfo.lastDate,
      lastUpdate: datasetInfo.lastUpdate,
      rowCount: datasetInfo.rowCount,
      columns: datasetInfo.columns,
      indicators: datasetInfo.indicators,
    });

    return NextResponse.json({
      success: true,
      dataset: {
        ...datasetInfo,
        name: stockName, // Return the fetched stock name
      }
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
