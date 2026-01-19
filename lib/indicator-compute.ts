/**
 * Indicator computation service
 *
 * Handles computing indicators on stock data from the database.
 * Results are stored in IndicatorValue table, linked to StockPrice records.
 * Uses versioning for cache invalidation.
 */

import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import { executePythonIndicator, PythonExecutionResult } from './python-executor';

/**
 * Indicator metadata for computation
 */
export interface IndicatorMeta {
  id: string;
  name: string;
  pythonCode: string;
  outputColumn: string;
  version: number;
  codeHash: string;
  dependencies: string[];
  dependencyColumns: string[];
  isGroup: boolean;
  groupName?: string;
  expectedOutputs?: string[];
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;
  visibleTo: string[];
  createdBy: string;
}

/**
 * Computed indicator value
 */
export interface IndicatorValueData {
  stockPriceId: string;
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
  version?: number;
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
    version: indicator.version,
    codeHash: indicator.codeHash,
    dependencies: indicator.dependencies,
    dependencyColumns: indicator.dependencyColumns,
    isGroup: indicator.isGroup,
    groupName: indicator.groupName || undefined,
    expectedOutputs: indicator.expectedOutputs.length > 0 ? indicator.expectedOutputs : undefined,
    externalDatasets: indicator.externalDatasets as Record<string, { groupId: string; datasetName: string }> | undefined,
    visibleTo: indicator.visibleTo,
    createdBy: indicator.createdBy,
  };
}

/**
 * Get cached indicator values for a stock (using stockPriceId for alignment)
 * Returns values only for the current indicator version
 */
export async function getCachedIndicatorValues(
  indicatorId: string,
  stockId: string,
  version: number
): Promise<Map<string, IndicatorValueData>> {
  const valueMap = new Map<string, IndicatorValueData>();

  // Load indicator values with current version, joined with StockPrice for date info
  const values = await prisma.indicatorValue.findMany({
    where: {
      indicatorId,
      version,
      stockPrice: {
        stockId,
      },
    },
    include: {
      stockPrice: {
        select: { id: true, date: true },
      },
    },
    orderBy: { stockPrice: { date: 'asc' } },
  });

  for (const v of values) {
    const dateKey = v.stockPrice.date.toISOString().split('T')[0];
    valueMap.set(dateKey, {
      stockPriceId: v.stockPriceId,
      date: v.stockPrice.date,
      value: v.value ? Number(v.value) : null,
      groupValues: v.groupValues as Record<string, number | null> | undefined,
    });
  }

  return valueMap;
}

/**
 * Check if indicator is computed for a stock (with current version)
 */
export async function isIndicatorComputed(
  indicatorId: string,
  stockId: string,
  version: number
): Promise<boolean> {
  const record = await prisma.stockIndicator.findUnique({
    where: {
      stockId_indicatorId: { stockId, indicatorId },
    },
  });

  return record !== null && record.version === version;
}

/**
 * Build data records for Python execution
 * Combines price data with existing indicator values
 */
function buildDataRecords(
  prices: Array<{
    id: string;
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
  }>,
  existingIndicators: Map<string, Map<string, IndicatorValueData>>
): Array<{ stockPriceId: string; data: Record<string, any> }> {
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
    if (price.turnover !== null && price.turnover !== undefined) record.turnover = price.turnover;
    if (price.amplitude !== null && price.amplitude !== undefined) record.amplitude = price.amplitude;
    if (price.changePct !== null && price.changePct !== undefined) record.change_pct = price.changePct;
    if (price.changeAmount !== null && price.changeAmount !== undefined) record.change_amount = price.changeAmount;
    if (price.turnoverRate !== null && price.turnoverRate !== undefined) record.turnover_rate = price.turnoverRate;

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

    return { stockPriceId: price.id, data: record };
  });
}

/**
 * Save computed indicator values to the database using stockPriceId
 */
