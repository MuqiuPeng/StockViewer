/**
 * Import sample stock data from AKShare
 *
 * This script imports a set of sample stocks into the database for testing.
 * Run with: npx tsx scripts/import-sample-stocks.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient, Prisma } from '@prisma/client';
import { dataService } from '../lib/data-service-client';
import { resolveDataSourceId } from '../lib/data-sources';
import path from 'path';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

// Sample stocks to import
const SAMPLE_STOCKS = [
  // A股
  { symbol: '000001', dataSource: 'cn.stock', name: '平安银行' },
  { symbol: '600519', dataSource: 'cn.stock', name: '贵州茅台' },
  { symbol: '000858', dataSource: 'cn.stock', name: '五粮液' },
  { symbol: '601318', dataSource: 'cn.stock', name: '中国平安' },
  { symbol: '000333', dataSource: 'cn.stock', name: '美的集团' },
  // A股指数
  { symbol: '000001', dataSource: 'cn.index', name: '上证指数' },
  { symbol: '399001', dataSource: 'cn.index', name: '深证成指' },
  { symbol: '399006', dataSource: 'cn.index', name: '创业板指' },
  // ETF
  { symbol: '510300', dataSource: 'cn.etf', name: '沪深300ETF' },
  { symbol: '510500', dataSource: 'cn.etf', name: '中证500ETF' },
];


/**
 * Fetch stock data from AKShare
 */
async function fetchStockData(
  symbol: string,
  dataSource: string,
  startDate: string = '20200101',
  endDate: string = '21001231'
): Promise<{
  success: boolean;
  data?: any[];
  firstDate?: string;
  lastDate?: string;
  error?: string;
}> {
  // Goes through the data-service rather than spawning AKShare here, so that
  // provider access stays in one place. It also removes a code-injection hole:
  // symbol and dataSource were interpolated straight into Python source that
  // was then executed.
  const response = await dataService.getHistory({
    dataSource: resolveDataSourceId(dataSource),
    symbol,
    startDate,
    endDate,
    adjust: 'qfq',
    period: 'daily',
  });

  if (!response.success || !response.data) {
    return {
      success: false,
      error: response.error?.message ?? 'Unknown data-service error',
    };
  }

  return {
    success: true,
    data: response.data.records,
    firstDate: response.data.first_date,
    lastDate: response.data.last_date,
  };
}

/**
 * Import a single stock
 */
async function importStock(
  symbol: string,
  dataSource: string,
  name: string
): Promise<{ success: boolean; rowCount?: number; error?: string }> {
  console.log(`\nImporting ${symbol} (${name}) from ${dataSource}...`);

  // Check if stock already exists
  const existingStock = await prisma.stock.findFirst({
    where: { symbol, dataSource },
  });

  if (existingStock && existingStock.rowCount > 0) {
    console.log(`  Stock already exists with ${existingStock.rowCount} rows, skipping...`);
    return { success: true, rowCount: existingStock.rowCount };
  }

  // Fetch data from AKShare
  const result = await fetchStockData(symbol, dataSource);

  if (!result.success || !result.data) {
    console.log(`  Failed: ${result.error}`);
    return { success: false, error: result.error };
  }

  console.log(`  Fetched ${result.data.length} rows (${result.firstDate} - ${result.lastDate})`);

  // Create or update stock
  const stock = await prisma.stock.upsert({
    where: {
      symbol_dataSource: { symbol, dataSource },
    },
    create: {
      symbol,
      name,
      dataSource,
      firstDate: result.firstDate ? new Date(result.firstDate) : null,
      lastDate: result.lastDate ? new Date(result.lastDate) : null,
      rowCount: 0,
    },
    update: {
      name,
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

  for (let i = 0; i < result.data.length; i += batchSize) {
    const batch = result.data.slice(i, i + batchSize);

    await prisma.stockPrice.createMany({
      data: batch.map((r: any) => ({
        stockId: stock.id,
        date: new Date(r.date),
        open: new Prisma.Decimal(r.open || 0),
        high: new Prisma.Decimal(r.high || 0),
        low: new Prisma.Decimal(r.low || 0),
        close: new Prisma.Decimal(r.close || 0),
        volume: BigInt(Math.round(r.volume || 0)),
        turnover: r.turnover !== undefined ? new Prisma.Decimal(r.turnover) : null,
        amplitude: r.amplitude !== undefined ? new Prisma.Decimal(r.amplitude) : null,
        changePct: r.change_pct !== undefined ? new Prisma.Decimal(r.change_pct) : null,
        changeAmount: r.change_amount !== undefined ? new Prisma.Decimal(r.change_amount) : null,
        turnoverRate: r.turnover_rate !== undefined ? new Prisma.Decimal(r.turnover_rate) : null,
      })),
      skipDuplicates: true,
    });

    inserted += batch.length;
    process.stdout.write(`  Inserted ${inserted}/${result.data.length} rows\r`);
  }

  // Update stock metadata
  await prisma.stock.update({
    where: { id: stock.id },
    data: {
      firstDate: result.firstDate ? new Date(result.firstDate) : null,
      lastDate: result.lastDate ? new Date(result.lastDate) : null,
      rowCount: result.data.length,
      lastUpdate: new Date(),
    },
  });

  console.log(`  Successfully imported ${result.data.length} rows`);
  return { success: true, rowCount: result.data.length };
}

/**
 * Main function
 */
async function main() {
  console.log('=== Import Sample Stocks ===\n');
  console.log(`Data service: ${process.env.DATA_SERVICE_URL || 'http://localhost:8000'}`);

  const results: { symbol: string; name: string; success: boolean; rowCount?: number; error?: string }[] = [];

  for (const stock of SAMPLE_STOCKS) {
    const result = await importStock(stock.symbol, stock.dataSource, stock.name);
    results.push({ ...stock, ...result });
  }

  // Summary
  console.log('\n\n=== Summary ===\n');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\nSuccessful imports:');
    for (const r of successful) {
      console.log(`  - ${r.symbol} (${r.name}): ${r.rowCount} rows`);
    }
  }

  if (failed.length > 0) {
    console.log('\nFailed imports:');
    for (const r of failed) {
      console.log(`  - ${r.symbol} (${r.name}): ${r.error}`);
    }
  }

  // Print total row count
  const totalRows = await prisma.stockPrice.count();
  const totalStocks = await prisma.stock.count();
  console.log(`\nDatabase now has ${totalStocks} stocks with ${totalRows} total price rows`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
