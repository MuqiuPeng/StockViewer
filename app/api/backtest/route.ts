/**
 * Backtest API
 * POST /api/backtest - Run a backtest on stock(s)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiStorage } from '@/lib/api-auth';
import { executeBacktest, BacktestInput, BacktestResult } from '@/lib/backtest-executor';
import { getStockPrices } from '@/lib/stock-storage';
import { createBacktestHistoryEntry, BacktestHistoryEntry } from '@/lib/backtest-history-storage';

export const runtime = 'nodejs';

interface BacktestRequest {
  strategyId: string;
  target: {
    type: 'single' | 'portfolio' | 'group';
    stockId?: string;
    stockIds?: string[];
    groupId?: string;
  };
  parameters: {
    initialCash?: number;
    commission?: number;
    startDate?: string;
    endDate?: string;
    strategyParameters?: Record<string, any>;
    constraints?: any;
  };
  saveToHistory?: boolean;
}

// Build data records from stock prices for backtest
async function buildDataRecords(
  stockId: string,
  startDate?: Date,
  endDate?: Date
): Promise<Record<string, any>[]> {
  const prices = await getStockPrices(stockId, { startDate, endDate });

  // Get cached indicator values for this stock
  const indicatorValues = await prisma.indicatorValue.findMany({
    where: {
      stockId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      indicator: {
        select: { outputColumn: true, isGroup: true, groupName: true },
      },
    },
  });

  // Build value maps by date
  const valuesByDate = new Map<string, Record<string, number | null>>();
  for (const iv of indicatorValues) {
    const dateKey = iv.date.toISOString().split('T')[0];
    if (!valuesByDate.has(dateKey)) {
      valuesByDate.set(dateKey, {});
    }
    const values = valuesByDate.get(dateKey)!;

    if (iv.indicator.isGroup && iv.groupValues) {
      const groupValues = iv.groupValues as Record<string, number | null>;
      for (const [key, val] of Object.entries(groupValues)) {
        values[`${iv.indicator.groupName}:${key}`] = val;
      }
    } else if (iv.value !== null) {
      values[iv.indicator.outputColumn] = Number(iv.value);
    }
  }

  return prices.map(price => {
    const dateKey = price.date.toISOString().split('T')[0];
    const indicators = valuesByDate.get(dateKey) || {};

    return {
      date: dateKey,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: Number(price.volume),
      ...indicators,
    };
  });
}

// POST /api/backtest - Run backtest
export async function POST(request: Request) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const { storage, userId } = authResult;

    const body: BacktestRequest = await request.json();
    const { strategyId, target, parameters, saveToHistory = true } = body;

    // Validate request
    if (!strategyId) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'strategyId is required' },
        { status: 400 }
      );
    }

    if (!target || !target.type) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'target with type is required' },
        { status: 400 }
      );
    }

    // Load strategy
    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Check access - user must own the strategy or have access to it
    const isOwner = strategy.createdBy === userId;
    const isPublic = strategy.visibleTo.length === 0;
    const hasAccess = strategy.visibleTo.includes(userId);

    if (!isOwner && !isPublic && !hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this strategy' },
        { status: 403 }
      );
    }

    // Parse dates
    const startDate = parameters.startDate ? new Date(parameters.startDate) : undefined;
    const endDate = parameters.endDate ? new Date(parameters.endDate) : undefined;

    // Build backtest input based on target type
    let backtestInput: BacktestInput;
    let stockIds: string[] = [];
    let symbols: string[] = [];

    if (target.type === 'single') {
      if (!target.stockId) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'stockId is required for single backtest' },
          { status: 400 }
        );
      }

      stockIds = [target.stockId];

      // Get stock info
      const stock = await prisma.stock.findUnique({
        where: { id: target.stockId },
      });

      if (!stock) {
        return NextResponse.json(
          { error: 'Stock not found' },
          { status: 404 }
        );
      }

      symbols = [stock.symbol];

      // Build data records
      const data = await buildDataRecords(target.stockId, startDate, endDate);

      if (data.length === 0) {
        return NextResponse.json(
          { error: 'No data available for backtest' },
          { status: 400 }
        );
      }

      backtestInput = {
        strategyCode: strategy.pythonCode,
        data,
        strategyType: 'single',
        initialCash: parameters.initialCash || 100000,
        commission: parameters.commission || 0.001,
        parameters: parameters.strategyParameters || strategy.parameters as Record<string, any> || {},
        externalDatasets: strategy.externalDatasets as Record<string, { groupId: string; datasetName: string }> | undefined,
      };
    } else if (target.type === 'portfolio' || target.type === 'group') {
      // Get stock IDs from group or direct list
      if (target.type === 'group' && target.groupId) {
        const group = await prisma.stockGroup.findUnique({
          where: { id: target.groupId },
        });

        if (!group) {
          return NextResponse.json(
            { error: 'Group not found' },
            { status: 404 }
          );
        }

        stockIds = group.stockIds;
      } else if (target.stockIds) {
        stockIds = target.stockIds;
      }

      if (stockIds.length === 0) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'No stocks specified for portfolio backtest' },
          { status: 400 }
        );
      }

      // Get stock info and build data map
      const stocks = await prisma.stock.findMany({
        where: { id: { in: stockIds } },
      });

      symbols = stocks.map(s => s.symbol);

      const dataMap: Record<string, Record<string, any>[]> = {};

      for (const stock of stocks) {
        const data = await buildDataRecords(stock.id, startDate, endDate);
        if (data.length > 0) {
          dataMap[stock.symbol] = data;
        }
      }

      if (Object.keys(dataMap).length === 0) {
        return NextResponse.json(
          { error: 'No data available for backtest' },
          { status: 400 }
        );
      }

      backtestInput = {
        strategyCode: strategy.pythonCode,
        dataMap,
        strategyType: 'portfolio',
        initialCash: parameters.initialCash || 100000,
        commission: parameters.commission || 0.001,
        parameters: parameters.strategyParameters || strategy.parameters as Record<string, any> || {},
        constraints: parameters.constraints || strategy.constraints as any || {},
        externalDatasets: strategy.externalDatasets as Record<string, { groupId: string; datasetName: string }> | undefined,
      };
    } else {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Invalid target type' },
        { status: 400 }
      );
    }

    // Execute backtest
    const result: BacktestResult = await executeBacktest(backtestInput);

    // Save to history if requested and successful
    let historyEntry: BacktestHistoryEntry | null = null;

    if (saveToHistory && result.success && result.metrics) {
      // Calculate duration
      const firstDate = result.equityCurve?.[0]?.date;
      const lastDate = result.equityCurve?.[result.equityCurve.length - 1]?.date;
      const duration = firstDate && lastDate
        ? Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      historyEntry = await createBacktestHistoryEntry({
        strategyId: strategy.id,
        strategyName: strategy.name,
        strategyType: strategy.strategyType as 'single' | 'portfolio',
        target: {
          type: target.type,
          stockId: target.stockId,
          symbols,
          groupId: target.groupId,
        },
        parameters: {
          initialCash: parameters.initialCash || 100000,
          commission: parameters.commission || 0.001,
          startDate: parameters.startDate,
          endDate: parameters.endDate,
          strategyParameters: parameters.strategyParameters,
          constraints: parameters.constraints,
        },
        result,
        starred: false,
        summary: {
          totalReturn: result.metrics.totalReturn,
          totalReturnPct: result.metrics.totalReturnPct,
          sharpeRatio: result.metrics.sharpeRatio,
          tradeCount: result.metrics.tradeCount,
          duration,
        },
      }, storage);
    }

    return NextResponse.json({
      success: result.success,
      result,
      historyEntry: historyEntry ? { id: historyEntry.id } : null,
    });
  } catch (error) {
    console.error('Error running backtest:', error);
    return NextResponse.json(
      {
        error: 'Failed to run backtest',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
