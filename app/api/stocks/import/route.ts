/**
 * Stock import API
 * POST /api/stocks/import - Create an import job for stock data
 * GET /api/stocks/import - List recent import jobs
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { Prisma } from '@prisma/client';
import { fetchStockDataFromService } from '@/lib/data-service-client';

export const runtime = 'nodejs';

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

// POST /api/stocks/import - Create an import job
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

    // Check if there's already a pending/processing job for this stock
    const existingJob = await prisma.dataImportJob.findFirst({
      where: {
        symbol,
        dataSource,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (existingJob) {
      return NextResponse.json({
        message: 'Import job already exists',
        jobId: existingJob.id,
        status: existingJob.status,
      });
    }

    // Create import job
    const job = await prisma.dataImportJob.create({
      data: {
        symbol,
        dataSource,
        status: 'PENDING',
        message: existingStock ? 'Updating existing stock data' : 'Importing new stock data',
      },
    });

    // Start background import (in production, this would be a queue worker)
    // For now, we'll process it inline but return immediately
    processImportJob(job.id, symbol, dataSource, name, startDate, endDate).catch(err => {
      console.error('Import job failed:', err);
    });

    return NextResponse.json({
      success: true,
      message: 'Import job created',
      jobId: job.id,
      status: job.status,
    });
  } catch (error) {
    console.error('Error creating import job:', error);
    return NextResponse.json(
      { error: 'Failed to create import job', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET /api/stocks/import - List recent import jobs
export async function GET(request: Request) {
  try {
    // Check authentication
    const authError = await requireAuth();
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const status = searchParams.get('status');

    const where: any = {};
    if (status) {
      where.status = status.toUpperCase();
    }

    const jobs = await prisma.dataImportJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Error listing import jobs:', error);
    return NextResponse.json(
      { error: 'Failed to list import jobs', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Process an import job (runs in background)
 */
async function processImportJob(
  jobId: string,
  symbol: string,
  dataSource: string,
  stockName?: string,
  startDate?: string,
  endDate?: string
): Promise<void> {
  try {
    // Update job status
    await prisma.dataImportJob.update({
      where: { id: jobId },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        message: 'Fetching data from Data Service...',
      },
    });

    // Fetch data from Data Service
    const result = await fetchStockDataFromService(symbol, dataSource, startDate, endDate);

    if (!result.success) {
      throw new Error(result.error || 'Unknown error from Data Service');
    }

    const records = result.data || [];

    // Update progress
    await prisma.dataImportJob.update({
      where: { id: jobId },
      data: {
        progress: 50,
        message: `Fetched ${records.length} records, saving to database...`,
      },
    });

    // Check if stock exists and has a real name (not just symbol)
    const existingStock = await prisma.stock.findUnique({
      where: { symbol_dataSource: { symbol, dataSource } },
      select: { name: true },
    });

    // Determine stock name:
    // - For create: user-provided > API-fetched > symbol fallback
    // - For update: user-provided > API-fetched > keep existing (if real name) > symbol
    const hasRealName = existingStock && existingStock.name !== symbol;
    const finalStockName = stockName || result.stockName || (hasRealName ? existingStock.name : symbol);

    // Upsert stock
    const stock = await prisma.stock.upsert({
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

    // Delete existing price data for this stock (for full refresh)
    // This also cascades to delete IndicatorValue records
    await prisma.stockPrice.deleteMany({
      where: { stockId: stock.id },
    });

    // Clear StockIndicator tracking since indicator values are now deleted
    await prisma.stockIndicator.deleteMany({
      where: { stockId: stock.id },
    });

    // Insert price data in batches
    const batchSize = 1000;
    let inserted = 0;

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

      inserted += batch.length;

      // Update progress
      const progress = 50 + Math.round((inserted / records.length) * 50);
      await prisma.dataImportJob.update({
        where: { id: jobId },
        data: {
          progress,
          message: `Saved ${inserted}/${records.length} records...`,
        },
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

    // Mark job as completed
    await prisma.dataImportJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        message: `Successfully imported ${records.length} records for ${symbol}`,
      },
    });
  } catch (error) {
    console.error('Import job error:', error);

    // Update job with error
    const retryCount = await prisma.dataImportJob.findUnique({
      where: { id: jobId },
      select: { retryCount: true },
    });

    await prisma.dataImportJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        retryCount: (retryCount?.retryCount || 0) + 1,
        completedAt: new Date(),
      },
    });
  }
}
