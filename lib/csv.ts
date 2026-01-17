/**
 * CSV parsing utilities
 *
 * Note: This module is deprecated and will be replaced by database-based
 * stock data access in Phase 3. The functionality is temporarily maintained
 * for backward compatibility.
 */

import Papa from 'papaparse';
import { readFile } from 'fs/promises';
import { getCsvFileStats, hasRequiredColumns } from './datasets';
import { findStock } from './stock-storage';

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
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const trimmed = dateStr.trim();
  const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return `${year}-${month}-${day}`;
  }

  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    return null;
  }

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
 * Load and parse a CSV dataset from local file system
 * @deprecated Use database storage (Stock/StockPrice tables) instead
 */
export async function loadDataset(filename: string): Promise<DatasetData> {
  const fileStats = await getCsvFileStats(filename);
  if (!fileStats.exists) {
    throw new Error(`Dataset file not found: ${filename}`);
  }
  const fileContent = await readFile(fileStats.path, 'utf-8');

  // Try to get stock metadata from database
  const nameWithoutExt = filename.replace(/\.csv$/i, '');
  const nameParts = nameWithoutExt.split('_');
  const code = nameParts[0];
  const dataSource = nameParts.length > 1 ? nameParts.slice(1).join('_') : 'stock_zh_a_hist';

  let stockName = code;
  try {
    const stock = await findStock(code, dataSource);
    if (stock) {
      stockName = stock.name;
    }
  } catch {
    // Ignore errors, use code as name
  }

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

          const dateIdx = findColumnIndex(headers, 'date');
          const openIdx = findColumnIndex(headers, 'open');
          const highIdx = findColumnIndex(headers, 'high');
          const lowIdx = findColumnIndex(headers, 'low');
          const closeIdx = findColumnIndex(headers, 'close');

          const indicatorColumns = headers.filter((h) => {
            const normalized = normalizeColumnName(h);
            return !['date', 'open', 'high', 'low', 'close'].includes(normalized);
          });

          const candles: CandleData[] = [];
          const indicatorData: Record<string, IndicatorData[]> = {};

          indicatorColumns.forEach(col => {
            indicatorData[col] = [];
          });

          for (const row of rows) {
            const dateStr = row[headers[dateIdx]];
            const time = parseDate(dateStr);
            if (time === null) {
              continue;
            }

            const open = parseNumber(row[headers[openIdx]]);
            const high = parseNumber(row[headers[highIdx]]);
            const low = parseNumber(row[headers[lowIdx]]);
            const close = parseNumber(row[headers[closeIdx]]);

            if (open === null || high === null || low === null || close === null) {
              continue;
            }

            candles.push({ time, open, high, low, close });

            indicatorColumns.forEach(col => {
              const value = parseNumber(row[col]);
              indicatorData[col].push({ time, value });
            });
          }

          candles.sort((a, b) => a.time.localeCompare(b.time));
          indicatorColumns.forEach(col => {
            indicatorData[col].sort((a, b) => a.time.localeCompare(b.time));
          });

          if (candles.length === 0) {
            reject(new Error('No valid rows found in CSV file'));
            return;
          }

          const candleTimeSet = new Set(candles.map(c => c.time));

          indicatorColumns.forEach(col => {
            const indicator = indicatorData[col];
            const indicatorMap = new Map<string, number | null>();
            indicator.forEach(d => {
              indicatorMap.set(d.time, d.value);
            });

            const filledData: IndicatorData[] = candles.map(candle => ({
              time: candle.time,
              value: indicatorMap.get(candle.time) ?? 0,
            }));

            indicatorData[col] = filledData;
          });

          resolve({
            meta: {
              name: stockName,
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
 * @deprecated Use database storage (Stock table) instead
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

  const { stat } = await import('fs/promises');
  const stats = await stat(fileStats.path);
  const lastUpdate = stats.mtime.toISOString();

  const nameWithoutExt = filename.replace(/\.csv$/i, '');
  const nameParts = nameWithoutExt.split('_');
  const code = nameParts[0];
  const dataSource = nameParts.length > 1 ? nameParts.slice(1).join('_') : 'stock_zh_a_hist';

  let stockName = code;
  try {
    const stock = await findStock(code, dataSource);
    if (stock) {
      stockName = stock.name;
    }
  } catch {
    // Ignore errors, use code as name
  }

  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        try {
          const rows = results.data as Record<string, string>[];
          const headers = results.meta.fields || [];

          if (!headers || headers.length === 0) {
            reject(new Error('CSV file has no headers'));
            return;
          }

          if (!hasRequiredColumns(headers)) {
            reject(new Error(`CSV file missing required columns`));
            return;
          }

          const dateIdx = findColumnIndex(headers, 'date');
          const openIdx = findColumnIndex(headers, 'open');
          const highIdx = findColumnIndex(headers, 'high');
          const lowIdx = findColumnIndex(headers, 'low');
          const closeIdx = findColumnIndex(headers, 'close');

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
              if (!firstDate) {
                firstDate = dateStr;
              }
              lastDate = dateStr;
            }
          }

          const indicatorColumns = headers.filter((h) => {
            const normalized = normalizeColumnName(h);
            return !['date', 'open', 'high', 'low', 'close'].includes(normalized);
          });

          resolve({
            name: stockName,
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
