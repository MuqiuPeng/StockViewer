/**
 * Stock storage module
 * Uses Prisma to access the Stock and StockPrice tables directly
 *
 * This replaces the old dataset-metadata.ts module.
 * Stock data is shared across all users (not user-scoped).
 */

import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

/**
 * Stock metadata (from Stock table)
 */
export interface StockMetadata {
  id: string;
  symbol: string;
  name: string;
  dataSource: string;
  category?: string | null;
  exchange?: string | null;
  firstDate?: Date | null;
  lastDate?: Date | null;
  lastUpdate?: Date | null;
  rowCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Stock price data point (from StockPrice table)
 */
export interface StockPriceData {
  id: string;
  stockId: string;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: bigint;
  turnover?: number | null;
  amplitude?: number | null;
  changePct?: number | null;
  changeAmount?: number | null;
  turnoverRate?: number | null;
}

/**
 * Stock with price data
 */
export interface StockWithPrices extends StockMetadata {
  priceData: StockPriceData[];
}

/**
 * Load all stock metadata
 */
export async function loadAllStocks(): Promise<StockMetadata[]> {
  return prisma.stock.findMany({
    orderBy: { symbol: 'asc' },
  });
}

/**
 * Find stock by ID
 */
export async function getStockById(id: string): Promise<StockMetadata | null> {
  return prisma.stock.findUnique({
    where: { id },
  });
}

/**
 * Find stock by symbol and data source
 */
export async function getStockBySymbol(
  symbol: string,
  dataSource: string
): Promise<StockMetadata | null> {
  return prisma.stock.findFirst({
    where: { symbol, dataSource },
  });
}

/**
 * Find stock by any identifier (ID, symbol, or name)
 * Priority: ID > symbol (with dataSource) > symbol (first match) > name
 */
export async function findStock(identifier: string, dataSource?: string): Promise<StockMetadata | null> {
  // Try by ID first
  let stock = await prisma.stock.findUnique({
    where: { id: identifier },
  });
  if (stock) return stock;

  // Try by symbol with dataSource
  if (dataSource) {
    stock = await prisma.stock.findFirst({
      where: { symbol: identifier, dataSource },
    });
    if (stock) return stock;
  }

  // Try by symbol (first match)
  stock = await prisma.stock.findFirst({
    where: { symbol: identifier },
  });
  if (stock) return stock;

  // Try by name
  stock = await prisma.stock.findFirst({
    where: { name: identifier },
  });
  return stock;
}

/**
 * Search stocks by keyword (matches symbol or name)
 */
export async function searchStocks(
  query: string,
  options?: {
    dataSource?: string;
    limit?: number;
    offset?: number;
  }
): Promise<StockMetadata[]> {
  const { dataSource, limit = 50, offset = 0 } = options || {};

  return prisma.stock.findMany({
    where: {
      AND: [
        dataSource ? { dataSource } : {},
        {
          OR: [
            { symbol: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
      ],
    },
    orderBy: { symbol: 'asc' },
    take: limit,
    skip: offset,
  });
}

/**
 * Get stocks by data source
 */
export async function getStocksByDataSource(dataSource: string): Promise<StockMetadata[]> {
  return prisma.stock.findMany({
    where: { dataSource },
    orderBy: { symbol: 'asc' },
  });
}

/**
 * Create or update a stock
 */
export async function upsertStock(
  data: {
    symbol: string;
    name: string;
    dataSource: string;
    category?: string;
    exchange?: string;
    firstDate?: Date;
    lastDate?: Date;
    rowCount?: number;
  }
): Promise<StockMetadata> {
  const { symbol, dataSource, ...rest } = data;

  return prisma.stock.upsert({
    where: {
      symbol_dataSource: { symbol, dataSource },
    },
    create: {
      symbol,
      dataSource,
      ...rest,
      lastUpdate: new Date(),
    },
    update: {
      ...rest,
      lastUpdate: new Date(),
    },
  });
}

/**
 * Delete a stock and all its price data
 */
export async function deleteStock(id: string): Promise<void> {
  await prisma.stock.delete({
    where: { id },
  });
}

/**
 * Get stock with price data
 */
export async function getStockWithPrices(
  stockId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<StockWithPrices | null> {
  const { startDate, endDate, limit } = options || {};

  const stock = await prisma.stock.findUnique({
    where: { id: stockId },
    include: {
      priceData: {
        where: {
          AND: [
            startDate ? { date: { gte: startDate } } : {},
            endDate ? { date: { lte: endDate } } : {},
          ],
        },
        orderBy: { date: 'asc' },
        take: limit,
      },
    },
  });

  if (!stock) return null;

  // Convert Decimal to number for price data
  return {
    ...stock,
    priceData: stock.priceData.map(p => ({
      ...p,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      turnover: p.turnover ? Number(p.turnover) : null,
      amplitude: p.amplitude ? Number(p.amplitude) : null,
      changePct: p.changePct ? Number(p.changePct) : null,
      changeAmount: p.changeAmount ? Number(p.changeAmount) : null,
      turnoverRate: p.turnoverRate ? Number(p.turnoverRate) : null,
    })),
  };
}

/**
 * Get price data for a stock
 */
export async function getStockPrices(
  stockId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<StockPriceData[]> {
  const { startDate, endDate, limit, offset = 0 } = options || {};

  const prices = await prisma.stockPrice.findMany({
    where: {
      stockId,
      AND: [
        startDate ? { date: { gte: startDate } } : {},
        endDate ? { date: { lte: endDate } } : {},
      ],
    },
    orderBy: { date: 'asc' },
    take: limit,
    skip: offset,
  });

  // Convert Decimal to number
  return prices.map(p => ({
    ...p,
    open: Number(p.open),
    high: Number(p.high),
    low: Number(p.low),
    close: Number(p.close),
    turnover: p.turnover ? Number(p.turnover) : null,
    amplitude: p.amplitude ? Number(p.amplitude) : null,
    changePct: p.changePct ? Number(p.changePct) : null,
    changeAmount: p.changeAmount ? Number(p.changeAmount) : null,
    turnoverRate: p.turnoverRate ? Number(p.turnoverRate) : null,
  }));
}

/**
 * Bulk insert price data for a stock
 */
export async function insertStockPrices(
  stockId: string,
  prices: Array<{
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: bigint | number;
    turnover?: number;
    amplitude?: number;
    changePct?: number;
    changeAmount?: number;
    turnoverRate?: number;
  }>
): Promise<number> {
  // Use createMany for bulk insert
  const result = await prisma.stockPrice.createMany({
    data: prices.map(p => ({
      stockId,
      date: p.date,
      open: new Prisma.Decimal(p.open),
      high: new Prisma.Decimal(p.high),
      low: new Prisma.Decimal(p.low),
      close: new Prisma.Decimal(p.close),
      volume: BigInt(p.volume),
      turnover: p.turnover !== undefined ? new Prisma.Decimal(p.turnover) : null,
      amplitude: p.amplitude !== undefined ? new Prisma.Decimal(p.amplitude) : null,
      changePct: p.changePct !== undefined ? new Prisma.Decimal(p.changePct) : null,
      changeAmount: p.changeAmount !== undefined ? new Prisma.Decimal(p.changeAmount) : null,
      turnoverRate: p.turnoverRate !== undefined ? new Prisma.Decimal(p.turnoverRate) : null,
    })),
    skipDuplicates: true,
  });

  // Update stock metadata
  await prisma.stock.update({
    where: { id: stockId },
    data: {
      rowCount: { increment: result.count },
      lastUpdate: new Date(),
    },
  });

  return result.count;
}

/**
 * Delete all price data for a stock
 */
export async function deleteStockPrices(stockId: string): Promise<number> {
  const result = await prisma.stockPrice.deleteMany({
    where: { stockId },
  });

  // Update stock metadata
  await prisma.stock.update({
    where: { id: stockId },
    data: {
      rowCount: 0,
      firstDate: null,
      lastDate: null,
      lastUpdate: new Date(),
    },
  });

  return result.count;
}

/**
 * Get unique data sources
 */
export async function getDataSources(): Promise<string[]> {
  const result = await prisma.stock.findMany({
    select: { dataSource: true },
    distinct: ['dataSource'],
  });
  return result.map(r => r.dataSource);
}

/**
 * Count stocks
 */
export async function countStocks(dataSource?: string): Promise<number> {
  return prisma.stock.count({
    where: dataSource ? { dataSource } : {},
  });
}
