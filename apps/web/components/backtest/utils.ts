// Shared utility functions for backtest components

/**
 * Format a number with thousands separators and decimal places
 */
export function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a percentage value with sign
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format currency value with RMB prefix
 */
export function formatCurrency(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return `RMB ${formatNumber(value, decimals)}`;
}

/**
 * Format ratio value
 */
export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return value.toFixed(2);
}

/**
 * Get color class based on value (positive = green, negative = red)
 */
export function getValueColorClass(value: number | null | undefined, inverted: boolean = false): string {
  if (value === null || value === undefined || isNaN(value)) return 'text-gray-600 dark:text-gray-400';
  const isPositive = inverted ? value < 0 : value >= 0;
  return isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
}

/**
 * Get background color class for metric cards
 */
export function getMetricBgClass(type: 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral'): string {
  const classes = {
    primary: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-blue-200 dark:border-blue-700',
    success: 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border-green-200 dark:border-green-700',
    danger: 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 border-red-200 dark:border-red-700',
    warning: 'bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 border-yellow-200 dark:border-yellow-700',
    info: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 border-purple-200 dark:border-purple-700',
    neutral: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
  };
  return classes[type] || classes.neutral;
}

/**
 * Get text color class for metric cards
 */
export function getMetricTextClass(type: 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral'): string {
  const classes = {
    primary: 'text-blue-900 dark:text-blue-100',
    success: 'text-green-900 dark:text-green-100',
    danger: 'text-red-900 dark:text-red-100',
    warning: 'text-yellow-900 dark:text-yellow-100',
    info: 'text-purple-900 dark:text-purple-100',
    neutral: 'text-gray-900 dark:text-gray-100',
  };
  return classes[type] || classes.neutral;
}

/**
 * Calculate drawdown data from equity curve
 */
export function calculateDrawdown(equityCurve: Array<{ date: string; value: number }>): Array<{ date: string; drawdown: number; drawdownPct: number }> {
  const data: Array<{ date: string; drawdown: number; drawdownPct: number }> = [];
  let peak = equityCurve[0]?.value || 0;

  equityCurve.forEach(point => {
    if (point.value > peak) peak = point.value;
    const drawdown = peak - point.value;
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
    data.push({
      date: point.date,
      drawdown,
      drawdownPct: -drawdownPct,
    });
  });
  return data;
}

/**
 * Filter candles by date range
 */
export function filterCandlesByDateRange(
  candles: Array<{ time: number | string; open: number; high: number; low: number; close: number }>,
  dateRange?: { startDate?: string; endDate?: string }
): Array<{ time: number | string; open: number; high: number; low: number; close: number }> {
  if (!candles.length || !dateRange?.startDate || !dateRange?.endDate) {
    return candles;
  }

  const startDateStr = dateRange.startDate;
  const endDateStr = dateRange.endDate;

  return candles.filter(candle => {
    let candleDateStr: string;
    if (typeof candle.time === 'string') {
      candleDateStr = candle.time;
    } else {
      const candleDate = new Date(candle.time * 1000);
      candleDateStr = candleDate.toISOString().split('T')[0];
    }
    return candleDateStr >= startDateStr && candleDateStr <= endDateStr;
  });
}

/**
 * Sort trades by field
 */
export function sortTrades<T extends { date?: string; execution_date?: string; size?: number; value?: number }>(
  trades: T[],
  field: 'date' | 'size' | 'value',
  direction: 'asc' | 'desc'
): T[] {
  return [...trades].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    switch (field) {
      case 'date':
        aVal = a.execution_date || a.date || '';
        bVal = b.execution_date || b.date || '';
        break;
      case 'size':
        aVal = a.size || 0;
        bVal = b.size || 0;
        break;
      case 'value':
        aVal = a.value || 0;
        bVal = b.value || 0;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Filter trades by type
 */
export function filterTrades<T extends { type: 'buy' | 'sell' }>(
  trades: T[],
  filter: 'all' | 'buy' | 'sell'
): T[] {
  if (filter === 'all') return trades;
  return trades.filter(t => t.type === filter);
}

/**
 * Generate colors for charts
 */
export function generateChartColors(count: number): string[] {
  const baseColors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#84CC16', // lime
    '#F97316', // orange
    '#6366F1', // indigo
  ];

  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(baseColors[i % baseColors.length]);
  }
  return colors;
}

/**
 * Parse date string to timestamp for charts
 */
export function parseDateToTimestamp(dateStr: string): number {
  const date = new Date(dateStr);
  return Math.floor(date.getTime() / 1000);
}
