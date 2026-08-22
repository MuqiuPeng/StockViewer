/**
 * Add dataset API
 * POST /api/add-dataset - Add stock to user's collection
 *
 * If stock exists in shared pool: just add to user's collection
 * If stock doesn't exist: fetch from Data Service, add to shared pool, then add to collection
 *
 * Update modes:
 * - forceUpdate: true  -> Incremental update (fetch from lastDate+1, preserve existing data)
 * - fullRefresh: true  -> Full refresh (delete all data and re-import)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { Prisma } from '@prisma/client';
import { LogSource } from '@prisma/client';
import { fetchStockDataFromService } from '@/lib/data-service-client';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Supported data sources (canonical IDs from lib/data-sources.ts)
const SUPPORTED_DATA_SOURCES = [
  'cn.stock',
  'cn.stock.b',
  'cn.stock.cdr',
  'hk.stock',
  'us.stock',
  'cn.index',
  'hk.index',
  'us.index',
  'global.index',
  'cn.etf',
  'cn.lof',
  'cn.futures',
  'global.futures',
];

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

// POST /api/add-dataset - Add stock to user's collection
export async function POST(request: Request) {
  try {
    // Get authenticated user
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { userId } = authResult;

    const body = await request.json();
    const { symbol, dataSource, name, startDate, endDate, forceUpdate, fullRefresh } = body;

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

    // Check if stock already exists in shared pool
    let stock = await prisma.stock.findUnique({
      where: {
        symbol_dataSource: { symbol, dataSource },
      },
    });

    // Check if user already has this stock in their collection
    // Skip early return if forceUpdate is true (user wants to refresh data)
    if (stock && !forceUpdate) {
      const existingUserStock = await prisma.userStock.findUnique({
        where: {
          userId_stockId: { userId, stockId: stock.id },
        },
      });

      if (existingUserStock) {
        return NextResponse.json({
          success: true,
          message: 'Stock already in your collection',
          stock: {
            id: stock.id,
            symbol: stock.symbol,
            name: stock.name,
            dataSource: stock.dataSource,
            rowCount: stock.rowCount,
          },
        });
      }

      // Stock exists but not in user's collection - add it
      if (stock.rowCount > 0) {
        await prisma.userStock.create({
          data: {
            userId,
            stockId: stock.id,
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Added existing stock to your collection',
          stock: {
            id: stock.id,
            symbol: stock.symbol,
            name: stock.name,
            dataSource: stock.dataSource,
            rowCount: stock.rowCount,
          },
        });
      }
    }

    // Determine if this is incremental update or full refresh
    const isIncremental = stock && stock.lastDate && forceUpdate && !fullRefresh;

    // Calculate fetch date range
    let fetchStartDate = startDate;
    if (isIncremental && stock && stock.lastDate) {
      // Incremental: fetch from the day after last stored date
      const nextDay = addDays(stock.lastDate, 1);
      fetchStartDate = formatDateForAKShare(nextDay);
    }

    // Fetch stock data from Data Service
    const result = await fetchStockDataFromService(symbol, dataSource, fetchStartDate, endDate);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to fetch data', message: result.error },
        { status: 500 }
      );
    }

    // For incremental update, empty result means data is already up to date
    const records = result.data || [];
    if (records.length === 0 && !isIncremental) {
      return NextResponse.json(
        { error: 'No data returned', message: 'Data source returned no data for this symbol' },
        { status: 400 }
      );
    }

    // Check if stock exists and has a real name (not just symbol)
    const existingStock = await prisma.stock.findUnique({
      where: { symbol_dataSource: { symbol, dataSource } },
      select: { name: true },
    });

    // Determine stock name: user-provided > API-fetched > existing real name > symbol
    // Always prefer API-returned name over a stale name that equals the symbol
    const existingRealName = existingStock?.name && existingStock.name !== symbol ? existingStock.name : null;
    const finalStockName = name || result.stockName || existingRealName || symbol;

    // Create or update stock in shared pool
    stock = await prisma.stock.upsert({
      where: {
        symbol_dataSource: { symbol, dataSource },
      },
      create: {
        symbol,
        name: finalStockName,
        dataSource,
        firstDate: result.firstDate ? new Date(result.firstDate) : null,
        lastDate: result.lastDate ? new Date(result.lastDate) : null,
        rowCount: 0,
      },
      update: {
        name: finalStockName,
        lastUpdate: new Date(),
      },
    });

    let totalRowCount = stock.rowCount;
    let newRecordsCount = 0;
    let updatedRecordsCount = 0;

    if (fullRefresh) {
      // Full refresh mode: delete all existing data and re-import
      await prisma.stockPrice.deleteMany({
        where: { stockId: stock.id },
      });
      await prisma.stockIndicator.deleteMany({
        where: { stockId: stock.id },
      });
      totalRowCount = 0;
    }

    // Process records
    if (records.length > 0) {
      if (isIncremental || fullRefresh) {
        // Incremental/Full refresh: upsert records to preserve IDs for existing dates
        for (const r of records) {
          const recordDate = new Date(r.date);

          // Check if price exists for this date
          const existingPrice = await prisma.stockPrice.findUnique({
            where: {
              stockId_date: { stockId: stock.id, date: recordDate },
            },
          });

          if (existingPrice) {
            // Update existing record (preserves ID, so IndicatorValue remains valid)
            await prisma.stockPrice.update({
              where: { id: existingPrice.id },
              data: {
                open: new Prisma.Decimal(r.open || 0),
                high: new Prisma.Decimal(r.high || 0),
                low: new Prisma.Decimal(r.low || 0),
                close: new Prisma.Decimal(r.close || 0),
                volume: BigInt(Math.round(r.volume || 0)),
                turnover: r.turnover != null ? new Prisma.Decimal(r.turnover) : null,
                amplitude: r.amplitude != null ? new Prisma.Decimal(r.amplitude) : null,
                changePct: r.change_pct != null ? new Prisma.Decimal(r.change_pct) : null,
                changeAmount: r.change_amount != null ? new Prisma.Decimal(r.change_amount) : null,
                turnoverRate: r.turnover_rate != null ? new Prisma.Decimal(r.turnover_rate) : null,
              },
            });
            updatedRecordsCount++;
          } else {
            // Create new record
            await prisma.stockPrice.create({
              data: {
                stockId: stock.id,
                date: recordDate,
                open: new Prisma.Decimal(r.open || 0),
                high: new Prisma.Decimal(r.high || 0),
                low: new Prisma.Decimal(r.low || 0),
                close: new Prisma.Decimal(r.close || 0),
                volume: BigInt(Math.round(r.volume || 0)),
                turnover: r.turnover != null ? new Prisma.Decimal(r.turnover) : null,
                amplitude: r.amplitude != null ? new Prisma.Decimal(r.amplitude) : null,
                changePct: r.change_pct != null ? new Prisma.Decimal(r.change_pct) : null,
                changeAmount: r.change_amount != null ? new Prisma.Decimal(r.change_amount) : null,
                turnoverRate: r.turnover_rate != null ? new Prisma.Decimal(r.turnover_rate) : null,
              },
            });
            newRecordsCount++;
            totalRowCount++;
          }
        }

        // Clear StockIndicator tracking - indicators need recomputation for new data
        // (rolling calculations like SMA depend on recent values)
        await prisma.stockIndicator.deleteMany({
          where: { stockId: stock.id },
        });
      } else {
        // Initial import: batch insert for efficiency
        const batchSize = 1000;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          await prisma.stockPrice.createMany({
            data: batch.map((r: any) => ({
              stockId: stock!.id,
              date: new Date(r.date),
              open: new Prisma.Decimal(r.open || 0),
              high: new Prisma.Decimal(r.high || 0),
              low: new Prisma.Decimal(r.low || 0),
              close: new Prisma.Decimal(r.close || 0),
              volume: BigInt(Math.round(r.volume || 0)),
              turnover: r.turnover != null ? new Prisma.Decimal(r.turnover) : null,
              amplitude: r.amplitude != null ? new Prisma.Decimal(r.amplitude) : null,
              changePct: r.change_pct != null ? new Prisma.Decimal(r.change_pct) : null,
              changeAmount: r.change_amount != null ? new Prisma.Decimal(r.change_amount) : null,
              turnoverRate: r.turnover_rate != null ? new Prisma.Decimal(r.turnover_rate) : null,
            })),
            skipDuplicates: true,
          });
        }
        newRecordsCount = records.length;
        totalRowCount = records.length;
      }
    }

    // Update stock metadata
    const finalRowCount = fullRefresh ? records.length : totalRowCount;
    await prisma.stock.update({
      where: { id: stock.id },
      data: {
        firstDate: fullRefresh && result.firstDate ? new Date(result.firstDate) : undefined,
        lastDate: result.lastDate ? new Date(result.lastDate) : undefined,
        rowCount: finalRowCount,
        lastUpdate: new Date(),
      },
    });

    // Add to user's collection
    await prisma.userStock.upsert({
      where: {
        userId_stockId: { userId, stockId: stock.id },
      },
      create: {
        userId,
        stockId: stock.id,
      },
      update: {},
    });

    // Build response message
    let message: string;
    if (isIncremental) {
      if (newRecordsCount === 0 && updatedRecordsCount === 0) {
        message = 'Data is already up to date';
      } else {
        const parts = [];
        if (newRecordsCount > 0) parts.push(`${newRecordsCount} new`);
        if (updatedRecordsCount > 0) parts.push(`${updatedRecordsCount} updated`);
        message = `Incremental update: ${parts.join(', ')} records`;
      }
    } else if (fullRefresh) {
      message = `Full refresh: imported ${records.length} records`;
    } else {
      message = `Successfully imported ${records.length} records`;
    }

    logger.info(LogSource.API, 'add_dataset', message, { userId, metadata: { symbol, dataSource, rowCount: finalRowCount } });

    return NextResponse.json({
      success: true,
      message,
      stock: {
        id: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        dataSource: stock.dataSource,
        rowCount: finalRowCount,
      },
      updateDetails: isIncremental ? {
        newRecords: newRecordsCount,
        updatedRecords: updatedRecordsCount,
      } : undefined,
    });
  } catch (error) {
    logger.error(LogSource.API, 'add_dataset', error instanceof Error ? error.message : 'Unknown error', { error });
    console.error('Error adding dataset:', error);
    return NextResponse.json(
      { error: 'Failed to add dataset', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

