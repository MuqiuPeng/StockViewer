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
import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';

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
  { symbol: '000001', dataSource: 'stock_zh_a_hist', name: '平安银行' },
  { symbol: '600519', dataSource: 'stock_zh_a_hist', name: '贵州茅台' },
  { symbol: '000858', dataSource: 'stock_zh_a_hist', name: '五粮液' },
  { symbol: '601318', dataSource: 'stock_zh_a_hist', name: '中国平安' },
  { symbol: '000333', dataSource: 'stock_zh_a_hist', name: '美的集团' },
  // A股指数
  { symbol: '000001', dataSource: 'index_zh_a_hist', name: '上证指数' },
  { symbol: '399001', dataSource: 'index_zh_a_hist', name: '深证成指' },
  { symbol: '399006', dataSource: 'index_zh_a_hist', name: '创业板指' },
  // ETF
  { symbol: '510300', dataSource: 'fund_etf_hist_em', name: '沪深300ETF' },
  { symbol: '510500', dataSource: 'fund_etf_hist_em', name: '中证500ETF' },
];

/**
 * Get Python executable path
 */
function getPythonExecutable(): string {
  const projectRoot = process.cwd();
  const venvNames = ['python-venv', 'venv', '.venv', 'aktools-env'];

  for (const venvName of venvNames) {
    const venvPath = path.join(projectRoot, venvName);
    const venvPython = process.platform === 'win32'
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');

    if (existsSync(venvPython)) {
      return venvPython;
    }
  }

  return 'python3';
}

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
  const pythonCode = `
import akshare as ak
import json
import sys

symbol = "${symbol}"
data_source = "${dataSource}"
start_date = "${startDate}"
end_date = "${endDate}"

try:
    # Fetch data based on data source
    if data_source == "stock_zh_a_hist":
        df = ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start_date, end_date=end_date, adjust="qfq")
    elif data_source == "stock_hk_hist":
        df = ak.stock_hk_hist(symbol=symbol, period="daily", start_date=start_date, end_date=end_date, adjust="qfq")
    elif data_source == "stock_us_hist":
        df = ak.stock_us_hist(symbol=symbol, period="daily", start_date=start_date, end_date=end_date, adjust="qfq")
    elif data_source == "fund_etf_hist_em":
        df = ak.fund_etf_hist_em(symbol=symbol, period="daily", start_date=start_date, end_date=end_date, adjust="qfq")
    elif data_source == "index_zh_a_hist":
        df = ak.index_zh_a_hist(symbol=symbol, period="daily", start_date=start_date, end_date=end_date)
    else:
        raise ValueError(f"Unsupported data source: {data_source}")

    # Rename columns to English
    column_map = {
        "日期": "date",
        "开盘": "open",
        "收盘": "close",
        "最高": "high",
        "最低": "low",
        "成交量": "volume",
        "成交额": "turnover",
        "振幅": "amplitude",
        "涨跌幅": "change_pct",
        "涨跌额": "change_amount",
        "换手率": "turnover_rate",
    }
    df = df.rename(columns=column_map)

    # Convert date to string
    if "date" in df.columns:
        df["date"] = df["date"].astype(str)

    # Convert to list of dicts
    records = df.to_dict(orient="records")

    print(json.dumps({
        "success": True,
        "rowCount": len(records),
        "firstDate": records[0]["date"] if records else None,
        "lastDate": records[-1]["date"] if records else None,
        "data": records
    }))
except Exception as e:
    print(json.dumps({
        "success": False,
        "error": str(e)
    }))
`;

  return new Promise((resolve) => {
    const pythonExecutable = getPythonExecutable();
    const python = spawn(pythonExecutable, ['-c', pythonCode]);
    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: `Python exited with code ${code}: ${stderr}` });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        resolve({ success: false, error: `Failed to parse Python output: ${stdout}` });
      }
    });

    python.on('error', (err) => {
      resolve({ success: false, error: `Failed to spawn Python: ${err.message}` });
    });
  });
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
  console.log(`Python executable: ${getPythonExecutable()}`);

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
