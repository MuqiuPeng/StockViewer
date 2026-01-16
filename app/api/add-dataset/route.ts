import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import { API_CONFIG } from '@/lib/env';
import { getDataSourceConfig } from '@/lib/data-sources';
import { cleanDateColumn } from '@/lib/date-cleaner';
import { executePythonIndicator } from '@/lib/python-executor';
import { topologicalSort } from '@/lib/indicator-dependencies';
import type { Indicator } from '@/lib/indicator-storage';
import type { DatasetMetadata } from '@/lib/dataset-metadata';
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
  '代码': 'code',
  '名称': 'name'
};

interface RequestBody {
  symbol: string;
  dataSource?: string;
  customParams?: Record<string, any>;
  name?: string; // Optional name from browse list
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
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const storage = authResult.storage;
    const fileStore = storage.getFileStore();
    const indicatorStore = storage.getJsonStore<Indicator>('indicators');
    const datasetStore = storage.getJsonStore<DatasetMetadata>('datasetMetadata');

    const body: RequestBody = await request.json();
    const { symbol, dataSource = 'stock_zh_a_hist', customParams = {}, name: providedName } = body;

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

    // Clean date column if all dates are at midnight (T00:00:00.000)
    const datesCleaned = cleanDateColumn(transformedData, 'date');
    if (datesCleaned) {
      console.log(`Cleaned date column: stripped T00:00:00.000 from all ${transformedData.length} dates`);
    }

    // Generate CSV
    let csv = Papa.unparse(transformedData);

    // Write file with data source in filename: {symbol}_{dataSource}.csv
    const filename = `${symbol}_${dataSource}.csv`;
    await fileStore.writeText(filename, csv);

    // Automatically apply all indicators
    try {
      const indicators = await indicatorStore.getAll();

      if (indicators.length > 0) {
        // Sort indicators by dependencies (topological sort)
        const sortedIndicators = topologicalSort(indicators);
        console.log(`Applying ${sortedIndicators.length} indicators to ${symbol} in dependency order...`);

        for (const indicator of sortedIndicators) {
          try {
            // Reload CSV data each time to include previously applied indicators
            const currentCsvContent = await fileStore.readText(filename);
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
              // Reload CSV for modification
              const csvContent = await fileStore.readText(filename);
              const parsedCsv = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
              const csvData = parsedCsv.data as any[];

              if (indicator.isGroup && indicator.groupName) {
                // Group indicator - add multiple columns
                const valuesDict = result.values as Record<string, (number | null)[]>;
                for (const [outputName, values] of Object.entries(valuesDict)) {
                  const columnName = `${indicator.groupName}:${outputName}`;
                  values.forEach((value, i) => {
                    if (i < csvData.length) {
                      csvData[i][columnName] = value !== null ? value : '';
                    }
                  });
                }
                console.log(`Applied group indicator ${indicator.name} to ${symbol}`);
              } else {
                // Single indicator - add one column
                const valuesArray = result.values as (number | null)[];
                valuesArray.forEach((value, i) => {
                  if (i < csvData.length) {
                    csvData[i][indicator.outputColumn] = value !== null ? value : '';
                  }
                });
                console.log(`Applied indicator ${indicator.name} to ${symbol}`);
              }

              // Write updated CSV
              const updatedCsv = Papa.unparse(csvData);
              await fileStore.writeText(filename, updatedCsv);
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
    const finalCsvContent = await fileStore.readText(filename);
    const finalParsed = Papa.parse(finalCsvContent, { header: true, skipEmptyLines: true });
    const finalData = finalParsed.data as any[];
    const columns = finalParsed.meta.fields || [];

    // Extract date range and indicators
    const dates = finalData.map(row => row.date).filter(Boolean).sort();
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const baseColumns = ['date', 'open', 'high', 'low', 'close', 'volume', 'turnover', 'amplitude', 'change_pct', 'change_amount', 'turnover_rate'];
    const indicatorColumns = columns.filter(col => !baseColumns.includes(col));

    // Determine the name for this dataset
    let stockName = symbol; // Default to symbol if nothing else works

    // Use provided name from browse list if available
    if (providedName) {
      stockName = providedName;
      console.log(`Using provided name for ${symbol}: ${stockName}`);
    }
    // Try to get name from stock info API (for A-shares only)
    else if (dataSource.startsWith('stock_zh_a_')) {
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
    else if (transformedData.length > 0) {
      const firstRow = transformedData[0];
      if (firstRow.name) {
        stockName = firstRow.name;
      }
    }

    // Register dataset in metadata
    const datasetId = `${symbol}_${dataSource}`;
    const now = new Date().toISOString();

    // Check if dataset already exists
    const existingDatasets = await datasetStore.getAll();
    const existingDataset = existingDatasets.find(ds => ds.filename === filename);

    if (existingDataset) {
      // Update existing
      await datasetStore.update(existingDataset.id, {
        code: symbol,
        name: stockName,
        dataSource,
        firstDate,
        lastDate,
        lastUpdate: now,
        rowCount: finalData.length,
        columns,
        indicators: indicatorColumns,
      });
    } else {
      // Create new
      await datasetStore.create({
        code: symbol,
        name: stockName,
        filename,
        dataSource,
        firstDate,
        lastDate,
        lastUpdate: now,
        rowCount: finalData.length,
        columns,
        indicators: indicatorColumns,
      });
    }

    return NextResponse.json({
      success: true,
      dataset: {
        id: datasetId,
        code: symbol,
        name: stockName,
        filename,
        dataSource,
        firstDate,
        lastDate,
        lastUpdate: now,
        rowCount: finalData.length,
        columns,
        indicators: indicatorColumns,
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
