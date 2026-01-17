/**
 * Migrate CSV files to database
 *
 * This script reads existing CSV files and imports them into the Stock and StockPrice tables.
 * Run with: npx tsx scripts/migrate-csv-to-db.ts
 *
 * Options:
 *   --csv-dir <path>  Path to CSV directory (default: data/csv)
 *   --dry-run         Show what would be imported without actually importing
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient, Prisma } from '@prisma/client';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import * as Papa from 'papaparse';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

// Parse command line arguments
const args = process.argv.slice(2);
const csvDirIndex = args.indexOf('--csv-dir');
const csvDir = csvDirIndex !== -1 ? args[csvDirIndex + 1] : path.join(process.cwd(), 'data', 'csv');
const dryRun = args.includes('--dry-run');

/**
 * Parse a date string to Date object
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const trimmed = dateStr.trim();
  const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return new Date(`${year}-${month}-${day}`);
  }

  const date = new Date(trimmed);
  return isNaN(date.getTime()) ? null : date;
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
 * Normalize column name
 */
function normalizeColumnName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Extract stock info from filename
 * Expected format: SYMBOL_datasource.csv or SYMBOL.csv
 */
function parseFilename(filename: string): { symbol: string; dataSource: string } {
  const nameWithoutExt = filename.replace(/\.csv$/i, '');
  const parts = nameWithoutExt.split('_');

  if (parts.length >= 2) {
    return {
      symbol: parts[0],
      dataSource: parts.slice(1).join('_'),
    };
  }

  return {
    symbol: parts[0],
    dataSource: 'stock_zh_a_hist', // Default data source
  };
}

/**
 * Read and parse a CSV file
 */
function readCsvFile(filepath: string): {
  rows: Record<string, string>[];
  headers: string[];
} | null {
  try {
    const content = readFileSync(filepath, 'utf-8');
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    return {
      rows: result.data as Record<string, string>[],
      headers: result.meta.fields || [],
    };
  } catch (error) {
    console.error(`Failed to read ${filepath}:`, error);
    return null;
  }
}

/**
 * Check if CSV has required columns
 */
function hasRequiredColumns(headers: string[]): boolean {
  const normalized = headers.map(normalizeColumnName);
  const required = ['date', 'open', 'high', 'low', 'close'];
  return required.every(col => normalized.includes(col));
}

/**
 * Import a single CSV file
 */
