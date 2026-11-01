/**
 * Period aggregation utilities for converting daily candle data
 * to weekly, monthly, and quarterly periods
 */

export type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface CandleData {
  time: string; // YYYY-MM-DD format
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IndicatorData {
  time: string; // YYYY-MM-DD format
  value: number | null;
}

/**
 * Get the period key for a given date and period type
 * Returns a string that groups dates into the same period
 */
function getPeriodKey(dateStr: string, period: Period): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  const day = date.getDate();

  switch (period) {
    case 'daily':
      return dateStr;

    case 'weekly': {
      // Get ISO week start (Monday)
      const d = new Date(date);
      const dayOfWeek = d.getDay();
      // Adjust to get Monday (day 0 = Sunday, so Monday = 1)
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }

    case 'monthly':
      return `${year}-${String(month + 1).padStart(2, '0')}-01`;

    case 'quarterly': {
      const quarter = Math.floor(month / 3);
      const quarterMonth = quarter * 3 + 1; // 1, 4, 7, 10
      return `${year}-${String(quarterMonth).padStart(2, '0')}-01`;
    }

    default:
      return dateStr;
  }
}

/**
 * Aggregate daily candle data to a specified period
 *
 * @param candles - Array of daily candle data sorted by date ascending
 * @param period - Target period ('daily', 'weekly', 'monthly', 'quarterly')
 * @returns Aggregated candle data
 */
export function aggregateCandles(candles: CandleData[], period: Period): CandleData[] {
  if (period === 'daily' || candles.length === 0) {
    return candles;
  }

  const groups = new Map<string, CandleData[]>();

  // Group candles by period
  for (const candle of candles) {
    const key = getPeriodKey(candle.time, period);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(candle);
  }

  // Aggregate each group
  const aggregated: CandleData[] = [];
  for (const [periodStart, periodCandles] of groups) {
    if (periodCandles.length === 0) continue;

    // Sort by date to ensure correct order
    periodCandles.sort((a, b) => a.time.localeCompare(b.time));

    const aggregatedCandle: CandleData = {
      time: periodStart,
      open: periodCandles[0].open, // First candle's open
      high: Math.max(...periodCandles.map(c => c.high)),
      low: Math.min(...periodCandles.map(c => c.low)),
      close: periodCandles[periodCandles.length - 1].close, // Last candle's close
    };

    aggregated.push(aggregatedCandle);
  }

  // Sort by time
  aggregated.sort((a, b) => a.time.localeCompare(b.time));

  return aggregated;
}

/**
 * Aggregation method types for different indicators
 */
export type AggregationMethod = 'last' | 'sum' | 'avg' | 'max' | 'min';

/**
 * Aggregate indicator data to match a period
 * For custom indicators, we typically want the last value in the period
 *
 * @param indicatorData - Array of indicator data sorted by date ascending
 * @param period - Target period
 * @param method - Aggregation method (default: 'last')
 * @returns Aggregated indicator data
 */
export function aggregateIndicators(
  indicatorData: IndicatorData[],
  period: Period,
  method: AggregationMethod = 'last'
): IndicatorData[] {
  if (period === 'daily' || indicatorData.length === 0) {
    return indicatorData;
  }

  const groups = new Map<string, IndicatorData[]>();

  // Group by period
  for (const data of indicatorData) {
    const key = getPeriodKey(data.time, period);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(data);
  }

  // Aggregate based on method
  const aggregated: IndicatorData[] = [];
  for (const [periodStart, periodData] of groups) {
    if (periodData.length === 0) continue;

    // Sort by date
    periodData.sort((a, b) => a.time.localeCompare(b.time));

    // Get non-null values
    const values = periodData
      .map(d => d.value)
      .filter((v): v is number => v !== null);

    let aggregatedValue: number | null = null;

    if (values.length > 0) {
      switch (method) {
        case 'sum':
          aggregatedValue = values.reduce((acc, v) => acc + v, 0);
          break;
        case 'avg':
          aggregatedValue = values.reduce((acc, v) => acc + v, 0) / values.length;
          break;
        case 'max':
          aggregatedValue = Math.max(...values);
          break;
        case 'min':
          aggregatedValue = Math.min(...values);
          break;
        case 'last':
        default:
          // Find last non-null, non-zero value
          for (let i = periodData.length - 1; i >= 0; i--) {
            if (periodData[i].value !== null && periodData[i].value !== 0) {
              aggregatedValue = periodData[i].value;
              break;
            }
          }
          break;
      }
    }

    aggregated.push({
      time: periodStart,
      value: aggregatedValue,
    });
  }

  // Sort by time
  aggregated.sort((a, b) => a.time.localeCompare(b.time));

  return aggregated;
}

