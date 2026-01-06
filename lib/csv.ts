import Papa from 'papaparse';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getCsvFileStats, hasRequiredColumns } from './datasets';

const NAMES_FILE = join(process.cwd(), 'data', 'datasets', 'names.json');

async function loadCustomNames(): Promise<Record<string, string>> {
  try {
    const content = await readFile(NAMES_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IndicatorData {
  time: number;
  value: number | null;
}

export interface DatasetData {
  meta: {
    name: string;
    code: string;
    filename: string;
    columns: string[];
    indicators: string[];
    rowCount: number;
  };
  candles: CandleData[];
  indicators: Record<string, IndicatorData[]>;
}

/**
 * Normalize column name for comparison (lowercase, trim)
 */
function normalizeColumnName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Find the original column name by normalized name
 */
function findColumnIndex(headers: string[], normalizedName: string): number {
  return headers.findIndex(h => normalizeColumnName(h) === normalizedName);
}

/**
 * Parse a date string to UNIX timestamp (seconds)
 */
function parseDate(dateStr: string): number | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  const date = new Date(dateStr.trim());
  if (isNaN(date.getTime())) {
    return null;
  }
  return Math.floor(date.getTime() / 1000);
}

/**
 * Parse a numeric value
 */
function parseNumber(value: string | number): number | null {
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }
  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

/**
 * Load and parse a CSV dataset
 */
export async function loadDataset(filename: string): Promise<DatasetData> {
  const fileStats = await getCsvFileStats(filename);
  if (!fileStats.exists) {
    throw new Error(`Dataset file not found: ${filename}`);
  }

  const fileContent = await readFile(fileStats.path, 'utf-8');
  const customNames = await loadCustomNames();

  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        try {
          const rows = results.data as Record<string, string>[];
          if (rows.length === 0) {
            reject(new Error('CSV file is empty or has no valid rows'));
            return;
          }

          const headers = results.meta.fields || [];
          if (!headers || headers.length === 0) {
            reject(new Error('CSV file has no headers'));
            return;
          }

          if (!hasRequiredColumns(headers)) {
            reject(new Error(`CSV file missing required columns. Found: ${headers.join(', ')}. Required: date, open, high, low, close`));
            return;
          }

          // Find column indices
          const dateIdx = findColumnIndex(headers, 'date');
          const openIdx = findColumnIndex(headers, 'open');
          const highIdx = findColumnIndex(headers, 'high');
          const lowIdx = findColumnIndex(headers, 'low');
          const closeIdx = findColumnIndex(headers, 'close');

          // Identify indicator columns (all columns except required ones)
          const indicatorColumns = headers.filter((h, idx) => {
            const normalized = normalizeColumnName(h);
            return !['date', 'open', 'high', 'low', 'close'].includes(normalized);
          });

          // Parse rows
          const candles: CandleData[] = [];
          const indicatorData: Record<string, IndicatorData[]> = {};
          
          // Initialize indicator arrays
          indicatorColumns.forEach(col => {
            indicatorData[col] = [];
          });

          for (const row of rows) {
            // Parse date
            const dateStr = row[headers[dateIdx]];
            const time = parseDate(dateStr);
            if (time === null) {
              continue; // Skip invalid dates
            }

            // Parse OHLC
            const open = parseNumber(row[headers[openIdx]]);
            const high = parseNumber(row[headers[highIdx]]);
            const low = parseNumber(row[headers[lowIdx]]);
            const close = parseNumber(row[headers[closeIdx]]);

            // Skip if any OHLC is missing
            if (open === null || high === null || low === null || close === null) {
              continue;
            }

            candles.push({ time, open, high, low, close });

            // Parse indicators
            indicatorColumns.forEach(col => {
              const value = parseNumber(row[col]);
              indicatorData[col].push({ time, value });
            });
          }

          // Sort by time ascending
          candles.sort((a, b) => a.time - b.time);
          indicatorColumns.forEach(col => {
            indicatorData[col].sort((a, b) => a.time - b.time);
          });

          if (candles.length === 0) {
            reject(new Error('No valid rows found in CSV file'));
            return;
          }

          // Fill indicator data with 0 values for missing time points to align with candles
          // This ensures all indicators have the same time range as candles, preventing date misalignment
          const candleTimeSet = new Set(candles.map(c => c.time));
          
          indicatorColumns.forEach(col => {
            const indicator = indicatorData[col];
            
            // Create a map of existing indicator data by time for quick lookup
            const indicatorMap = new Map<number, number | null>();
            indicator.forEach(d => {
              indicatorMap.set(d.time, d.value);
            });
            
            // Build filled indicator data: include all candle times, use existing values or 0
            const filledData: IndicatorData[] = candles.map(candle => ({
              time: candle.time,
              value: indicatorMap.get(candle.time) ?? 0,
            }));
            
            indicatorData[col] = filledData;
          });

          const nameWithoutExt = filename.replace(/\.csv$/i, '');

          // Extract code from filename: {code}_{dataSource}.csv
          const nameParts = nameWithoutExt.split('_');
          const code = nameParts[0];

          // Use custom name if exists
          const name = customNames[filename] || code; // Use custom name or code as fallback

          resolve({
            meta: {
              name,
              code,
              filename,
              columns: headers,
              indicators: indicatorColumns,
              rowCount: candles.length,
            },
            candles,
            indicators: indicatorData,
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Failed to parse CSV'));
        }
      },
      error: (error: Error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
}

/**
 * Get dataset info without loading full data
 */
export async function getDatasetInfo(filename: string): Promise<{
  name: string;
  code: string;
  filename: string;
  columns: string[];
  indicators: string[];
  rowCount: number;
  dataSource?: string;
  firstDate?: string;
  lastDate?: string;
  lastUpdate?: string;
}> {
  const fileStats = await getCsvFileStats(filename);
  if (!fileStats.exists) {
    throw new Error(`Dataset file not found: ${filename}`);
  }

  const fileContent = await readFile(fileStats.path, 'utf-8');

  // Get file modification time for lastUpdate
  const { stat } = await import('fs/promises');
  const stats = await stat(fileStats.path);
  const lastUpdate = stats.mtime.toISOString();

  // Load custom names
  const customNames = await loadCustomNames();

  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      preview: 0, // Only parse headers
      complete: (results) => {
        try {
          const headers = results.meta.fields || [];
          if (!headers || headers.length === 0) {
            reject(new Error('CSV file has no headers'));
            return;
          }

          if (!hasRequiredColumns(headers)) {
            reject(new Error(`CSV file missing required columns. Found: ${headers.join(', ')}. Required: date, open, high, low, close`));
            return;
          }

          // Count rows (we need to parse once to count)
          Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim(),
            complete: (countResults) => {
              const rows = countResults.data as Record<string, string>[];
              
              // Find column indices
              const dateIdx = findColumnIndex(headers, 'date');
              const openIdx = findColumnIndex(headers, 'open');
              const highIdx = findColumnIndex(headers, 'high');
              const lowIdx = findColumnIndex(headers, 'low');
              const closeIdx = findColumnIndex(headers, 'close');

              // Count valid rows and track first/last dates
              let validRowCount = 0;
              let firstDate: string | undefined;
              let lastDate: string | undefined;

              for (const row of rows) {
                const dateStr = row[headers[dateIdx]];
                const time = parseDate(dateStr);
                if (time === null) continue;

                const open = parseNumber(row[headers[openIdx]]);
                const high = parseNumber(row[headers[highIdx]]);
                const low = parseNumber(row[headers[lowIdx]]);
                const close = parseNumber(row[headers[closeIdx]]);

                if (open !== null && high !== null && low !== null && close !== null) {
                  validRowCount++;

                  // Track first and last dates
                  if (!firstDate) {
                    firstDate = dateStr;
                  }
                  lastDate = dateStr;
                }
              }

              // Identify indicator columns
              const indicatorColumns = headers.filter((h) => {
                const normalized = normalizeColumnName(h);
                return !['date', 'open', 'high', 'low', 'close'].includes(normalized);
              });

              const nameWithoutExt = filename.replace(/\.csv$/i, '');

              // Extract code and data source from filename: {code}_{dataSource}.csv or {code}.csv
              const nameParts = nameWithoutExt.split('_');
              const code = nameParts[0];

              // Use custom name if exists
              const name = customNames[filename] || code; // Use custom name or code as fallback

              let dataSource: string | undefined;
              if (nameParts.length > 1) {
                // Has data source: {code}_{dataSource}
                dataSource = nameParts.slice(1).join('_');
              } else {
                // Legacy format: {code} - default to stock_zh_a_hist
                dataSource = 'stock_zh_a_hist';
              }

              resolve({
                name,
                code,
                filename,
                columns: headers,
                indicators: indicatorColumns,
                rowCount: validRowCount,
                dataSource,
                firstDate,
                lastDate,
                lastUpdate,
              });
            },
            error: (error: Error) => {
              reject(new Error(`CSV parsing error: ${error.message}`));
            },
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Failed to parse CSV'));
        }
      },
      error: (error: Error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
}

