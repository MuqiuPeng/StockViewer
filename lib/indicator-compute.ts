/**
 * Indicator computation service
 *
 * Handles computing indicators on stock data from the database.
 * Results are stored in:
 * - IndicatorValue: for public indicators (shared cache)
 * - IndicatorValueCache: for private indicators (user-specific cache)
 */

import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import { executePythonIndicator, PythonExecutionResult } from './python-executor';
import { getStockById, getStockPrices, StockPriceData } from './stock-storage';

/**
 * Indicator metadata for computation
 */
export interface IndicatorMeta {
  id: string;
  name: string;
  pythonCode: string;
  outputColumn: string;
  dependencies: string[];
  dependencyColumns: string[];
  isGroup: boolean;
  groupName?: string;
  expectedOutputs?: string[];
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;
  visibility: 'PRIVATE' | 'PUBLIC' | 'UNLISTED';
  ownerId: string;
}

/**
 * Computed indicator value
 */
export interface IndicatorValueData {
  date: Date;
  value?: number | null;
  groupValues?: Record<string, number | null>;
}

/**
 * Result of indicator computation
 */
export interface ComputeResult {
  success: boolean;
  stockId: string;
  indicatorId: string;
  rowsComputed?: number;
  cachedRows?: number;
  error?: string;
  errorType?: string;
  details?: {
    message?: string;
    type?: string;
    code_line?: string;
    hints?: string[];
    traceback?: string;
    warnings?: string[];
  };
}

/**
 * Load indicator by ID from the database
 */
export async function loadIndicator(indicatorId: string): Promise<IndicatorMeta | null> {
  const indicator = await prisma.indicator.findUnique({
    where: { id: indicatorId },
  });

  if (!indicator) return null;

  return {
    id: indicator.id,
    name: indicator.name,
    pythonCode: indicator.pythonCode,
    outputColumn: indicator.outputColumn,
    dependencies: indicator.dependencies,
    dependencyColumns: indicator.dependencyColumns,
    isGroup: indicator.isGroup,
    groupName: indicator.groupName || undefined,
    expectedOutputs: indicator.expectedOutputs.length > 0 ? indicator.expectedOutputs : undefined,
    externalDatasets: indicator.externalDatasets as Record<string, { groupId: string; datasetName: string }> | undefined,
    visibility: indicator.visibility,
    ownerId: indicator.ownerId,
  };
}

/**
 * Get cached indicator values for a stock
 */
export async function getCachedIndicatorValues(
  indicatorId: string,
  stockId: string,
  userId?: string,
  isPublic: boolean = false
): Promise<Map<string, IndicatorValueData>> {
  const valueMap = new Map<string, IndicatorValueData>();

  if (isPublic) {
    // Load from shared IndicatorValue table
    const values = await prisma.indicatorValue.findMany({
      where: { indicatorId, stockId },
      orderBy: { date: 'asc' },
    });

    for (const v of values) {
      const dateKey = v.date.toISOString().split('T')[0];
      valueMap.set(dateKey, {
        date: v.date,
        value: v.value ? Number(v.value) : null,
        groupValues: v.groupValues as Record<string, number | null> | undefined,
      });
    }
  } else if (userId) {
    // Load from user-specific IndicatorValueCache table
    const values = await prisma.indicatorValueCache.findMany({
      where: { userId, indicatorId, stockId },
      orderBy: { date: 'asc' },
    });

    for (const v of values) {
      const dateKey = v.date.toISOString().split('T')[0];
      valueMap.set(dateKey, {
        date: v.date,
        value: v.value ? Number(v.value) : null,
        groupValues: v.groupValues as Record<string, number | null> | undefined,
      });
    }
  }

  return valueMap;
}

/**
 * Build data records for Python execution
 * Combines price data with existing indicator values
 */
function buildDataRecords(
  prices: StockPriceData[],
  existingIndicators: Map<string, Map<string, IndicatorValueData>>
): Record<string, any>[] {
  return prices.map(price => {
    const dateKey = price.date.toISOString().split('T')[0];
    const record: Record<string, any> = {
      date: dateKey,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: Number(price.volume),
    };

    // Add optional price fields
    if (price.turnover !== null) record.turnover = price.turnover;
    if (price.amplitude !== null) record.amplitude = price.amplitude;
    if (price.changePct !== null) record.change_pct = price.changePct;
    if (price.changeAmount !== null) record.change_amount = price.changeAmount;
    if (price.turnoverRate !== null) record.turnover_rate = price.turnoverRate;

    // Add existing indicator values
    for (const [indicatorName, valueMap] of existingIndicators) {
      const value = valueMap.get(dateKey);
      if (value) {
        if (value.groupValues) {
          // Group indicator - add each output column
          for (const [key, val] of Object.entries(value.groupValues)) {
            record[`${indicatorName}:${key}`] = val;
          }
        } else {
          // Single indicator
          record[indicatorName] = value.value;
        }
      }
    }

    return record;
  });
}

/**
 * Save computed indicator values to the database
 */
