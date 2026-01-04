import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const REQUIRED_COLUMNS = ['date', 'open', 'high', 'low', 'close'];

export interface DatasetInfo {
  name: string;
  filename: string;
  columns: string[];
  indicators: string[];
  rowCount: number;
  dataSource?: string; // e.g., 'stock_zh_a_hist'
}

/**
 * Get the CSV directory path from environment variable or default
 */
export function getCsvDirectory(): string {
  const csvDir = process.env.CSV_DIR;
  if (csvDir) {
    return csvDir;
  }
  // Default to ./data/csv relative to project root
  return join(process.cwd(), 'data', 'csv');
}

/**
 * Check if a CSV file has the required columns (case-insensitive)
 */
export function hasRequiredColumns(headers: string[]): boolean {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  return REQUIRED_COLUMNS.every(col => normalizedHeaders.includes(col));
}

/**
 * Get all CSV files in the directory
 */
export async function listCsvFiles(): Promise<string[]> {
  const csvDir = getCsvDirectory();
  try {
    const files = await readdir(csvDir);
    return files.filter(file => file.toLowerCase().endsWith('.csv'));
  } catch (error) {
    // Directory doesn't exist or can't be read
    return [];
  }
}

/**
 * Get file stats for a CSV file
 */
export async function getCsvFileStats(filename: string): Promise<{ exists: boolean; path: string }> {
  const csvDir = getCsvDirectory();
  const filePath = join(csvDir, filename);
  try {
    const stats = await stat(filePath);
    return { exists: stats.isFile(), path: filePath };
  } catch {
    return { exists: false, path: filePath };
  }
}

