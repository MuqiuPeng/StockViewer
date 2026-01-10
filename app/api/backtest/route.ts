import { NextResponse } from 'next/server';
import { executeBacktest } from '@/lib/backtest-executor';
import { getStrategyById } from '@/lib/strategy-storage';
import { getCsvFileStats } from '@/lib/datasets';
import { getGroupById } from '@/lib/group-storage';
import { findDataset } from '@/lib/dataset-metadata';
import { readFile } from 'fs/promises';
import Papa from 'papaparse';
import { createBacktestHistoryEntry } from '@/lib/backtest-history-storage';

// Helper function to load and parse a dataset
async function loadDataset(datasetIdentifier: string) {
  // Try to find dataset using metadata (supports code, name, or filename)
  const metadata = await findDataset(datasetIdentifier);

  let filename: string;
  if (metadata) {
    // Found in metadata, use the filename
    filename = metadata.filename;
  } else {
    // Fallback to legacy behavior for backward compatibility
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

// POST /api/backtest - Run backtest (single stock or group)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { strategyId, target, initialCash, commission, parameters, startDate, endDate } = body;

    // Support legacy format (datasetName directly)
    const isLegacyFormat = body.datasetName && !body.target;
    const actualTarget = isLegacyFormat
      ? { type: 'single', datasetName: body.datasetName }
      : target;

    // Validate required fields
    if (!strategyId || !actualTarget) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'strategyId and target are required' },
        { status: 400 }
      );
    }

    if (actualTarget.type === 'single' && !actualTarget.datasetName) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'datasetName is required for single stock backtest' },
        { status: 400 }
      );
    }

    if (actualTarget.type === 'group' && !actualTarget.groupId) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'groupId is required for group backtest' },
        { status: 400 }
      );
    }

    if (actualTarget.type === 'portfolio' && (!actualTarget.symbols || actualTarget.symbols.length === 0)) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'symbols array is required for portfolio backtest' },
        { status: 400 }
      );
    }

    // Validate date range if provided
    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json(
        { error: 'Invalid date range', message: 'Start date must be before end date' },
        { status: 400 }
      );
    }

    // Load strategy
    const strategy = await getStrategyById(strategyId);
    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    // Handle single stock vs portfolio vs group backtest
    if (actualTarget.type === 'single') {
      // Single stock backtest
      if (strategy.strategyType === 'portfolio') {
        return NextResponse.json(
          { error: 'Strategy type mismatch', message: 'Portfolio strategies cannot run on single stock targets. Please select multiple stocks.' },
          { status: 400 }
        );
      }

      const dataset = await loadDataset(actualTarget.datasetName);
      const filteredDataset = filterDatasetByDateRange(dataset, startDate, endDate);

      // Get dataset metadata for display name
      const datasetMetadata = await findDataset(actualTarget.datasetName);
      const displayName = datasetMetadata?.name || actualTarget.datasetName;

      const startTime = Date.now();
      const result = await executeBacktest({
        strategyCode: strategy.pythonCode,
        data: filteredDataset,
        strategyType: 'single',
        initialCash: initialCash || 100000,
        commission: commission || 0.001,
        parameters: parameters || strategy.parameters || {},
        externalDatasets: strategy.externalDatasets,
      });
      const executionTime = Date.now() - startTime;

      if (!result.success) {
        const errorMessage = result.error || result.type || 'Unknown error';
        console.error('Backtest failed:', errorMessage);
        return NextResponse.json(
          {
            error: 'Backtest failed',
            message: errorMessage,
            errorType: result.type,
            details: result.details,
          },
          { status: 400 }
        );
      }

      const resultWithMetadata = {
        ...result,
        type: 'single',
        datasetName: actualTarget.datasetName,
        dateRange: {
          startDate: startDate || (filteredDataset[0]?.date || filteredDataset[0]?.['日期'] || null),
          endDate: endDate || (filteredDataset[filteredDataset.length - 1]?.date || filteredDataset[filteredDataset.length - 1]?.['日期'] || null),
          dataPoints: filteredDataset.length,
        },
      };

      // Auto-save to history
      try {
        await createBacktestHistoryEntry({
          strategyId,
          strategyName: strategy.name,
          strategyType: strategy.strategyType || 'single',
          target: {
            type: 'single',
            datasetName: displayName,
          },
          parameters: {
            initialCash: initialCash || 100000,
            commission: commission || 0.001,
            startDate,
            endDate,
            strategyParameters: parameters || strategy.parameters || {},
          },
          result: resultWithMetadata,
          starred: false,
          summary: {
            totalReturn: result.metrics?.totalReturn || 0,
            totalReturnPct: result.metrics?.totalReturnPct || 0,
            sharpeRatio: result.metrics?.sharpeRatio || 0,
            tradeCount: result.metrics?.tradeCount || 0,
            duration: executionTime,
          },
        });
      } catch (error) {
        console.error('Failed to save backtest to history:', error);
        // Don't fail the request if history save fails
      }

      return NextResponse.json({ result: resultWithMetadata });
    } else if (actualTarget.type === 'portfolio') {
      // Portfolio backtest - multiple stocks with shared capital
      if (strategy.strategyType !== 'portfolio') {
        return NextResponse.json(
          { error: 'Strategy type mismatch', message: 'Single-stock strategies cannot run on portfolio targets. Please create a portfolio strategy.' },
          { status: 400 }
        );
      }

      // Load multiple datasets
      const dataMap: Record<string, Record<string, any>[]> = {};
      const loadErrors: string[] = [];
      const symbolMapping: Record<string, string> = {}; // filename -> stock code

      // Helper function to extract stock code from filename
      const extractStockCode = (filename: string): string => {
        // Remove .csv extension
        const withoutExt = filename.replace(/\.csv$/i, '');
        // Extract stock code (before first underscore, or the whole name if no underscore)
        const parts = withoutExt.split('_');
        return parts[0];
      };

      for (const filename of actualTarget.symbols) {
        try {
          const dataset = await loadDataset(filename);
          const filteredDataset = filterDatasetByDateRange(dataset, startDate, endDate);

          // Use stock code as key instead of full filename
          const stockCode = extractStockCode(filename);
          dataMap[stockCode] = filteredDataset;
          symbolMapping[filename] = stockCode;
        } catch (error) {
          loadErrors.push(`${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (Object.keys(dataMap).length === 0) {
        return NextResponse.json(
          {
            error: 'Failed to load datasets',
            message: `Could not load any of the selected stocks. Errors: ${loadErrors.join(', ')}`
          },
          { status: 400 }
        );
      }

      // Execute portfolio backtest with shared capital
      const startTime = Date.now();
      const result = await executeBacktest({
        strategyCode: strategy.pythonCode,
        dataMap,
        strategyType: 'portfolio',
        initialCash: initialCash || 100000,
        commission: commission || 0.001,
        parameters: parameters || strategy.parameters || {},
        constraints: strategy.constraints,
        externalDatasets: strategy.externalDatasets,
      });
      const executionTime = Date.now() - startTime;

      if (!result.success) {
        const errorMessage = result.error || result.type || 'Unknown error';
        console.error('Portfolio backtest failed:', errorMessage);
        return NextResponse.json(
          {
            error: 'Portfolio backtest failed',
            message: errorMessage,
            errorType: result.type,
            details: result.details,
          },
          { status: 400 }
        );
      }

      const resultWithMetadata = {
        ...result,
        type: 'portfolio',
        symbols: Object.keys(dataMap), // Use stock codes, not filenames
        successfulSymbols: Object.keys(dataMap),
        loadErrors: loadErrors.length > 0 ? loadErrors : undefined,
        dateRange: {
          startDate,
          endDate,
        },
      };

      // Auto-save to history
      try {
        await createBacktestHistoryEntry({
          strategyId,
          strategyName: strategy.name,
          strategyType: strategy.strategyType || 'portfolio',
          target: {
            type: 'portfolio',
            symbols: actualTarget.symbols,
          },
          parameters: {
            initialCash: initialCash || 100000,
            commission: commission || 0.001,
            startDate,
            endDate,
            strategyParameters: parameters || strategy.parameters || {},
            constraints: strategy.constraints,
          },
          result: resultWithMetadata,
          starred: false,
          summary: {
            totalReturn: result.metrics?.totalReturn || 0,
            totalReturnPct: result.metrics?.totalReturnPct || 0,
            sharpeRatio: result.metrics?.sharpeRatio || 0,
            tradeCount: result.metrics?.tradeCount || 0,
            duration: executionTime,
          },
        });
      } catch (error) {
        console.error('Failed to save backtest to history:', error);
        // Don't fail the request if history save fails
      }

      return NextResponse.json({ result: resultWithMetadata });
    } else {
      // Group backtest
      const group = await getGroupById(actualTarget.groupId);
      if (!group) {
        return NextResponse.json(
          { error: 'Group not found' },
          { status: 404 }
        );
      }

      if (group.datasetNames.length === 0) {
        return NextResponse.json(
          { error: 'Empty group', message: 'Group has no datasets' },
          { status: 400 }
        );
      }

      // Run backtest on each dataset in the group
      const stockResults = [];
      const errors = [];

      for (const datasetName of group.datasetNames) {
        try {
          const dataset = await loadDataset(datasetName);
          const filteredDataset = filterDatasetByDateRange(dataset, startDate, endDate);

          const stockStartTime = Date.now();
          const result = await executeBacktest({
            strategyCode: strategy.pythonCode,
            data: filteredDataset,
            strategyType: 'single',
            initialCash: initialCash || 100000,
            commission: commission || 0.001,
            parameters: parameters || strategy.parameters || {},
            externalDatasets: strategy.externalDatasets,
          });
          const stockExecutionTime = Date.now() - stockStartTime;

          if (result.success && result.metrics) {
            stockResults.push({
              datasetName,
              metrics: result.metrics,
              equityCurve: result.equityCurve,
              tradeMarkers: result.tradeMarkers,
              dataPoints: filteredDataset.length,
              executionTime: stockExecutionTime,
            });
          } else {
            errors.push({
              datasetName,
              error: result.error || 'Unknown error',
              errorType: result.type,
              details: result.details,
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

      const groupResult = {
        success: true,
        type: 'group',
        groupId: actualTarget.groupId,
        groupName: group.name,
        aggregatedMetrics,
        stockResults,
        errors: errors.length > 0 ? errors : undefined,
        dateRange: {
          startDate,
          endDate,
        },
      };

      // Auto-save to history
      try {
        // Calculate total execution time (sum of all individual backtests)
        const totalDuration = stockResults.reduce((sum, r) => sum + (r.executionTime || 0), 0);

        await createBacktestHistoryEntry({
          strategyId,
          strategyName: strategy.name,
          strategyType: strategy.strategyType || 'single',
          target: {
            type: 'group',
            groupId: actualTarget.groupId,
            groupName: group.name,
          },
          parameters: {
            initialCash: initialCash || 100000,
            commission: commission || 0.001,
            startDate,
            endDate,
            strategyParameters: parameters || strategy.parameters || {},
          },
          result: groupResult,
          starred: false,
          summary: {
            totalReturn: aggregatedMetrics.totalReturn,
            totalReturnPct: aggregatedMetrics.totalReturnPct,
            sharpeRatio: aggregatedMetrics.avgSharpeRatio,
            tradeCount: aggregatedMetrics.totalTrades,
            duration: totalDuration,
          },
        });
      } catch (error) {
        console.error('Failed to save backtest to history:', error);
        // Don't fail the request if history save fails
      }

      return NextResponse.json({ result: groupResult });
    }
  } catch (error) {
    console.error('Backtest API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to run backtest',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