async function saveIndicatorValues(
  indicatorId: string,
  stockId: string,
  userId: string | undefined,
  isPublic: boolean,
  prices: StockPriceData[],
  values: (number | null)[] | Record<string, (number | null)[]>,
  isGroup: boolean
): Promise<number> {
  const dateList = prices.map(p => p.date);
  let savedCount = 0;

  if (isPublic) {
    // Save to shared IndicatorValue table
    // First delete existing values for this indicator/stock combination
    await prisma.indicatorValue.deleteMany({
      where: { indicatorId, stockId },
    });

    if (isGroup) {
      // Group indicator - values is a dict
      const groupValues = values as Record<string, (number | null)[]>;
      const data = dateList.map((date, i) => {
        const gv: Record<string, number | null> = {};
        for (const [key, arr] of Object.entries(groupValues)) {
          gv[key] = arr[i];
        }
        return {
          indicatorId,
          stockId,
          date,
          groupValues: gv,
        };
      });

      const result = await prisma.indicatorValue.createMany({
        data,
        skipDuplicates: true,
      });
      savedCount = result.count;
    } else {
      // Single indicator - values is an array
      const singleValues = values as (number | null)[];
      const data = dateList.map((date, i) => ({
        indicatorId,
        stockId,
        date,
        value: singleValues[i] !== null ? new Prisma.Decimal(singleValues[i]!) : null,
      }));

      const result = await prisma.indicatorValue.createMany({
        data,
        skipDuplicates: true,
      });
      savedCount = result.count;
    }
  } else if (userId) {
    // Save to user-specific IndicatorValueCache table
    // First delete existing values
    await prisma.indicatorValueCache.deleteMany({
      where: { userId, indicatorId, stockId },
    });

    if (isGroup) {
      const groupValues = values as Record<string, (number | null)[]>;
      const data = dateList.map((date, i) => {
        const gv: Record<string, number | null> = {};
        for (const [key, arr] of Object.entries(groupValues)) {
          gv[key] = arr[i];
        }
        return {
          userId,
          indicatorId,
          stockId,
          date,
          groupValues: gv,
        };
      });

      const result = await prisma.indicatorValueCache.createMany({
        data,
        skipDuplicates: true,
      });
      savedCount = result.count;
    } else {
      const singleValues = values as (number | null)[];
      const data = dateList.map((date, i) => ({
        userId,
        indicatorId,
        stockId,
        date,
        value: singleValues[i] !== null ? new Prisma.Decimal(singleValues[i]!) : null,
      }));

      const result = await prisma.indicatorValueCache.createMany({
        data,
        skipDuplicates: true,
      });
      savedCount = result.count;
    }
  }

  return savedCount;
}

/**
 * Compute an indicator for a stock
 *
 * @param indicatorId - The indicator ID to compute
 * @param stockId - The stock ID to compute for
 * @param userId - The user ID (required for private indicators)
 * @param options - Computation options
 */
