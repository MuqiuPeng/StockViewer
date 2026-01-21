/**
 * Scheduled Dataset Update API
 * POST /api/cron/update-datasets
 *
 * This endpoint is called by Vercel Cron to update all datasets daily.
 * Scheduled to run at 6 PM Beijing time (10:00 UTC) when Chinese markets are closed.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { spawn } from 'child_process';
import { API_CONFIG } from '@/lib/env';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for cron jobs

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

// Helper: format date as YYYYMMDD for AKShare
function formatDateForAKShare(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Helper: add days to a date
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Helper: delay for rate limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch stock data from AKShare API
async function fetchStockData(
  symbol: string,
  dataSource: string,
  startDate?: string,
  endDate?: string
): Promise<{ success: boolean; data?: any[]; error?: string; stockName?: string; firstDate?: string; lastDate?: string }> {
  return new Promise((resolve) => {
    const args = [
      '-c',
      `import akshare as ak; import json; import pandas as pd; df = ak.${dataSource}(symbol="${symbol}"${startDate ? `, start_date="${startDate}"` : ''}${endDate ? `, end_date="${endDate}"` : ''}); df['日期'] = df['日期'].astype(str) if '日期' in df.columns else df.index.astype(str); print(json.dumps(df.to_dict('records')))`
    ];

    const pythonProcess = spawn('python3', args);
    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
        return;
      }

      try {
        const data = JSON.parse(stdout);
        if (!Array.isArray(data) || data.length === 0) {
          resolve({ success: true, data: [] });
          return;
        }

        // Transform data to consistent format
        const transformed = data.map((row: any) => ({
          date: row['日期'] || row['date'],
          open: parseFloat(row['开盘'] || row['open'] || 0),
          high: parseFloat(row['最高'] || row['high'] || 0),
          low: parseFloat(row['最低'] || row['low'] || 0),
          close: parseFloat(row['收盘'] || row['close'] || 0),
          volume: parseFloat(row['成交量'] || row['volume'] || 0),
          turnover: row['成交额'] !== undefined ? parseFloat(row['成交额']) : undefined,
          amplitude: row['振幅'] !== undefined ? parseFloat(row['振幅']) : undefined,
          change_pct: row['涨跌幅'] !== undefined ? parseFloat(row['涨跌幅']) : undefined,
          change_amount: row['涨跌额'] !== undefined ? parseFloat(row['涨跌额']) : undefined,
          turnover_rate: row['换手率'] !== undefined ? parseFloat(row['换手率']) : undefined,
        }));

        const dates = transformed.map(r => r.date).filter(Boolean).sort();
        resolve({
          success: true,
          data: transformed,
          firstDate: dates[0],
          lastDate: dates[dates.length - 1],
        });
      } catch (e) {
        resolve({ success: false, error: `Failed to parse response: ${e}` });
      }
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      pythonProcess.kill();
      resolve({ success: false, error: 'Request timeout' });
    }, 60000);
  });
}

// Update a single stock
async function updateStock(stock: {
  id: string;
  symbol: string;
  dataSource: string;
  lastDate: Date | null;
}): Promise<{ success: boolean; newRecords: number; error?: string }> {
  try {
    // Calculate start date (day after last date)
    let startDate: string | undefined;
    if (stock.lastDate) {
      const nextDay = addDays(stock.lastDate, 1);
      startDate = formatDateForAKShare(nextDay);
    }

    // Fetch new data
    const result = await fetchStockData(stock.symbol, stock.dataSource, startDate);

    if (!result.success) {
      return { success: false, newRecords: 0, error: result.error };
    }

    const records = result.data || [];
    if (records.length === 0) {
      // No new data - update lastUpdate timestamp
      await prisma.stock.update({
        where: { id: stock.id },
        data: { lastUpdate: new Date() },
      });
      return { success: true, newRecords: 0 };
    }

    // Insert new records
    let newRecords = 0;
    for (const r of records) {
      const recordDate = new Date(r.date);

      // Check if price exists
      const exists = await prisma.stockPrice.findUnique({
        where: { stockId_date: { stockId: stock.id, date: recordDate } },
      });

      if (!exists) {
        await prisma.stockPrice.create({
          data: {
            stockId: stock.id,
            date: recordDate,
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
          },
        });
        newRecords++;
      }
    }

    // Update stock metadata
    const newRowCount = await prisma.stockPrice.count({
      where: { stockId: stock.id },
    });

    await prisma.stock.update({
      where: { id: stock.id },
      data: {
        lastDate: result.lastDate ? new Date(result.lastDate) : undefined,
        rowCount: newRowCount,
        lastUpdate: new Date(),
      },
    });

    // Clear indicator cache since data changed
    if (newRecords > 0) {
      await prisma.stockIndicator.deleteMany({
        where: { stockId: stock.id },
      });
    }

    return { success: true, newRecords };
  } catch (error) {
    return {
      success: false,
      newRecords: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function POST(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all stocks that need updating (exclude custom_upload)
    const stocks = await prisma.stock.findMany({
      where: {
        dataSource: { not: 'custom_upload' },
      },
      select: {
        id: true,
        symbol: true,
        dataSource: true,
        lastDate: true,
        name: true,
      },
      orderBy: { lastUpdate: 'asc' }, // Update oldest first
    });

    const results = {
      total: stocks.length,
      updated: 0,
      failed: 0,
      skipped: 0,
      newRecords: 0,
      errors: [] as string[],
    };

    // Process stocks with rate limiting
    for (const stock of stocks) {
      const updateResult = await updateStock(stock);

      if (updateResult.success) {
        if (updateResult.newRecords > 0) {
          results.updated++;
          results.newRecords += updateResult.newRecords;
        } else {
          results.skipped++;
        }
      } else {
        results.failed++;
        results.errors.push(`${stock.symbol}: ${updateResult.error}`);
      }

      // Rate limit: 500ms between requests
      await delay(500);
    }

    console.log('Scheduled update completed:', results);

    return NextResponse.json({
      success: true,
      message: 'Scheduled update completed',
      results,
    });
  } catch (error) {
    console.error('Scheduled update failed:', error);
    return NextResponse.json(
      {
        error: 'Update failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET endpoint for manual triggering / status check
export async function GET(request: Request) {
  // Verify cron secret for GET as well
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Return stats about datasets
  const stats = await prisma.stock.groupBy({
    by: ['dataSource'],
    _count: { id: true },
    where: { dataSource: { not: 'custom_upload' } },
  });

  const oldestUpdate = await prisma.stock.findFirst({
    where: { dataSource: { not: 'custom_upload' } },
    orderBy: { lastUpdate: 'asc' },
    select: { symbol: true, lastUpdate: true },
  });

  return NextResponse.json({
    success: true,
    stats: stats.map(s => ({ dataSource: s.dataSource, count: s._count.id })),
    oldestUpdate: oldestUpdate
      ? { symbol: oldestUpdate.symbol, lastUpdate: oldestUpdate.lastUpdate }
      : null,
  });
}
