/**
 * Indicator computation service
 *
 * Handles computing indicators on stock data from the database.
 * Results are stored in IndicatorValue table, linked to StockPrice records.
 * Uses versioning for cache invalidation.
 */

import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import { executePythonIndicator, PythonExecutionResult, ResourceManifest, ResourceInfo } from './python-executor';

/**
 * Period type for indicators
 */
export type IndicatorPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly';

/**
 * Period hierarchy (lower number = shorter period)
 */
const PERIOD_RANK: Record<IndicatorPeriod, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
};

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
  createdBy: string;
  period: IndicatorPeriod;
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
    createdBy: indicator.createdBy,
    period: (indicator.period as IndicatorPeriod) || 'daily',
  };
}

/**
 * Get cached indicator values for a stock (using stockPriceId for alignment)
 * Returns values only for the current indicator version
 * Values are keyed by the indicator's period key (not daily date)
 */
export async function getCachedIndicatorValues(
  indicatorId: string,
  stockId: string,
  version: number,
  indicatorPeriod: IndicatorPeriod = 'daily'
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
    // Key by period key, not daily date
    // For daily indicators, this is the same as the date
    // For weekly/monthly/quarterly, this is the period start date
    const periodKey = getPeriodKey(v.stockPrice.date, indicatorPeriod);
    valueMap.set(periodKey, {
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
 * Get the period key for a date (used for grouping)
 */
function getPeriodKey(date: Date, period: IndicatorPeriod): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  const dateStr = date.toISOString().split('T')[0];

  switch (period) {
    case 'daily':
      return dateStr;

    case 'weekly': {
      // Get ISO week start (Monday)
      const d = new Date(date);
      const dayOfWeek = d.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }

    case 'monthly':
      return `${year}-${String(month + 1).padStart(2, '0')}-01`;

    case 'quarterly': {
      const quarter = Math.floor(month / 3);
      const quarterMonth = quarter * 3 + 1;
      return `${year}-${String(quarterMonth).padStart(2, '0')}-01`;
    }

    default:
      return dateStr;
  }
}

/**
 * Aggregate daily prices to a longer period
 */
interface AggregatedPrice {
  periodKey: string;
  date: Date; // Last date in the period (used as anchor)
  stockPriceId: string; // Last stockPriceId in the period
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number | null;
  amplitude?: number | null;
  changePct?: number | null;
  changeAmount?: number | null;
  turnoverRate?: number | null;
  dailyDates: string[]; // All daily dates in this period (for dependency lookup)
}

function aggregatePricesToPeriod(
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
  period: IndicatorPeriod
): AggregatedPrice[] {
  if (period === 'daily') {
    // No aggregation needed
    return prices.map(p => ({
      periodKey: p.date.toISOString().split('T')[0],
      date: p.date,
      stockPriceId: p.id,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: Number(p.volume),
      turnover: p.turnover,
      amplitude: p.amplitude,
      changePct: p.changePct,
      changeAmount: p.changeAmount,
      turnoverRate: p.turnoverRate,
      dailyDates: [p.date.toISOString().split('T')[0]],
    }));
  }

  // Group by period
  const groups = new Map<string, typeof prices>();
  for (const price of prices) {
    const key = getPeriodKey(price.date, period);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(price);
  }

  // Aggregate each group
  const result: AggregatedPrice[] = [];
  for (const [periodKey, periodPrices] of groups) {
    if (periodPrices.length === 0) continue;

    // Sort by date
    periodPrices.sort((a, b) => a.date.getTime() - b.date.getTime());

    const first = periodPrices[0];
    const last = periodPrices[periodPrices.length - 1];

    // Aggregate OHLC
    const aggregated: AggregatedPrice = {
      periodKey,
      date: last.date, // Use last date as anchor
      stockPriceId: last.id, // Use last stockPriceId as anchor
      open: first.open,
      high: Math.max(...periodPrices.map(p => p.high)),
      low: Math.min(...periodPrices.map(p => p.low)),
      close: last.close,
      volume: periodPrices.reduce((sum, p) => sum + Number(p.volume), 0),
      dailyDates: periodPrices.map(p => p.date.toISOString().split('T')[0]),
    };

    // Sum turnover and turnover_rate
    if (periodPrices.some(p => p.turnover != null)) {
      aggregated.turnover = periodPrices.reduce((sum, p) => sum + (p.turnover || 0), 0);
    }
    if (periodPrices.some(p => p.turnoverRate != null)) {
      aggregated.turnoverRate = periodPrices.reduce((sum, p) => sum + (p.turnoverRate || 0), 0);
    }

    // Recalculate amplitude and change from aggregated OHLC
    if (aggregated.open !== 0) {
      aggregated.amplitude = ((aggregated.high - aggregated.low) / aggregated.open) * 100;
      aggregated.changePct = ((aggregated.close - aggregated.open) / aggregated.open) * 100;
    }
    aggregated.changeAmount = aggregated.close - aggregated.open;

    result.push(aggregated);
  }

  // Sort by date
  result.sort((a, b) => a.date.getTime() - b.date.getTime());

  return result;
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
 * Build data records with period-aware dependency handling
 *
 * Cross-period dependency rules:
 * - If dependency period > indicator period (e.g., weekly dep for daily indicator):
 *   Expand: repeat the longer period value for each shorter period record
 * - If dependency period < indicator period (e.g., daily dep for weekly indicator):
 *   Collect: gather all shorter period values into an array for each longer period record
 */
function buildDataRecordsWithPeriod(
  aggregatedPrices: AggregatedPrice[],
  indicatorPeriod: IndicatorPeriod,
  dependencies: Array<{
    indicator: IndicatorMeta;
    values: Map<string, IndicatorValueData>;
  }>,
  dailyPrices: Array<{ date: Date }> // Original daily prices for period key lookup
): Array<{ stockPriceId: string; data: Record<string, any> }> {
  // Build a map of daily date -> period key for each period type
  const dailyToPeriodKey = new Map<IndicatorPeriod, Map<string, string>>();
  for (const period of ['daily', 'weekly', 'monthly', 'quarterly'] as IndicatorPeriod[]) {
    const map = new Map<string, string>();
    for (const price of dailyPrices) {
      const dailyKey = price.date.toISOString().split('T')[0];
      map.set(dailyKey, getPeriodKey(price.date, period));
    }
    dailyToPeriodKey.set(period, map);
  }

  return aggregatedPrices.map(price => {
    const record: Record<string, any> = {
      date: price.periodKey,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume,
    };

    // Add optional price fields
    if (price.turnover != null) record.turnover = price.turnover;
    if (price.amplitude != null) record.amplitude = price.amplitude;
    if (price.changePct != null) record.change_pct = price.changePct;
    if (price.changeAmount != null) record.change_amount = price.changeAmount;
    if (price.turnoverRate != null) record.turnover_rate = price.turnoverRate;

    // Add dependency values with period-aware handling
    for (const { indicator: depIndicator, values: depValues } of dependencies) {
      const depPeriod = depIndicator.period;
      const depRank = PERIOD_RANK[depPeriod];
      const currentRank = PERIOD_RANK[indicatorPeriod];

      if (depRank === currentRank) {
        // Same period - direct lookup
        const value = depValues.get(price.periodKey);
        if (value) {
          if (value.groupValues) {
            for (const [key, val] of Object.entries(value.groupValues)) {
              record[`${depIndicator.outputColumn}:${key}`] = val;
            }
          } else {
            record[depIndicator.outputColumn] = value.value;
          }
        }
      } else if (depRank > currentRank) {
        // Dependency has longer period (e.g., weekly dep for daily indicator)
        // IMPORTANT: We should only use COMPLETED period data to avoid look-ahead bias
        // Find the most recent completed long period (the one BEFORE the current period)
        const firstDailyDate = price.dailyDates[0];
        const periodKeyMap = dailyToPeriodKey.get(depPeriod);
        const currentDepPeriodKey = periodKeyMap?.get(firstDailyDate);

        if (currentDepPeriodKey) {
          // Find the most recent period key that is BEFORE the current period
          // (i.e., the last completed period)
          let previousPeriodKey: string | undefined;
          for (const periodKey of depValues.keys()) {
            if (periodKey < currentDepPeriodKey) {
              if (!previousPeriodKey || periodKey > previousPeriodKey) {
                previousPeriodKey = periodKey;
              }
            }
          }

          if (previousPeriodKey) {
            const value = depValues.get(previousPeriodKey);
            if (value) {
              if (value.groupValues) {
                for (const [key, val] of Object.entries(value.groupValues)) {
                  record[`${depIndicator.outputColumn}:${key}`] = val;
                }
              } else {
                record[depIndicator.outputColumn] = value.value;
              }
            }
          }
          // If no previous period exists, the dependency value will be undefined/missing
        }
      } else {
        // Dependency has shorter period (e.g., daily dep for weekly indicator)
        // Collect all shorter period values into an array
        const values: (number | null)[] = [];
        const groupValuesArrays: Record<string, (number | null)[]> = {};

        // Get all daily dates in this period and collect their values
        for (const dailyDate of price.dailyDates) {
          const value = depValues.get(dailyDate);
          if (value) {
            if (value.groupValues) {
              // Group indicator - collect each output into separate arrays
              for (const [key, val] of Object.entries(value.groupValues)) {
                if (!groupValuesArrays[key]) {
                  groupValuesArrays[key] = [];
                }
                groupValuesArrays[key].push(val);
              }
            } else {
              values.push(value.value ?? null);
            }
          } else {
            // No value for this date - push null
            if (depIndicator.isGroup && depIndicator.expectedOutputs) {
              for (const key of depIndicator.expectedOutputs) {
                if (!groupValuesArrays[key]) {
                  groupValuesArrays[key] = [];
                }
                groupValuesArrays[key].push(null);
              }
            } else {
              values.push(null);
            }
          }
        }

        // Add as array
        if (depIndicator.isGroup) {
          for (const [key, arr] of Object.entries(groupValuesArrays)) {
            record[`${depIndicator.outputColumn}:${key}`] = arr;
          }
        } else {
          record[depIndicator.outputColumn] = values;
        }
      }
    }

    return { stockPriceId: price.stockPriceId, data: record };
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
 * Detect data.import_() calls in Python code
 * Returns the names of resources to preload
 */
interface DetectedImports {
  indicators: string[];
  datasets: string[];
}

function detectImportCalls(pythonCode: string): DetectedImports {
  const indicators: string[] = [];
  const datasets: string[] = [];

  // Match data.import_('name') or data.import_('name', type='...')
  // Also match data.import_("name") with double quotes
  const importPattern = /data\.import_\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*type\s*=\s*['"](\w+)['"])?\s*\)/g;

  let match;
  while ((match = importPattern.exec(pythonCode)) !== null) {
    const name = match[1];
    const type = match[2];

    if (type === 'indicator') {
      indicators.push(name);
    } else if (type === 'dataset') {
      datasets.push(name);
    } else {
      // Unknown type, add to both for preloading
      // The Python side will resolve the actual type
      indicators.push(name);
      datasets.push(name);
    }
  }

  return {
    indicators: [...new Set(indicators)],
    datasets: [...new Set(datasets)],
  };
}

/**
 * Build resource manifest for a user
 * This contains all indicators and datasets the user has access to
 *
 * Name resolution priority:
 * 1. User's own indicators (createdBy === userId)
 * 2. Subscribed indicators from others
 */
async function buildResourceManifest(userId: string): Promise<ResourceManifest> {
  const indicatorsMap: Record<string, ResourceInfo> = {};
  const datasetsMap: Record<string, ResourceInfo> = {};

  // First, load user's own indicators (highest priority)
  const ownedIndicators = await prisma.indicator.findMany({
    where: { createdBy: userId },
    select: {
      id: true,
      name: true,
      outputColumn: true,
      isGroup: true,
      expectedOutputs: true,
      period: true,
      createdBy: true,
    },
  });

  for (const ind of ownedIndicators) {
    indicatorsMap[ind.name] = {
      id: ind.id,
      name: ind.name,
      isOwner: true,
      outputColumn: ind.outputColumn,
      isGroup: ind.isGroup,
      expectedOutputs: ind.expectedOutputs.length > 0 ? ind.expectedOutputs : undefined,
      period: ind.period,
    };
  }

  // Then load subscribed indicators (lower priority - won't override user's own)
  const userIndicators = await prisma.userIndicator.findMany({
    where: { userId },
    include: {
      indicator: {
        select: {
          id: true,
          name: true,
          outputColumn: true,
          isGroup: true,
          expectedOutputs: true,
          period: true,
          createdBy: true,
        },
      },
    },
  });

  for (const ui of userIndicators) {
    const ind = ui.indicator;
    // Only add if not already present (user's own indicators take priority)
    if (!indicatorsMap[ind.name]) {
      indicatorsMap[ind.name] = {
        id: ind.id,
        name: ind.name,
        isOwner: ind.createdBy === userId,
        outputColumn: ind.outputColumn,
        isGroup: ind.isGroup,
        expectedOutputs: ind.expectedOutputs.length > 0 ? ind.expectedOutputs : undefined,
        period: ind.period,
      };
    }
  }

  // Fetch all datasets (stocks) the user has access to
  const userStocks = await prisma.userStock.findMany({
    where: { userId },
    include: {
      stock: {
        select: {
          id: true,
          symbol: true,
          name: true,
          dataSource: true,
        },
      },
    },
  });

  for (const us of userStocks) {
    const stock = us.stock;
    // Use symbol as the key (this is what users will use to import)
    datasetsMap[stock.symbol] = {
      id: stock.id,
      name: stock.name,
      isOwner: false, // Stocks don't have ownership concept
      stockId: stock.id,
      symbol: stock.symbol,
      dataSource: stock.dataSource,
    };
  }

  return {
    indicators: indicatorsMap,
    datasets: datasetsMap,
  };
}

/**
 * Preload indicator values for import
 */
async function preloadIndicatorValues(
  indicatorNames: string[],
  stockId: string,
  manifest: ResourceManifest
): Promise<Record<string, Array<{ date: string; value?: number | null; groupValues?: Record<string, number | null> }>>> {
  const result: Record<string, Array<{ date: string; value?: number | null; groupValues?: Record<string, number | null> }>> = {};

  for (const name of indicatorNames) {
    const resourceInfo = manifest.indicators[name];
    if (!resourceInfo) continue;

    // Load indicator metadata to get version
    const indicator = await prisma.indicator.findUnique({
      where: { id: resourceInfo.id },
      select: { version: true, period: true },
    });

    if (!indicator) continue;

    // Load cached values for this indicator on this stock
    const values = await prisma.indicatorValue.findMany({
      where: {
        indicatorId: resourceInfo.id,
        version: indicator.version,
        stockPrice: { stockId },
      },
      include: {
        stockPrice: {
          select: { date: true },
        },
      },
      orderBy: { stockPrice: { date: 'asc' } },
    });

    result[name] = values.map(v => ({
      date: v.stockPrice.date.toISOString().split('T')[0],
      value: v.value ? Number(v.value) : null,
      groupValues: v.groupValues as Record<string, number | null> | undefined,
    }));
  }

  return result;
}

/**
 * Preload dataset prices for import
 */
async function preloadDatasetPrices(
  datasetNames: string[],
  manifest: ResourceManifest
): Promise<Record<string, Record<string, any>[]>> {
  const result: Record<string, Record<string, any>[]> = {};

  for (const name of datasetNames) {
    const resourceInfo = manifest.datasets[name];
    if (!resourceInfo || !resourceInfo.stockId) continue;

    // Load price data for this stock
    const prices = await prisma.stockPrice.findMany({
      where: { stockId: resourceInfo.stockId },
      orderBy: { date: 'asc' },
    });

    result[name] = prices.map(p => ({
      date: p.date.toISOString().split('T')[0],
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume),
      turnover: p.turnover ? Number(p.turnover) : null,
      amplitude: p.amplitude ? Number(p.amplitude) : null,
      change_pct: p.changePct ? Number(p.changePct) : null,
      change_amount: p.changeAmount ? Number(p.changeAmount) : null,
      turnover_rate: p.turnoverRate ? Number(p.turnoverRate) : null,
    }));
  }

  return result;
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

    // Check access permissions - user must own it or have it in their collection
    const isOwner = indicator.createdBy === userId;
    if (!isOwner && userId) {
      const inCollection = await prisma.userIndicator.findUnique({
        where: { userId_indicatorId: { userId, indicatorId } },
      });
      if (!inCollection) {
        return {
          success: false,
          stockId,
          indicatorId,
          error: 'Access denied to indicator',
        };
      }
    } else if (!isOwner && !userId) {
      return {
        success: false,
        stockId,
        indicatorId,
        error: 'Authentication required',
      };
    }

    // Check if already computed with current version
    if (!forceRecompute) {
      const alreadyComputed = await isIndicatorComputed(indicatorId, stockId, indicator.version);
      if (alreadyComputed) {
        const existingValues = await getCachedIndicatorValues(indicatorId, stockId, indicator.version, indicator.period);
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

    // Aggregate prices based on indicator's period
    const aggregatedPrices = aggregatePricesToPeriod(pricesWithNumbers, indicator.period);

    // Load dependent indicator values with period information
    const dependencies: Array<{
      indicator: IndicatorMeta;
      values: Map<string, IndicatorValueData>;
    }> = [];

    for (const depId of indicator.dependencies) {
      const depIndicator = await loadIndicator(depId);
      if (depIndicator) {
        // Get cached values - keyed by dependency's period
        const depValues = await getCachedIndicatorValues(depId, stockId, depIndicator.version, depIndicator.period);
        dependencies.push({ indicator: depIndicator, values: depValues });
      }
    }

    // Build data records with period-aware dependency handling
    const priceRecords = buildDataRecordsWithPeriod(
      aggregatedPrices,
      indicator.period,
      dependencies,
      pricesWithNumbers.map(p => ({ date: p.date }))
    );
    const dataRecords = priceRecords.map(pr => pr.data);

    // Build resource manifest and preload data for dynamic imports
    const resourceManifest = await buildResourceManifest(userId);
    const detectedImports = detectImportCalls(indicator.pythonCode);

    // Preload detected resources
    const preloadedIndicators = await preloadIndicatorValues(
      detectedImports.indicators,
      stockId,
      resourceManifest
    );
    const preloadedDatasets = await preloadDatasetPrices(
      detectedImports.datasets,
      resourceManifest
    );

    // Execute Python indicator
    const executionResult: PythonExecutionResult = await executePythonIndicator({
      code: indicator.pythonCode,
      data: dataRecords,
      isGroup: indicator.isGroup,
      externalDatasets: indicator.externalDatasets,
      resourceManifest,
      preloadedIndicators,
      preloadedDatasets,
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

    // Validate output length matches aggregated input length (not daily length)
    const expectedLength = aggregatedPrices.length;

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

      // Check length of each output array
      for (const [key, arr] of Object.entries(valuesDict)) {
        if (!Array.isArray(arr)) {
          return {
            success: false,
            stockId,
            indicatorId,
            error: `Output "${key}" is not an array`,
            errorType: 'length_mismatch',
          };
        }
        if (arr.length !== expectedLength) {
          return {
            success: false,
            stockId,
            indicatorId,
            error: `Output length mismatch for "${key}": expected ${expectedLength} rows, got ${arr.length}`,
            errorType: 'length_mismatch',
            details: {
              message: `Indicator must return exactly ${expectedLength} values to match input data length`,
              hints: [
                'Ensure your calculate() function returns a value for each input row',
                'Use padding (e.g., [None] * n + values) for indicators with lookback periods',
              ],
            },
          };
        }
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
      // Single indicator - validate length
      const singleValues = executionResult.values as (number | null)[];

      if (!Array.isArray(singleValues)) {
        return {
          success: false,
          stockId,
          indicatorId,
          error: 'Indicator must return an array of values',
          errorType: 'invalid_output',
        };
      }

      if (singleValues.length !== expectedLength) {
        return {
          success: false,
          stockId,
          indicatorId,
          error: `Output length mismatch: expected ${expectedLength} rows, got ${singleValues.length}`,
          errorType: 'length_mismatch',
          details: {
            message: `Indicator must return exactly ${expectedLength} values to match input data length`,
            hints: [
              'Ensure your calculate() function returns a value for each input row',
              'Use padding (e.g., [None] * n + values) for indicators with lookback periods',
            ],
          },
        };
      }

      const savedCount = await saveIndicatorValues(
        indicatorId,
        stockId,
        indicator.version,
        priceRecords,
        singleValues,
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

  // Check access - user must own it or have it in their collection
  const isOwner = indicator.createdBy === userId;
  if (!isOwner) {
    const inCollection = await prisma.userIndicator.findUnique({
      where: { userId_indicatorId: { userId, indicatorId } },
    });
    if (!inCollection) {
      return { values: [], computed: false, error: 'Access denied' };
    }
  }

  // Try to load cached values with current version
  const cachedValues = await getCachedIndicatorValues(indicatorId, stockId, indicator.version, indicator.period as IndicatorPeriod);

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
    const newValues = await getCachedIndicatorValues(indicatorId, stockId, indicator.version, indicator.period as IndicatorPeriod);

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