async function saveIndicatorValues(
  indicatorId: string,
  stockId: string,
  version: number,
  priceRecords: Array<{ stockPriceId: string; data: Record<string, any> }>,
  values: (number | null)[] | Record<string, (number | null)[]>,
  isGroup: boolean
): Promise<number> {
  // Delete existing values for this indicator/version combination on this stock
  await prisma.indicatorValue.deleteMany({
    where: {
      indicatorId,
      version,
      stockPrice: { stockId },
    },
  });

  let savedCount = 0;

  if (isGroup) {
    // Group indicator - values is a dict
    const groupValues = values as Record<string, (number | null)[]>;
    const data = priceRecords.map((pr, i) => {
      const gv: Record<string, number | null> = {};
      for (const [key, arr] of Object.entries(groupValues)) {
        gv[key] = arr[i];
      }
      return {
        indicatorId,
        stockPriceId: pr.stockPriceId,
        version,
        groupValues: gv,
      };
    }).filter((_, i) => {
      // Only save rows where at least one value is not null
      const groupVals = values as Record<string, (number | null)[]>;
      return Object.values(groupVals).some(arr => arr[i] !== null);
    });

    if (data.length > 0) {
      const result = await prisma.indicatorValue.createMany({
        data,
        skipDuplicates: true,
      });
      savedCount = result.count;
    }
  } else {
    // Single indicator - values is an array
    const singleValues = values as (number | null)[];
    const data = priceRecords
      .map((pr, i) => ({
        indicatorId,
        stockPriceId: pr.stockPriceId,
        version,
        value: singleValues[i] !== null ? new Prisma.Decimal(singleValues[i]!) : null,
      }))
      .filter((_, i) => singleValues[i] !== null); // Only save non-null values

    if (data.length > 0) {
      const result = await prisma.indicatorValue.createMany({
        data,
        skipDuplicates: true,
      });
      savedCount = result.count;
    }
  }

  // Update StockIndicator tracking
  await prisma.stockIndicator.upsert({
    where: {
      stockId_indicatorId: { stockId, indicatorId },
    },
    create: {
      stockId,
      indicatorId,
      version,
      rowCount: savedCount,
    },
    update: {
      version,
      rowCount: savedCount,
      computedAt: new Date(),
    },
  });

  return savedCount;
}