export async function computeIndicator(
  indicatorId: string,
  stockId: string,
  userId: string,
  options?: {
    forceRecompute?: boolean;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<ComputeResult> {
  const { forceRecompute = false, startDate, endDate } = options || {};

  try {
    // Load indicator metadata
    const indicator = await loadIndicator(indicatorId);
    if (!indicator) {
      return {
        success: false,
        stockId,
        indicatorId,
        error: 'Indicator not found',
      };
    }

    // Check access permissions
    const isOwner = indicator.ownerId === userId;
    const isPublic = indicator.visibility === 'PUBLIC';
    const isUnlisted = indicator.visibility === 'UNLISTED';

    if (!isOwner && !isPublic && !isUnlisted) {
      return {
        success: false,
        stockId,
        indicatorId,
        error: 'Access denied to private indicator',
      };
    }

    // Load stock metadata
    const stock = await getStockById(stockId);
    if (!stock) {
      return {
        success: false,
        stockId,
        indicatorId,
        error: 'Stock not found',
      };
    }

    // Load stock prices
    const prices = await getStockPrices(stockId, { startDate, endDate });
    if (prices.length === 0) {
      return {
        success: false,
        stockId,
        indicatorId,
        error: 'No price data available for stock',
      };
    }

    // Load dependent indicator values
    const existingIndicators = new Map<string, Map<string, IndicatorValueData>>();

    for (const depId of indicator.dependencies) {
      // Load dependent indicator to check if it's public or private
      const depIndicator = await loadIndicator(depId);
      if (depIndicator) {
        const depIsPublic = depIndicator.visibility === 'PUBLIC';
        const depValues = await getCachedIndicatorValues(
          depId,
          stockId,
          userId,
          depIsPublic
        );
        existingIndicators.set(depIndicator.outputColumn, depValues);
      }
    }

    // Build data records for Python
    const dataRecords = buildDataRecords(prices, existingIndicators);

    // Execute Python indicator
    const executionResult: PythonExecutionResult = await executePythonIndicator({
      code: indicator.pythonCode,
      data: dataRecords,
      isGroup: indicator.isGroup,
      externalDatasets: indicator.externalDatasets,
    });

    if (!executionResult.success) {
      return {
        success: false,
        stockId,
        indicatorId,
        error: executionResult.error || 'Python execution failed',
        errorType: executionResult.type,
        details: executionResult.details,
      };
    }

    // Validate group indicator output
    if (indicator.isGroup) {
      const valuesDict = executionResult.values as Record<string, (number | null)[]>;

      if (!valuesDict || typeof valuesDict !== 'object') {
        return {
          success: false,
          stockId,
          indicatorId,
          error: 'Group indicator must return a dictionary of values',
        };
      }

      const returnedKeys = Object.keys(valuesDict);
      const expectedKeys = indicator.expectedOutputs || [];
      const missingKeys = expectedKeys.filter(k => !returnedKeys.includes(k));

      if (missingKeys.length > 0) {
        return {
          success: false,
          stockId,
          indicatorId,
          error: `Missing expected outputs: ${missingKeys.join(', ')}`,
        };
      }

      // Filter to only include expected outputs
      const filteredValues: Record<string, (number | null)[]> = {};
      for (const key of expectedKeys) {
        if (key in valuesDict) {
          filteredValues[key] = valuesDict[key];
        }
      }

      // Save to database
      // For public indicators, save to shared cache
      // For private/unlisted, save to user-specific cache
      const savedCount = await saveIndicatorValues(
        indicatorId,
        stockId,
        userId,
        isPublic,
        prices,
        filteredValues,
        true
      );

      return {
        success: true,
        stockId,
        indicatorId,
        rowsComputed: prices.length,
        cachedRows: savedCount,
      };
    } else {
      // Single indicator
      const savedCount = await saveIndicatorValues(
        indicatorId,
        stockId,
        userId,
        isPublic,
        prices,
        executionResult.values as (number | null)[],
        false
      );

      return {
        success: true,
        stockId,
        indicatorId,
        rowsComputed: prices.length,
        cachedRows: savedCount,
      };
    }
  } catch (error) {
    console.error('Error computing indicator:', error);
    return {
      success: false,
      stockId,
      indicatorId,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Compute multiple indicators for a stock
 */
export async function computeIndicators(
  indicatorIds: string[],
  stockId: string,
  userId: string,
  options?: {
    forceRecompute?: boolean;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<ComputeResult[]> {
  const results: ComputeResult[] = [];

  for (const indicatorId of indicatorIds) {
    const result = await computeIndicator(indicatorId, stockId, userId, options);
    results.push(result);
  }

  return results;
}

/**
 * Get indicator values for display
 * Returns cached values or computes if not available
 */
export async function getIndicatorValues(
  indicatorId: string,
  stockId: string,
  userId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    autoCompute?: boolean;
  }
): Promise<{
  values: IndicatorValueData[];
  computed: boolean;
  error?: string;
}> {
  const { startDate, endDate, autoCompute = true } = options || {};

  // Load indicator to check visibility
  const indicator = await loadIndicator(indicatorId);
  if (!indicator) {
    return { values: [], computed: false, error: 'Indicator not found' };
  }

  const isPublic = indicator.visibility === 'PUBLIC';

  // Try to load cached values
  const cachedValues = await getCachedIndicatorValues(
    indicatorId,
    stockId,
    userId,
    isPublic
  );

  if (cachedValues.size > 0) {
    // Filter by date range if specified
    let values = Array.from(cachedValues.values());

    if (startDate) {
      values = values.filter(v => v.date >= startDate);
    }
    if (endDate) {
      values = values.filter(v => v.date <= endDate);
    }

    return { values, computed: false };
  }

  // No cached values - compute if autoCompute is enabled
  if (autoCompute) {
    const result = await computeIndicator(indicatorId, stockId, userId, {
      startDate,
      endDate,
    });

    if (!result.success) {
      return { values: [], computed: true, error: result.error };
    }

    // Load the newly computed values
    const newValues = await getCachedIndicatorValues(
      indicatorId,
      stockId,
      userId,
      isPublic
    );

    let values = Array.from(newValues.values());

    if (startDate) {
      values = values.filter(v => v.date >= startDate);
    }
    if (endDate) {
      values = values.filter(v => v.date <= endDate);
    }

    return { values, computed: true };
  }

  return { values: [], computed: false };
}

/**
 * Clear cached indicator values
 */
export async function clearIndicatorCache(
  indicatorId: string,
  stockId?: string,
  userId?: string
): Promise<{ publicDeleted: number; privateDeleted: number }> {
  let publicDeleted = 0;
  let privateDeleted = 0;

  // Clear public cache
  const publicWhere: any = { indicatorId };
  if (stockId) publicWhere.stockId = stockId;

  const publicResult = await prisma.indicatorValue.deleteMany({
    where: publicWhere,
  });
  publicDeleted = publicResult.count;

  // Clear private cache
  if (userId) {
    const privateWhere: any = { indicatorId, userId };
    if (stockId) privateWhere.stockId = stockId;

    const privateResult = await prisma.indicatorValueCache.deleteMany({
      where: privateWhere,
    });
    privateDeleted = privateResult.count;
  }

  return { publicDeleted, privateDeleted };
}
