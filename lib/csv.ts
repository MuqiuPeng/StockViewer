import Papa from 'papaparse';
import { readFile } from 'fs/promises';
import { getCsvFileStats, hasRequiredColumns } from './datasets';
import { findDataset } from './dataset-metadata';
import type { StorageProvider } from './storage/types';

export interface CandleData {
  time: string; // YYYY-MM-DD format to avoid timezone issues
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IndicatorData {
  time: string; // YYYY-MM-DD format to avoid timezone issues
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
 * Parse a date string to YYYY-MM-DD format
 * Extracts date component (YYYY-MM-DD) from various formats
 * Returns string format to avoid timezone conversion issues when displaying on charts
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const trimmed = dateStr.trim();

  // Extract date part (YYYY-MM-DD) from various formats:
  // "2024-01-15", "2024-01-15T00:00:00", "2024-01-15T00:00:00.000+00:00"
  const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateMatch) {
    // Return YYYY-MM-DD format directly
    // This avoids timezone issues when lightweight-charts displays the date
    const [, year, month, day] = dateMatch;
    return `${year}-${month}-${day}`;
  }

  // Fallback: try parsing the full string and extract date
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    return null;
  }

  // Extract YYYY-MM-DD from the parsed date (using UTC to avoid timezone shift)
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
 * @param filename The filename of the dataset
 * @param storage Optional storage provider (required for database mode)
 */
export async function loadDataset(filename: string, storage?: StorageProvider): Promise<DatasetData> {
  let fileContent: string;

  if (storage) {
    // Use storage provider's file store (for database mode with user-scoped files)
    const fileStore = storage.getFileStore();
    const exists = await fileStore.exists(filename);
    if (!exists) {
      throw new Error(`Dataset file not found: ${filename}`);
    }
    fileContent = await fileStore.readText(filename);
  } else {
    // Use direct file system (for local mode)
    const fileStats = await getCsvFileStats(filename);
    if (!fileStats.exists) {
      throw new Error(`Dataset file not found: ${filename}`);
    }
    fileContent = await readFile(fileStats.path, 'utf-8');
  }

  // Get custom name from metadata
  const metadata = await findDataset(filename, storage);

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

          // Sort by time ascending (YYYY-MM-DD format is lexicographically sortable)
          candles.sort((a, b) => a.time.localeCompare(b.time));
          indicatorColumns.forEach(col => {
            indicatorData[col].sort((a, b) => a.time.localeCompare(b.time));
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
            const indicatorMap = new Map<string, number | null>();
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

          // Use name from metadata if exists, otherwise use code
          const name = metadata?.name || code;

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

  // Get custom name from metadata
  const metadata = await findDataset(filename);

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

              // Use name from metadata if exists, otherwise use code
              const name = metadata?.name || code;

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