/**
 * Compute an indicator for a stock
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
    const isOwner = indicator.createdBy === userId;
    const isPublic = indicator.visibleTo.length === 0;
    const hasAccess = userId ? indicator.visibleTo.includes(userId) : false;

    if (!isOwner && !isPublic && !hasAccess) {
      return {
        success: false,
        stockId,
        indicatorId,
        error: 'Access denied to private indicator',
      };
    }

    // Check if already computed with current version
    if (!forceRecompute) {
      const alreadyComputed = await isIndicatorComputed(indicatorId, stockId, indicator.version);
      if (alreadyComputed) {
        const existingValues = await getCachedIndicatorValues(indicatorId, stockId, indicator.version);
        return {
          success: true,
          stockId,
          indicatorId,
          version: indicator.version,
          rowsComputed: 0,
          cachedRows: existingValues.size,
        };
      }
    }

    // Load stock prices
    const priceWhere: any = { stockId };
    if (startDate) priceWhere.date = { ...priceWhere.date, gte: startDate };
    if (endDate) priceWhere.date = { ...priceWhere.date, lte: endDate };

    const prices = await prisma.stockPrice.findMany({
      where: priceWhere,
      orderBy: { date: 'asc' },
    });

    if (prices.length === 0) {
      return {
        success: false,
        stockId,
        indicatorId,
        error: 'No price data available for stock',
      };
    }

    // Convert Decimal fields to numbers
    const pricesWithNumbers = prices.map(p => ({
      id: p.id,
      date: p.date,
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: p.volume,
      turnover: p.turnover ? Number(p.turnover) : null,
      amplitude: p.amplitude ? Number(p.amplitude) : null,
      changePct: p.changePct ? Number(p.changePct) : null,
      changeAmount: p.changeAmount ? Number(p.changeAmount) : null,
      turnoverRate: p.turnoverRate ? Number(p.turnoverRate) : null,
    }));

    // Load dependent indicator values
    const existingIndicators = new Map<string, Map<string, IndicatorValueData>>();

    for (const depId of indicator.dependencies) {
      const depIndicator = await loadIndicator(depId);
      if (depIndicator) {
        const depValues = await getCachedIndicatorValues(depId, stockId, depIndicator.version);
        existingIndicators.set(depIndicator.outputColumn, depValues);
      }
    }

    // Build data records for Python
    const priceRecords = buildDataRecords(pricesWithNumbers, existingIndicators);
    const dataRecords = priceRecords.map(pr => pr.data);

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

    // Validate and save results
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

      const savedCount = await saveIndicatorValues(
        indicatorId,
        stockId,
        indicator.version,
        priceRecords,
        filteredValues,
        true
      );

      return {
        success: true,
        stockId,
        indicatorId,
        version: indicator.version,
        rowsComputed: prices.length,
        cachedRows: savedCount,
      };
    } else {
      const savedCount = await saveIndicatorValues(
        indicatorId,
        stockId,
        indicator.version,
        priceRecords,
        executionResult.values as (number | null)[],
        false
      );

      return {
        success: true,
        stockId,
        indicatorId,
        version: indicator.version,
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
 * Get indicator values for display (with JOIN to get dates)
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
  version?: number;
  error?: string;
}> {
  const { startDate, endDate, autoCompute = true } = options || {};

  // Load indicator to check visibility and version
  const indicator = await loadIndicator(indicatorId);
  if (!indicator) {
    return { values: [], computed: false, error: 'Indicator not found' };
  }

  // Check access
  const isOwner = indicator.createdBy === userId;
  const isPublic = indicator.visibleTo.length === 0;
  const hasAccess = indicator.visibleTo.includes(userId);

  if (!isOwner && !isPublic && !hasAccess) {
    return { values: [], computed: false, error: 'Access denied' };
  }

  // Try to load cached values with current version
  const cachedValues = await getCachedIndicatorValues(indicatorId, stockId, indicator.version);

  if (cachedValues.size > 0) {
    let values = Array.from(cachedValues.values());

    if (startDate) {
      values = values.filter(v => v.date >= startDate);
    }
    if (endDate) {
      values = values.filter(v => v.date <= endDate);
    }

    return { values, computed: false, version: indicator.version };
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
    const newValues = await getCachedIndicatorValues(indicatorId, stockId, indicator.version);

    let values = Array.from(newValues.values());

    if (startDate) {
      values = values.filter(v => v.date >= startDate);
    }
    if (endDate) {
      values = values.filter(v => v.date <= endDate);
    }

    return { values, computed: true, version: indicator.version };
  }

  return { values: [], computed: false, version: indicator.version };
}

/**
 * Clear cached indicator values (for a specific version or all versions)
 */
export async function clearIndicatorCache(
  indicatorId: string,
  stockId?: string,
  version?: number
): Promise<{ deleted: number }> {
  const where: any = { indicatorId };

  if (version !== undefined) {
    where.version = version;
  }

  if (stockId) {
    where.stockPrice = { stockId };
  }

  const result = await prisma.indicatorValue.deleteMany({ where });

  // Also update StockIndicator tracking if clearing specific stock
  if (stockId) {
    await prisma.stockIndicator.deleteMany({
      where: { indicatorId, stockId },
    });
  }

  return { deleted: result.count };
}

/**
 * Clean up old version caches (background task)
 */
export async function cleanupOldVersionCaches(): Promise<{ deleted: number }> {
  // Delete indicator values where version doesn't match current indicator version
  const result = await prisma.$executeRaw`
    DELETE FROM "IndicatorValue" iv
    WHERE iv.version != (
      SELECT version FROM "Indicator" WHERE id = iv."indicatorId"
    )
  `;

  // Also clean up StockIndicator records with old versions
  await prisma.$executeRaw`
    DELETE FROM "StockIndicator" si
    WHERE si.version != (
      SELECT version FROM "Indicator" WHERE id = si."indicatorId"
    )
  `;

  return { deleted: Number(result) };
}