async function importCsvFile(
  filepath: string
): Promise<{ success: boolean; rowCount?: number; error?: string }> {
  const filename = path.basename(filepath);
  const { symbol, dataSource } = parseFilename(filename);

  console.log(`\nImporting ${filename}...`);
  console.log(`  Symbol: ${symbol}, DataSource: ${dataSource}`);

  // Read CSV
  const csvData = readCsvFile(filepath);
  if (!csvData) {
    return { success: false, error: 'Failed to read CSV file' };
  }

  const { rows, headers } = csvData;

  // Validate columns
  if (!hasRequiredColumns(headers)) {
    return {
      success: false,
      error: `Missing required columns. Found: ${headers.join(', ')}. Required: date, open, high, low, close`,
    };
  }

  // Find column indices
  const normalizedHeaders = headers.map(normalizeColumnName);
  const getHeader = (name: string) => headers[normalizedHeaders.indexOf(name)];

  const dateHeader = getHeader('date');
  const openHeader = getHeader('open');
  const highHeader = getHeader('high');
  const lowHeader = getHeader('low');
  const closeHeader = getHeader('close');
  const volumeHeader = normalizedHeaders.includes('volume') ? getHeader('volume') : null;
  const turnoverHeader = normalizedHeaders.includes('turnover') ? getHeader('turnover') : null;
  const amplitudeHeader = normalizedHeaders.includes('amplitude') ? getHeader('amplitude') : null;
  const changePctHeader = normalizedHeaders.includes('change_pct') ? getHeader('change_pct') : null;
  const changeAmountHeader = normalizedHeaders.includes('change_amount') ? getHeader('change_amount') : null;
  const turnoverRateHeader = normalizedHeaders.includes('turnover_rate') ? getHeader('turnover_rate') : null;

  // Parse rows
  const priceRecords: {
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: bigint;
    turnover: number | null;
    amplitude: number | null;
    changePct: number | null;
    changeAmount: number | null;
    turnoverRate: number | null;
  }[] = [];

  for (const row of rows) {
    const date = parseDate(row[dateHeader]);
    const open = parseNumber(row[openHeader]);
    const high = parseNumber(row[highHeader]);
    const low = parseNumber(row[lowHeader]);
    const close = parseNumber(row[closeHeader]);

    if (!date || open === null || high === null || low === null || close === null) {
      continue; // Skip invalid rows
    }

    const volume = volumeHeader ? parseNumber(row[volumeHeader]) : 0;

    priceRecords.push({
      date,
      open,
      high,
      low,
      close,
      volume: BigInt(Math.round(volume || 0)),
      turnover: turnoverHeader ? parseNumber(row[turnoverHeader]) : null,
      amplitude: amplitudeHeader ? parseNumber(row[amplitudeHeader]) : null,
      changePct: changePctHeader ? parseNumber(row[changePctHeader]) : null,
      changeAmount: changeAmountHeader ? parseNumber(row[changeAmountHeader]) : null,
      turnoverRate: turnoverRateHeader ? parseNumber(row[turnoverRateHeader]) : null,
    });
  }

  if (priceRecords.length === 0) {
    return { success: false, error: 'No valid rows found in CSV' };
  }

  // Sort by date
  priceRecords.sort((a, b) => a.date.getTime() - b.date.getTime());

  const firstDate = priceRecords[0].date;
  const lastDate = priceRecords[priceRecords.length - 1].date;

  console.log(`  Found ${priceRecords.length} valid rows (${firstDate.toISOString().split('T')[0]} - ${lastDate.toISOString().split('T')[0]})`);

  if (dryRun) {
    console.log('  [DRY RUN] Would import to database');
    return { success: true, rowCount: priceRecords.length };
  }

  // Create or update stock
  const stock = await prisma.stock.upsert({
    where: {
      symbol_dataSource: { symbol, dataSource },
    },
    create: {
      symbol,
      name: symbol, // Use symbol as name by default
      dataSource,
      firstDate,
      lastDate,
      rowCount: 0,
    },
    update: {
      lastUpdate: new Date(),
    },
  });

  // Delete existing price data
  await prisma.stockPrice.deleteMany({
    where: { stockId: stock.id },
  });

  // Insert price data in batches
  const batchSize = 1000;
  let inserted = 0;

  for (let i = 0; i < priceRecords.length; i += batchSize) {
    const batch = priceRecords.slice(i, i + batchSize);

    await prisma.stockPrice.createMany({
      data: batch.map((r) => ({
        stockId: stock.id,
        date: r.date,
        open: new Prisma.Decimal(r.open),
        high: new Prisma.Decimal(r.high),
        low: new Prisma.Decimal(r.low),
        close: new Prisma.Decimal(r.close),
        volume: r.volume,
        turnover: r.turnover !== null ? new Prisma.Decimal(r.turnover) : null,
        amplitude: r.amplitude !== null ? new Prisma.Decimal(r.amplitude) : null,
        changePct: r.changePct !== null ? new Prisma.Decimal(r.changePct) : null,
        changeAmount: r.changeAmount !== null ? new Prisma.Decimal(r.changeAmount) : null,
        turnoverRate: r.turnoverRate !== null ? new Prisma.Decimal(r.turnoverRate) : null,
      })),
      skipDuplicates: true,
    });

    inserted += batch.length;
    process.stdout.write(`  Inserted ${inserted}/${priceRecords.length} rows\r`);
  }

  // Update stock metadata
  await prisma.stock.update({
    where: { id: stock.id },
    data: {
      firstDate,
      lastDate,
      rowCount: priceRecords.length,
      lastUpdate: new Date(),
    },
  });

  console.log(`  Successfully imported ${priceRecords.length} rows`);
  return { success: true, rowCount: priceRecords.length };
}

/**
 * Main function
 */
async function main() {
  console.log('=== Migrate CSV to Database ===\n');
  console.log(`CSV Directory: ${csvDir}`);
  console.log(`Dry Run: ${dryRun}`);

  // Check if directory exists
  if (!existsSync(csvDir)) {
    console.log(`\nCSV directory not found: ${csvDir}`);
    return;
  }

  // Find all CSV files
  const files = readdirSync(csvDir).filter(f => f.toLowerCase().endsWith('.csv'));

  if (files.length === 0) {
    console.log('\nNo CSV files found in directory');
    return;
  }

  console.log(`\nFound ${files.length} CSV files`);

  const results: { filename: string; success: boolean; rowCount?: number; error?: string }[] = [];

  for (const file of files) {
    const filepath = path.join(csvDir, file);

    // Skip directories
    if (statSync(filepath).isDirectory()) {
      continue;
    }

    const result = await importCsvFile(filepath);
    results.push({ filename: file, ...result });
  }

  // Summary
  console.log('\n\n=== Summary ===\n');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    const totalRows = successful.reduce((sum, r) => sum + (r.rowCount || 0), 0);
    console.log(`\nSuccessful imports (${totalRows} total rows):`);
    for (const r of successful) {
      console.log(`  - ${r.filename}: ${r.rowCount} rows`);
    }
  }

  if (failed.length > 0) {
    console.log('\nFailed imports:');
    for (const r of failed) {
      console.log(`  - ${r.filename}: ${r.error}`);
    }
  }

  if (!dryRun) {
    // Print total row count in database
    const totalRows = await prisma.stockPrice.count();
    const totalStocks = await prisma.stock.count();
    console.log(`\nDatabase now has ${totalStocks} stocks with ${totalRows} total price rows`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
