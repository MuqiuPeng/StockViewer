import { NextResponse } from 'next/server';
import { getBacktestHistoryById } from '@/lib/backtest-history-storage';
import { getStrategyById } from '@/lib/strategy-storage';
import { executeBacktest } from '@/lib/backtest-executor';
import { getGroupById } from '@/lib/group-storage';
import { findDataset } from '@/lib/dataset-metadata';
import { readFile } from 'fs/promises';
import { getCsvFileStats } from '@/lib/datasets';
import Papa from 'papaparse';

// Helper function to load a dataset
async function loadDataset(datasetIdentifier: string) {
  const metadata = await findDataset(datasetIdentifier);

  let filename: string;
  if (metadata) {
    filename = metadata.filename;
  } else {
    filename = datasetIdentifier;
    if (!filename.toLowerCase().endsWith('.csv')) {
      filename = `${filename}.csv`;
    }
  }

  const fileStats = await getCsvFileStats(filename);
  if (!fileStats.exists) {
    throw new Error(`Dataset "${datasetIdentifier}" not found`);
  }

  const fileContent = await readFile(fileStats.path, 'utf-8');
  const dataset = await new Promise<Record<string, any>[]>((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        resolve(results.data as Record<string, any>[]);
      },
      error: (error: Error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });

  if (!dataset || dataset.length === 0) {
    throw new Error(`Dataset "${datasetIdentifier}" is empty`);
  }

  return dataset;
}

// POST /api/backtest-history/[id]/rerun - Re-run a backtest with original parameters
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Get the original backtest entry
    const entry = await getBacktestHistoryById(params.id);
    if (!entry) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    // Get the strategy
    const strategy = await getStrategyById(entry.strategyId);
    if (!strategy) {
      return NextResponse.json(
        {
          error: 'Strategy not found',
          message: `The strategy used in this backtest (ID: ${entry.strategyId}) no longer exists.`,
        },
        { status: 404 }
      );
    }

    // Re-execute the backtest based on target type
    const { target, parameters } = entry;
    const startTime = Date.now();

    if (target.type === 'single' && target.datasetName) {
      // Single stock backtest
      const dataset = await loadDataset(target.datasetName);

      const result = await executeBacktest({
        strategyCode: strategy.pythonCode,
        data: dataset,
        strategyType: 'single',
        initialCash: parameters.initialCash,
        commission: parameters.commission,
        parameters: parameters.strategyParameters || {},
      });

      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return NextResponse.json(
          {
            error: 'Backtest failed',
            message: result.error || 'Unknown error',
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        result: {
          ...result,
          type: 'single',
          datasetName: target.datasetName,
          executionTime,
        },
      });
    } else if (target.type === 'portfolio' && target.symbols) {
      // Portfolio backtest
      const dataMap: Record<string, Record<string, any>[]> = {};
      const loadErrors: string[] = [];

      for (const symbol of target.symbols) {
        try {
          const dataset = await loadDataset(symbol);
          dataMap[symbol] = dataset;
        } catch (error) {
          loadErrors.push(`${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (Object.keys(dataMap).length === 0) {
        return NextResponse.json(
          {
            error: 'Failed to load datasets',
            message: `Could not load any of the selected stocks. Errors: ${loadErrors.join(', ')}`,
          },
          { status: 400 }
        );
      }

      const result = await executeBacktest({
        strategyCode: strategy.pythonCode,
        dataMap,
        strategyType: 'portfolio',
        initialCash: parameters.initialCash,
        commission: parameters.commission,
        parameters: parameters.strategyParameters || {},
        constraints: parameters.constraints,
      });

      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return NextResponse.json(
          {
            error: 'Portfolio backtest failed',
            message: result.error || 'Unknown error',
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        result: {
          ...result,
          type: 'portfolio',
          symbols: Object.keys(dataMap),
          executionTime,
        },
      });
    } else if (target.type === 'group' && target.groupId) {
      // Group backtest
      const group = await getGroupById(target.groupId);
      if (!group) {
        return NextResponse.json(
          {
            error: 'Group not found',
            message: `The group used in this backtest (ID: ${target.groupId}) no longer exists.`,
          },
          { status: 404 }
        );
      }

      // Run backtest on each dataset in the group
      const stockResults = [];
      const errors = [];

      for (const datasetName of group.datasetNames) {
        try {
          const dataset = await loadDataset(datasetName);

          const result = await executeBacktest({
            strategyCode: strategy.pythonCode,
            data: dataset,
            strategyType: 'single',
            initialCash: parameters.initialCash,
            commission: parameters.commission,
            parameters: parameters.strategyParameters || {},
          });

          if (result.success && result.metrics) {
            stockResults.push({
              datasetName,
              metrics: result.metrics,
              equityCurve: result.equityCurve,
              tradeMarkers: result.tradeMarkers,
              dataPoints: dataset.length,
            });
          } else {
            errors.push({
              datasetName,
              error: result.error || 'Unknown error',
            });
          }
        } catch (error) {
          errors.push({
            datasetName,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (stockResults.length === 0) {
        return NextResponse.json(
          {
            error: 'All backtests failed',
            message: 'No successful backtests in group',
            errors,
          },
          { status: 400 }
        );
      }

      // Calculate aggregated metrics
      const aggregatedMetrics = {
        totalReturn: stockResults.reduce((sum, r) => sum + r.metrics.totalReturn, 0),
        totalReturnPct: stockResults.reduce((sum, r) => sum + r.metrics.totalReturnPct, 0) / stockResults.length,
        avgFinalValue: stockResults.reduce((sum, r) => sum + r.metrics.finalValue, 0) / stockResults.length,
        avgMaxDrawdownPct: stockResults.reduce((sum, r) => sum + r.metrics.maxDrawdownPct, 0) / stockResults.length,
        avgSharpeRatio: stockResults.reduce((sum, r) => sum + r.metrics.sharpeRatio, 0) / stockResults.length,
        avgSortinoRatio: stockResults.reduce((sum, r) => sum + r.metrics.sortinoRatio, 0) / stockResults.length,
        avgWinRate: stockResults.reduce((sum, r) => sum + r.metrics.winRate, 0) / stockResults.length,
        totalTrades: stockResults.reduce((sum, r) => sum + r.metrics.tradeCount, 0),
        stockCount: stockResults.length,
      };

      const executionTime = Date.now() - startTime;

      const groupResult = {
        type: 'group',
        groupId: target.groupId,
        groupName: group.name,
        aggregatedMetrics,
        stockResults,
        errors: errors.length > 0 ? errors : undefined,
        executionTime,
      };

      return NextResponse.json({ result: groupResult });
    } else {
      return NextResponse.json(
        {
          error: 'Invalid target type',
          message: 'Cannot re-run backtest with invalid target configuration',
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Failed to re-run backtest:', error);
    return NextResponse.json(
      {
        error: 'Failed to re-run backtest',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
