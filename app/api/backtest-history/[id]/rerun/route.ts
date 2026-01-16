import { NextResponse } from 'next/server';
import { getApiStorage } from '@/lib/api-auth';
import type { BacktestHistoryEntry } from '@/lib/backtest-history-storage';
import type { Strategy } from '@/lib/strategy-storage';
import type { StockGroup } from '@/lib/group-storage';
import type { DatasetMetadata } from '@/lib/dataset-metadata';
import { executeBacktest } from '@/lib/backtest-executor';
import Papa from 'papaparse';
import type { StorageProvider, FileStorageProvider } from '@/lib/storage';

// Helper function to load a dataset
async function loadDataset(
  datasetIdentifier: string,
  storage: StorageProvider
) {
  const datasetStore = storage.getJsonStore<DatasetMetadata>('datasetMetadata');
  const fileStore = storage.getFileStore();

  // Find dataset metadata
  const datasets = await datasetStore.getAll();
  let metadata = datasets.find(ds => ds.id === datasetIdentifier);
  if (!metadata) {
    metadata = datasets.find(
      ds => ds.filename === datasetIdentifier || ds.filename.replace(/\.csv$/i, '') === datasetIdentifier
    );
  }
  if (!metadata) {
    metadata = datasets.find(ds => ds.name === datasetIdentifier);
  }
  if (!metadata) {
    const codeMatches = datasets.filter(ds => ds.code === datasetIdentifier);
    if (codeMatches.length === 1) {
      metadata = codeMatches[0];
    }
  }

  let filename: string;
  if (metadata) {
    filename = metadata.filename;
  } else {
    filename = datasetIdentifier;
    if (!filename.toLowerCase().endsWith('.csv')) {
      filename = `${filename}.csv`;
    }
  }

  // Check if file exists
  const exists = await fileStore.exists(filename);
  if (!exists) {
    throw new Error(`Dataset "${datasetIdentifier}" not found`);
  }

  const fileContent = await fileStore.readText(filename);
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

// Helper function to filter dataset by date range
function filterDatasetByDateRange(
  dataset: Record<string, any>[],
  startDate?: string,
  endDate?: string
): Record<string, any>[] {
  if (!startDate && !endDate) {
    return dataset;
  }

  const filtered = dataset.filter((row) => {
    const rowDate = row.date || row['日期'];
    if (!rowDate) return true;

    const normalizedDate = rowDate.split(' ')[0];

    if (startDate && normalizedDate < startDate) return false;
    if (endDate && normalizedDate > endDate) return false;
    return true;
  });

  if (filtered.length === 0) {
    throw new Error(`No data found between ${startDate || 'start'} and ${endDate || 'end'}`);
  }

  return filtered;
}

// POST /api/backtest-history/[id]/rerun - Re-run a backtest with original parameters
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await getApiStorage();
    if (!authResult.success) {
      return authResult.response;
    }
    const storage = authResult.storage;

    const historyStore = storage.getJsonStore<BacktestHistoryEntry>('backtestHistory');
    const strategyStore = storage.getJsonStore<Strategy>('strategies');
    const groupStore = storage.getJsonStore<StockGroup>('groups');

    // Get the original backtest entry
    const entry = await historyStore.getById(params.id);
    if (!entry) {
      return NextResponse.json(
        { error: 'Backtest history entry not found' },
        { status: 404 }
      );
    }

    // Get the strategy
    const strategy = await strategyStore.getById(entry.strategyId);
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
      const dataset = await loadDataset(target.datasetName, storage);
      const filteredDataset = filterDatasetByDateRange(dataset, parameters.startDate, parameters.endDate);

      const result = await executeBacktest({
        strategyCode: strategy.pythonCode,
        data: filteredDataset,
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
          const dataset = await loadDataset(symbol, storage);
          const filteredDataset = filterDatasetByDateRange(dataset, parameters.startDate, parameters.endDate);
          dataMap[symbol] = filteredDataset;
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
      const group = await groupStore.getById(target.groupId);
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
          const dataset = await loadDataset(datasetName, storage);
          const filteredDataset = filterDatasetByDateRange(dataset, parameters.startDate, parameters.endDate);

          const result = await executeBacktest({
            strategyCode: strategy.pythonCode,
            data: filteredDataset,
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
              dataPoints: filteredDataset.length,
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
