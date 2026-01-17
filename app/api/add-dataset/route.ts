/**
 * Add dataset API (alias for /api/stocks/import)
 * POST /api/add-dataset - Import stock data
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { Prisma } from '@prisma/client';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

// Supported data sources
const SUPPORTED_DATA_SOURCES = [
  'stock_zh_a_hist',      // A股历史数据
  'stock_hk_hist',        // 港股历史数据
  'stock_us_hist',        // 美股历史数据
  'fund_etf_hist_em',     // ETF基金历史数据
  'index_zh_a_hist',      // A股指数历史数据
];

// POST /api/add-dataset - Import stock data
export async function POST(request: Request) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const body = await request.json();
    const { symbol, dataSource, name, startDate, endDate } = body;

    // Validate required fields
    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json(
        { error: 'Invalid input', message: 'symbol is required' },
        { status: 400 }
      );
    }

    if (!dataSource || !SUPPORTED_DATA_SOURCES.includes(dataSource)) {
      return NextResponse.json(
        { error: 'Invalid input', message: `dataSource must be one of: ${SUPPORTED_DATA_SOURCES.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if stock already exists
    const existingStock = await prisma.stock.findFirst({
      where: { symbol, dataSource },
    });

    if (existingStock && existingStock.rowCount > 0) {
      return NextResponse.json({
        success: true,
        message: 'Stock already exists',
        stock: {
          id: existingStock.id,
          symbol: existingStock.symbol,
          name: existingStock.name,
          dataSource: existingStock.dataSource,
          rowCount: existingStock.rowCount,
        },
      });
    }

    // Fetch data from AKShare via Python
    const result = await fetchStockData(symbol, dataSource, startDate, endDate);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to fetch data', message: result.error },
        { status: 500 }
      );
    }

    // Upsert stock
    const stock = await prisma.stock.upsert({
      where: {
        symbol_dataSource: { symbol, dataSource },
      },
      create: {
        symbol,
        name: name || symbol,
        dataSource,
        firstDate: result.firstDate ? new Date(result.firstDate) : null,
        lastDate: result.lastDate ? new Date(result.lastDate) : null,
        rowCount: 0,
      },
      update: {
        name: name || symbol,
        lastUpdate: new Date(),
      },
    });

    // Delete existing price data
    await prisma.stockPrice.deleteMany({
      where: { stockId: stock.id },
    });

    // Insert price data in batches
    const batchSize = 1000;
    const records = result.data;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

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
    }

    // Update stock metadata
    await prisma.stock.update({
      where: { id: stock.id },
      data: {
        firstDate: result.firstDate ? new Date(result.firstDate) : null,
        lastDate: result.lastDate ? new Date(result.lastDate) : null,
        rowCount: records.length,
        lastUpdate: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${records.length} records`,
      stock: {
        id: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        dataSource: stock.dataSource,
        rowCount: records.length,
      },
    });
  } catch (error) {
    console.error('Error adding dataset:', error);
    return NextResponse.json(
      { error: 'Failed to add dataset', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Fetch stock data from AKShare via Python
 */
async function fetchStockData(
  symbol: string,
  dataSource: string,
  startDate?: string,
  endDate?: string
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
start_date = "${startDate || ''}"
end_date = "${endDate || ''}"

try:
    # Fetch data based on data source
    if data_source == "stock_zh_a_hist":
        df = ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start_date or "19900101", end_date=end_date or "21001231", adjust="qfq")
    elif data_source == "stock_hk_hist":
        df = ak.stock_hk_hist(symbol=symbol, period="daily", start_date=start_date or "19900101", end_date=end_date or "21001231", adjust="qfq")
    elif data_source == "stock_us_hist":
        df = ak.stock_us_hist(symbol=symbol, period="daily", start_date=start_date or "19900101", end_date=end_date or "21001231", adjust="qfq")
    elif data_source == "fund_etf_hist_em":
        df = ak.fund_etf_hist_em(symbol=symbol, period="daily", start_date=start_date or "19900101", end_date=end_date or "21001231", adjust="qfq")
    elif data_source == "index_zh_a_hist":
        df = ak.index_zh_a_hist(symbol=symbol, period="daily", start_date=start_date or "19900101", end_date=end_date or "21001231")
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
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python3';
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