/**
 * Base indicators and their aggregation methods
 */
export const BASE_INDICATOR_AGGREGATION: Record<string, AggregationMethod> = {
  volume: 'sum',
  turnover: 'sum',
  turnover_rate: 'sum',
  amplitude: 'max',      // Max amplitude in the period
  change_pct: 'last',    // Will be recalculated from candles
  change_amount: 'last', // Will be recalculated from candles
};

/**
 * Aggregate all indicators with proper methods for base indicators
 *
 * @param indicators - Record of indicator name to data array
 * @param candles - Candle data (needed for recalculating change_pct/change_amount)
 * @param period - Target period
 * @returns Aggregated indicators
 */
export function aggregateAllIndicators(
  indicators: Record<string, IndicatorData[]>,
  candles: CandleData[],
  period: Period
): Record<string, IndicatorData[]> {
  if (period === 'daily') {
    return indicators;
  }

  const result: Record<string, IndicatorData[]> = {};

  // First, aggregate candles to get period OHLC for calculating change_pct/change_amount
  const aggregatedCandles = aggregateCandles(candles, period);
  const candleMap = new Map(aggregatedCandles.map(c => [c.time, c]));

  for (const [key, data] of Object.entries(indicators)) {
    const method = BASE_INDICATOR_AGGREGATION[key] || 'last';

    if (key === 'change_pct') {
      // Recalculate change_pct from aggregated candles: (close - open) / open * 100
      result[key] = aggregatedCandles.map(c => ({
        time: c.time,
        value: c.open !== 0 ? ((c.close - c.open) / c.open) * 100 : null,
      }));
    } else if (key === 'change_amount') {
      // Recalculate change_amount from aggregated candles: close - open
      result[key] = aggregatedCandles.map(c => ({
        time: c.time,
        value: c.close - c.open,
      }));
    } else if (key === 'amplitude') {
      // Recalculate amplitude from aggregated candles: (high - low) / open * 100
      result[key] = aggregatedCandles.map(c => ({
        time: c.time,
        value: c.open !== 0 ? ((c.high - c.low) / c.open) * 100 : null,
      }));
    } else {
      // Use the standard aggregation method
      result[key] = aggregateIndicators(data, period, method);
    }
  }

  return result;
}

/**
 * Get short display label for a period
 */
export function getPeriodLabel(period: Period): string {
  switch (period) {
    case 'daily':
      return 'D';
    case 'weekly':
      return 'W';
    case 'monthly':
      return 'M';
    case 'quarterly':
      return 'Q';
    default:
      return period;
  }
}

/**
 * Get full display name for a period (for tooltips)
 */
export function getPeriodFullName(period: Period): string {
  switch (period) {
    case 'daily':
      return '日线 (Daily)';
    case 'weekly':
      return '周线 (Weekly)';
    case 'monthly':
      return '月线 (Monthly)';
    case 'quarterly':
      return '季线 (Quarterly)';
    default:
      return period;
  }
}

/**
 * All available periods
 */
export const PERIODS: Period[] = ['daily', 'weekly', 'monthly', 'quarterly'];
