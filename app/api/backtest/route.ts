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

  // Get cached indicator values for this stock using stockPriceId-based join
  // Include indicator metadata and stockPrice for date info
  const indicatorValues = await prisma.indicatorValue.findMany({
    where: {
      stockPrice: {
        stockId,
        ...(startDate || endDate ? {
          date: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        } : {}),
      },
    },
    include: {
      indicator: {
        select: { outputColumn: true, isGroup: true, groupName: true, version: true },
      },
      stockPrice: {
        select: { date: true },
      },
    },
  });

  // Filter to only include values with current version
  const validValues = indicatorValues.filter(iv => iv.version === iv.indicator.version);

  // Build value maps by date
  const valuesByDate = new Map<string, Record<string, number | null>>();
  for (const iv of validValues) {
    const dateKey = iv.stockPrice.date.toISOString().split('T')[0];
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

    // Check access - user must own the strategy or have it in their collection
    const isOwner = strategy.createdBy === userId;
    if (!isOwner) {
      const inCollection = await prisma.userStrategy.findUnique({
        where: { userId_strategyId: { userId, strategyId } },
      });
      if (!inCollection) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'You do not have access to this strategy' },
          { status: 403 }
        );
      }
    }

    // Parse dates
    const startDate = parameters.startDate ? new Date(parameters.startDate) : undefined;
    const endDate = parameters.endDate ? new Date(parameters.endDate) : undefined;

    // Helper: find stock by ID, filename, or symbol
    const findStock = async (stockId: string) => {
      let stock = await prisma.stock.findUnique({
        where: { id: stockId },
      });

      // If not found by ID, try to parse as filename (symbol_dataSource)
      if (!stock) {
        const parts = stockId.split('_');
        if (parts.length >= 2) {
          const symbol = parts[0];
          const dataSource = parts.slice(1).join('_');
          stock = await prisma.stock.findFirst({
            where: { symbol, dataSource },
          });
        }
      }

      // Try by symbol only
      if (!stock) {
        stock = await prisma.stock.findFirst({
          where: { symbol: stockId },
        });
      }

      return stock;
    };

    // Helper: run a single-stock backtest and return the result
    const runSingleStockBacktest = async (stockId: string) => {
      const data = await buildDataRecords(stockId, startDate, endDate);
      if (data.length === 0) {
        throw new Error('No data available');
      }

      const input: BacktestInput = {
        strategyCode: strategy.pythonCode,
        data,
        strategyType: 'single',
        initialCash: parameters.initialCash || 100000,
        commission: parameters.commission || 0.001,
        parameters: parameters.strategyParameters || strategy.parameters as Record<string, any> || {},
        externalDatasets: strategy.externalDatasets as Record<string, { groupId: string; datasetName: string }> | undefined,
      };

      return { result: await executeBacktest(input), dataPoints: data.length };
    };

    // Build backtest input based on target type
    let stockIds: string[] = [];
    let symbols: string[] = [];

    if (target.type === 'single') {
      if (!target.stockId) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'stockId is required for single backtest' },
          { status: 400 }
        );
      }

      const stock = await findStock(target.stockId);

      if (!stock) {
        return NextResponse.json(
          { error: 'Stock not found' },
          { status: 404 }
        );
      }

      stockIds = [stock.id];
      symbols = [stock.symbol];

      let rawResult: BacktestResult;
      try {
        const { result } = await runSingleStockBacktest(stock.id);
        rawResult = result;
      } catch (err) {
        return NextResponse.json(
          { error: 'No data available for backtest' },
          { status: 400 }
        );
      }

      // Build dateRange from equity curve or parameters
      const firstDate = rawResult.equityCurve?.[0]?.date;
      const lastDate = rawResult.equityCurve?.[rawResult.equityCurve.length - 1]?.date;
      const dateRange = {
        startDate: firstDate || parameters.startDate,
        endDate: lastDate || parameters.endDate,
        dataPoints: rawResult.equityCurve?.length || 0,
      };

      const result = {
        ...rawResult,
        type: 'single' as const,
        dateRange,
        symbols,
      };

      // Save to history
      let historyEntry: BacktestHistoryEntry | null = null;
      if (saveToHistory && result.success && result.metrics) {
        const duration = firstDate && lastDate
          ? Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        historyEntry = await createBacktestHistoryEntry({
          strategyId: strategy.id,
          strategyName: strategy.name,
          strategyType: strategy.strategyType as 'single' | 'portfolio',
          target: { type: 'single', stockId: target.stockId, symbols },
          parameters: {
            initialCash: parameters.initialCash || 100000,
            commission: parameters.commission || 0.001,
            startDate: parameters.startDate,
            endDate: parameters.endDate,
            strategyParameters: parameters.strategyParameters,
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

    } else if (target.type === 'group') {
      // Group backtest: run single-stock strategy independently on each stock
      if (!target.groupId) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'groupId is required for group backtest' },
          { status: 400 }
        );
      }

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

      if (stockIds.length === 0) {
        return NextResponse.json(
          { error: 'Invalid request', message: 'Group has no stocks' },
          { status: 400 }
        );
      }

      // Get stock info
      const stocks = await prisma.stock.findMany({
        where: { id: { in: stockIds } },
      });
      symbols = stocks.map(s => s.symbol);

      // Run single-stock backtest independently for each stock
      const stockResults: Array<{
        stockId: string;
        metrics: any;
        equityCurve?: any[];
        tradeMarkers?: any[];
        dataPoints: number;
      }> = [];
      const errors: Array<{ stockId: string; error: string }> = [];

      for (const stock of stocks) {
        try {
          const { result: stockResult, dataPoints } = await runSingleStockBacktest(stock.id);

          if (stockResult.success && stockResult.metrics) {
            stockResults.push({
              stockId: stock.symbol,
              metrics: stockResult.metrics,
              equityCurve: stockResult.equityCurve,
              tradeMarkers: stockResult.tradeMarkers,
              dataPoints,
            });
          } else {
            errors.push({
              stockId: stock.symbol,
              error: stockResult.error || 'Backtest failed',
            });
          }
        } catch (err) {
          errors.push({
            stockId: stock.symbol,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      if (stockResults.length === 0) {
        return NextResponse.json(
          { error: 'All stock backtests failed', message: errors.map(e => `${e.stockId}: ${e.error}`).join('; ') },
          { status: 400 }
        );
      }

      // Aggregate metrics across all successful stock results
      const successCount = stockResults.length;
      const aggregatedMetrics = {
        totalReturn: stockResults.reduce((sum, r) => sum + r.metrics.totalReturn, 0),
        totalReturnPct: stockResults.reduce((sum, r) => sum + r.metrics.totalReturnPct, 0) / successCount,
        avgFinalValue: stockResults.reduce((sum, r) => sum + r.metrics.finalValue, 0) / successCount,
        avgMaxDrawdownPct: stockResults.reduce((sum, r) => sum + r.metrics.maxDrawdownPct, 0) / successCount,
        avgSharpeRatio: stockResults.reduce((sum, r) => sum + r.metrics.sharpeRatio, 0) / successCount,
        avgSortinoRatio: stockResults.reduce((sum, r) => sum + r.metrics.sortinoRatio, 0) / successCount,
        avgWinRate: stockResults.reduce((sum, r) => sum + r.metrics.winRate, 0) / successCount,
        totalTrades: stockResults.reduce((sum, r) => sum + r.metrics.tradeCount, 0),
        stockCount: successCount,
      };

      // Build dateRange from all equity curves
      let earliestDate: string | undefined;
      let latestDate: string | undefined;
      let totalDataPoints = 0;
      for (const sr of stockResults) {
        if (sr.equityCurve && sr.equityCurve.length > 0) {
          const first = sr.equityCurve[0].date;
          const last = sr.equityCurve[sr.equityCurve.length - 1].date;
          if (!earliestDate || first < earliestDate) earliestDate = first;
          if (!latestDate || last > latestDate) latestDate = last;
          totalDataPoints = Math.max(totalDataPoints, sr.equityCurve.length);
        }
      }

      const dateRange = {
        startDate: earliestDate || parameters.startDate,
        endDate: latestDate || parameters.endDate,
        dataPoints: totalDataPoints,
      };

      const result = {
        success: true,
        type: 'group' as const,
        groupName: group.name,
        aggregatedMetrics,
        stockResults,
        errors: errors.length > 0 ? errors : undefined,
        dateRange,
        symbols,
        // Include a combined metrics for history saving
        metrics: {
          totalReturn: aggregatedMetrics.totalReturn,
          totalReturnPct: aggregatedMetrics.totalReturnPct,
          finalValue: aggregatedMetrics.avgFinalValue,
          initialValue: parameters.initialCash || 100000,
          maxDrawdown: 0,
          maxDrawdownPct: aggregatedMetrics.avgMaxDrawdownPct,
          sharpeRatio: aggregatedMetrics.avgSharpeRatio,
          sortinoRatio: aggregatedMetrics.avgSortinoRatio,
          calmarRatio: 0,
          winRate: aggregatedMetrics.avgWinRate,
          avgWin: 0,
          avgLoss: 0,
          profitFactor: 0,
          tradeCount: aggregatedMetrics.totalTrades,
        },
      };

      // Save to history
      let historyEntry: BacktestHistoryEntry | null = null;
      if (saveToHistory) {
        const duration = earliestDate && latestDate
          ? Math.ceil((new Date(latestDate).getTime() - new Date(earliestDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        historyEntry = await createBacktestHistoryEntry({
          strategyId: strategy.id,
          strategyName: strategy.name,
          strategyType: strategy.strategyType as 'single' | 'portfolio',
          target: {
            type: 'group',
            symbols,
            groupId: target.groupId,
            groupName: group.name,
          },
          parameters: {
            initialCash: parameters.initialCash || 100000,
            commission: parameters.commission || 0.001,
            startDate: parameters.startDate,
            endDate: parameters.endDate,
            strategyParameters: parameters.strategyParameters,
          },
          result: result as any,
          starred: false,
          summary: {
            totalReturn: aggregatedMetrics.totalReturn,
            totalReturnPct: aggregatedMetrics.totalReturnPct,
            sharpeRatio: aggregatedMetrics.avgSharpeRatio,
            tradeCount: aggregatedMetrics.totalTrades,
            duration,
          },
        }, storage);
      }

      return NextResponse.json({
        success: true,
        result,
        historyEntry: historyEntry ? { id: historyEntry.id } : null,
      });

    } else if (target.type === 'portfolio') {
      // Portfolio backtest: shared capital across multiple stocks
      if (target.stockIds) {
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

      const backtestInput: BacktestInput = {
        strategyCode: strategy.pythonCode,
        dataMap,
        strategyType: 'portfolio',
        initialCash: parameters.initialCash || 100000,
        commission: parameters.commission || 0.001,
        parameters: parameters.strategyParameters || strategy.parameters as Record<string, any> || {},
        constraints: parameters.constraints || strategy.constraints as any || {},
        externalDatasets: strategy.externalDatasets as Record<string, { groupId: string; datasetName: string }> | undefined,
      };

      // Execute backtest
      const rawResult: BacktestResult = await executeBacktest(backtestInput);

      // Build dateRange from equity curve or parameters
      const firstDate = rawResult.equityCurve?.[0]?.date;
      const lastDate = rawResult.equityCurve?.[rawResult.equityCurve.length - 1]?.date;
      const dateRange = {
        startDate: firstDate || parameters.startDate,
        endDate: lastDate || parameters.endDate,
        dataPoints: rawResult.equityCurve?.length || 0,
      };

      const result = {
        ...rawResult,
        type: 'portfolio' as const,
        dateRange,
        symbols,
      };

      // Save to history
      let historyEntry: BacktestHistoryEntry | null = null;
      if (saveToHistory && result.success && result.metrics) {
        const duration = firstDate && lastDate
          ? Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        historyEntry = await createBacktestHistoryEntry({
          strategyId: strategy.id,
          strategyName: strategy.name,
          strategyType: strategy.strategyType as 'single' | 'portfolio',
          target: { type: 'portfolio', symbols },
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

    } else {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Invalid target type' },
        { status: 400 }
      );
    }
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
