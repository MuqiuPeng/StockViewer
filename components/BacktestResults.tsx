'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType } from 'lightweight-charts';

interface BacktestMetrics {
  totalReturn: number;
  totalReturnPct: number;
  finalValue: number;
  initialValue: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  tradeCount: number;
  wonTrades?: number;
  lostTrades?: number;
  longestWinStreak?: number;
  longestLossStreak?: number;
  avgSlippagePct?: number;
  totalSlippageCost?: number;
  sameDayTrades?: number;
  nextOpenTrades?: number;
}

interface EquityPoint {
  date: string;
  value: number;
}

interface TradeMarker {
  signal_date?: string;
  execution_date?: string;
  date: string;
  type: 'buy' | 'sell';
  amount?: number;
  price?: number;
  signal_price?: number;
  size?: number;
  value?: number;
  commission?: number;
  execution_mode?: 'close' | 'next_open';
}

interface DateRange {
  startDate?: string;
  endDate?: string;
  dataPoints?: number;
}

interface StrategyInfo {
  name?: string;
  parameters?: Record<string, any>;
  initialCash?: number;
  commission?: number;
  datasetName?: string;
}

interface StockResult {
  datasetName: string;
  metrics: BacktestMetrics;
  equityCurve?: EquityPoint[];
  tradeMarkers?: TradeMarker[];
  dataPoints: number;
}

interface GroupBacktestResult {
  type: 'group';
  groupName: string;
  aggregatedMetrics: {
    totalReturn: number;
    totalReturnPct: number;
    avgFinalValue: number;
    avgMaxDrawdownPct: number;
    avgSharpeRatio: number;
    avgSortinoRatio: number;
    avgWinRate: number;
    totalTrades: number;
    stockCount: number;
  };
  stockResults: StockResult[];
  errors?: Array<{ datasetName: string; error: string }>;
}

interface BacktestResultsProps {
  metrics?: BacktestMetrics;
  equityCurve?: EquityPoint[];
  tradeMarkers?: TradeMarker[];
  candles?: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  dateRange?: DateRange;
  strategyInfo?: StrategyInfo;
  groupResult?: GroupBacktestResult;
}

// Group Backtest Results Component
function GroupBacktestResults({
  groupResult,
  dateRange,
  strategyInfo,
}: {
  groupResult: GroupBacktestResult;
  dateRange?: DateRange;
  strategyInfo?: StrategyInfo;
}) {
  const [sortField, setSortField] = useState<'name' | 'return' | 'trades'>('return');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set());
  const [stockCandles, setStockCandles] = useState<Record<string, any>>({});

  const formatNumber = (value: number, decimals: number = 2): string => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(decimals) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(decimals) + 'K';
    }
    return value.toFixed(decimals);
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const toggleExpanded = async (datasetName: string) => {
    const newExpanded = new Set(expandedStocks);
    if (newExpanded.has(datasetName)) {
      newExpanded.delete(datasetName);
    } else {
      newExpanded.add(datasetName);
      // Load candles if not already loaded
      if (!stockCandles[datasetName]) {
        try {
          let apiName = datasetName.replace(/\.csv$/i, '');
          const response = await fetch(`/api/dataset/${encodeURIComponent(apiName)}`);
          const data = await response.json();
          if (!data.error) {
            setStockCandles(prev => ({ ...prev, [datasetName]: data }));
          }
        } catch (err) {
          console.error('Failed to load candles for', datasetName, err);
        }
      }
    }
    setExpandedStocks(newExpanded);
  };

  const sortedStocks = [...groupResult.stockResults].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    if (sortField === 'name') {
      return multiplier * a.datasetName.localeCompare(b.datasetName);
    } else if (sortField === 'return') {
      return multiplier * (a.metrics.totalReturnPct - b.metrics.totalReturnPct);
    } else {
      return multiplier * (a.metrics.tradeCount - b.metrics.tradeCount);
    }
  });

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2">Group Backtest Results</h2>
        <div className="text-gray-600">
          <span className="font-medium">{groupResult.groupName}</span>
          {strategyInfo?.name && <span> • Strategy: {strategyInfo.name}</span>}
          {dateRange?.startDate && dateRange?.endDate && (
            <span> • {dateRange.startDate} to {dateRange.endDate}</span>
          )}
        </div>
      </div>

      {/* Aggregated Metrics */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-4">Aggregated Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
            <div className="text-sm text-gray-600 mb-1">Stocks</div>
            <div className="text-3xl font-bold text-blue-900">
              {groupResult.aggregatedMetrics.stockCount}
            </div>
          </div>

          <div className={`bg-gradient-to-br p-4 rounded-lg border ${
            groupResult.aggregatedMetrics.totalReturnPct >= 0
              ? 'from-green-50 to-green-100 border-green-200'
              : 'from-red-50 to-red-100 border-red-200'
          }`}>
            <div className="text-sm text-gray-600 mb-1">Avg Return</div>
            <div className={`text-3xl font-bold ${
              groupResult.aggregatedMetrics.totalReturnPct >= 0 ? 'text-green-700' : 'text-red-700'
            }`}>
              {formatPercent(groupResult.aggregatedMetrics.totalReturnPct)}
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
            <div className="text-sm text-gray-600 mb-1">Avg Win Rate</div>
            <div className="text-3xl font-bold text-yellow-900">
              {groupResult.aggregatedMetrics.avgWinRate.toFixed(1)}%
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
            <div className="text-sm text-gray-600 mb-1">Total Trades</div>
            <div className="text-3xl font-bold text-purple-900">
              {groupResult.aggregatedMetrics.totalTrades}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border">
            <div className="text-sm text-gray-600 mb-1">Avg Sharpe</div>
            <div className="text-2xl font-bold">
              {groupResult.aggregatedMetrics.avgSharpeRatio.toFixed(3)}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border">
            <div className="text-sm text-gray-600 mb-1">Avg Sortino</div>
            <div className="text-2xl font-bold">
              {groupResult.aggregatedMetrics.avgSortinoRatio.toFixed(3)}
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200">
            <div className="text-sm text-gray-600 mb-1">Avg Max DD</div>
            <div className="text-2xl font-bold text-red-600">
              {formatPercent(groupResult.aggregatedMetrics.avgMaxDrawdownPct)}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border">
            <div className="text-sm text-gray-600 mb-1">Avg Final Value</div>
            <div className="text-2xl font-bold">
              RMB {formatNumber(groupResult.aggregatedMetrics.avgFinalValue)}
            </div>
          </div>
        </div>
      </div>

      {/* Individual Stock Results */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-4">Individual Stock Results</h3>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-3 text-left font-semibold w-12">Details</th>
                <th
                  className="border p-3 text-left font-semibold cursor-pointer hover:bg-gray-200"
                  onClick={() => {
                    if (sortField === 'name') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('name');
                      setSortDirection('asc');
                    }
                  }}
                >
                  Stock {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="border p-3 text-right font-semibold cursor-pointer hover:bg-gray-200"
                  onClick={() => {
                    if (sortField === 'return') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('return');
                      setSortDirection('desc');
                    }
                  }}
                >
                  Return % {sortField === 'return' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="border p-3 text-right font-semibold">Final Value</th>
                <th className="border p-3 text-right font-semibold">Max DD %</th>
                <th className="border p-3 text-right font-semibold">Sharpe</th>
                <th className="border p-3 text-right font-semibold">Win Rate</th>
                <th
                  className="border p-3 text-right font-semibold cursor-pointer hover:bg-gray-200"
                  onClick={() => {
                    if (sortField === 'trades') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('trades');
                      setSortDirection('desc');
                    }
                  }}
                >
                  Trades {sortField === 'trades' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStocks.map((stock, idx) => (
                <>
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="border p-3">
                      <button
                        onClick={() => toggleExpanded(stock.datasetName)}
                        className="px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                        title={expandedStocks.has(stock.datasetName) ? "Hide details" : "Show details"}
                      >
                        {expandedStocks.has(stock.datasetName) ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="border p-3 font-medium">
                      {stock.datasetName.replace(/\.csv$/i, '')}
                    </td>
                    <td className={`border p-3 text-right font-mono font-semibold ${
                      stock.metrics.totalReturnPct >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatPercent(stock.metrics.totalReturnPct)}
                    </td>
                    <td className="border p-3 text-right font-mono">
                      RMB {formatNumber(stock.metrics.finalValue)}
                    </td>
                    <td className="border p-3 text-right font-mono text-red-600">
                      {formatPercent(stock.metrics.maxDrawdownPct)}
                    </td>
                    <td className="border p-3 text-right font-mono">
                      {stock.metrics.sharpeRatio.toFixed(2)}
                    </td>
                    <td className="border p-3 text-right font-mono">
                      {stock.metrics.winRate.toFixed(1)}%
                    </td>
                    <td className="border p-3 text-right">
                      {stock.metrics.tradeCount}
                    </td>
                  </tr>
                  {expandedStocks.has(stock.datasetName) && (
                    <tr key={`${idx}-expanded`}>
                      <td colSpan={8} className="border p-0">
                        <div className="bg-gray-50 p-6">
                          {stockCandles[stock.datasetName] ? (
                            <BacktestResults
                              metrics={stock.metrics}
                              equityCurve={stock.equityCurve || []}
                              tradeMarkers={stock.tradeMarkers || []}
                              candles={stockCandles[stock.datasetName].candles}
                              dateRange={dateRange}
                              strategyInfo={{
                                ...strategyInfo,
                                datasetName: stock.datasetName,
                              }}
                            />
                          ) : (
                            <div className="text-center py-8">
                              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                              <p className="mt-2 text-gray-600">Loading chart data...</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Errors */}
      {groupResult.errors && groupResult.errors.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-4 text-red-600">Errors</h3>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            {groupResult.errors.map((error, idx) => (
              <div key={idx} className="mb-2 last:mb-0">
                <span className="font-medium">{error.datasetName}:</span> {error.error}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BacktestResults({
  metrics,
  equityCurve,
  tradeMarkers,
  candles,
  dateRange,
  strategyInfo,
  groupResult,
}: BacktestResultsProps) {
  // If groupResult is provided, render group backtest UI
  if (groupResult) {
    return <GroupBacktestResults groupResult={groupResult} dateRange={dateRange} strategyInfo={strategyInfo} />;
  }

  // Otherwise, render single stock backtest UI
  if (!metrics || !equityCurve || !tradeMarkers || !candles) {
    return null;
  }
  const equityChartRef = useRef<HTMLDivElement>(null);
  const equityChartApiRef = useRef<IChartApi | null>(null);
  const equitySeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceChartRef = useRef<HTMLDivElement>(null);
  const priceChartApiRef = useRef<IChartApi | null>(null);
  const drawdownChartRef = useRef<HTMLDivElement>(null);
  const drawdownChartApiRef = useRef<IChartApi | null>(null);

  const [selectedTab, setSelectedTab] = useState<'metrics' | 'trades' | 'charts' | 'analysis'>('metrics');
  const [tradeSortField, setTradeSortField] = useState<'date' | 'size' | 'value'>('date');
  const [tradeSortDirection, setTradeSortDirection] = useState<'asc' | 'desc'>('asc');
  const [tradeFilter, setTradeFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const [tradesPerPage, setTradesPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedYear, setSelectedYear] = useState<string>('');

  const chartInitializedRef = useRef(false);
  const priceChartInitializedRef = useRef(false);
  const drawdownChartInitializedRef = useRef(false);

  // Calculate Buy & Hold comparison
  const buyHoldMetrics = useMemo(() => {
    if (candles.length < 2) return null;
    const firstPrice = candles[0].open;
    const lastPrice = candles[candles.length - 1].close;
    const buyHoldReturn = lastPrice - firstPrice;
    const buyHoldReturnPct = (buyHoldReturn / firstPrice) * 100;
    const outperformance = metrics.totalReturnPct - buyHoldReturnPct;
    return { buyHoldReturn, buyHoldReturnPct, outperformance };
  }, [candles, metrics.totalReturnPct]);

  // Calculate Drawdown data
  const drawdownData = useMemo(() => {
    const data: Array<{ date: string; drawdown: number; drawdownPct: number }> = [];
    let peak = equityCurve[0]?.value || 0;

    equityCurve.forEach(point => {
      if (point.value > peak) peak = point.value;
      const drawdown = peak - point.value;
      const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
      data.push({
        date: point.date,
        drawdown,
        drawdownPct: -drawdownPct, // Negative for chart display
      });
    });
    return data;
  }, [equityCurve]);

  // Calculate Monthly Performance
  const monthlyPerformance = useMemo(() => {
    const monthlyData: Record<string, { returns: number[]; trades: number; wins: number }> = {};

    equityCurve.forEach((point, idx) => {
      if (idx === 0) return;
      const date = new Date(point.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { returns: [], trades: 0, wins: 0 };
      }

      const prevValue = equityCurve[idx - 1].value;
      const returnPct = ((point.value - prevValue) / prevValue) * 100;
      monthlyData[monthKey].returns.push(returnPct);
    });

    tradeMarkers.forEach(trade => {
      const date = new Date(trade.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].trades++;
      }
    });

    return Object.entries(monthlyData).map(([month, data]) => ({
      month,
      year: month.split('-')[0],
      return: data.returns.reduce((sum, r) => sum + r, 0),
      trades: data.trades,
      avgReturn: data.returns.length > 0 ? data.returns.reduce((sum, r) => sum + r, 0) / data.returns.length : 0,
    })).sort((a, b) => a.month.localeCompare(b.month));
  }, [equityCurve, tradeMarkers]);

  // Get available years and set default selected year
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(monthlyPerformance.map(m => m.year))).sort();
    return years;
  }, [monthlyPerformance]);

  // Set default selected year on mount or when years change
  useEffect(() => {
    if (availableYears.length > 0 && !selectedYear) {
      setSelectedYear(availableYears[availableYears.length - 1]); // Default to most recent year
    }
  }, [availableYears, selectedYear]);

  // Filter monthly performance by selected year
  const filteredMonthlyPerformance = useMemo(() => {
    if (!selectedYear) return monthlyPerformance;
    return monthlyPerformance.filter(m => m.year === selectedYear);
  }, [monthlyPerformance, selectedYear]);

  // Calculate Advanced Metrics
  const advancedMetrics = useMemo(() => {
    const expectancy = (metrics.avgWin * (metrics.winRate / 100)) - (Math.abs(metrics.avgLoss) * ((100 - metrics.winRate) / 100));
    const recoveryFactor = metrics.maxDrawdown > 0 ? metrics.totalReturn / metrics.maxDrawdown : 0;
    const payoffRatio = Math.abs(metrics.avgLoss) > 0 ? metrics.avgWin / Math.abs(metrics.avgLoss) : 0;

    // Calculate consecutive wins/losses
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    const sortedTrades = [...tradeMarkers].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sortedTrades.length - 1; i += 2) {
      if (i + 1 >= sortedTrades.length) break;
      const buyTrade = sortedTrades[i];
      const sellTrade = sortedTrades[i + 1];
      if (buyTrade.type === 'buy' && sellTrade.type === 'sell') {
        const pnl = (sellTrade.price || 0) - (buyTrade.price || 0);
        if (pnl > 0) {
          currentWinStreak++;
          currentLossStreak = 0;
          maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
        } else {
          currentLossStreak++;
          currentWinStreak = 0;
          maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
        }
      }
    }

    // Calculate average holding period
    let totalHoldingDays = 0;
    let completedTrades = 0;
    for (let i = 0; i < sortedTrades.length - 1; i += 2) {
      if (i + 1 >= sortedTrades.length) break;
      const buyTrade = sortedTrades[i];
      const sellTrade = sortedTrades[i + 1];
      if (buyTrade.type === 'buy' && sellTrade.type === 'sell') {
        const buyDate = new Date(buyTrade.date);
        const sellDate = new Date(sellTrade.date);
        const holdingDays = (sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24);
        totalHoldingDays += holdingDays;
        completedTrades++;
      }
    }
    const avgHoldingPeriod = completedTrades > 0 ? totalHoldingDays / completedTrades : 0;

    return {
      expectancy,
      recoveryFactor,
      payoffRatio,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      avgHoldingPeriod,
    };
  }, [metrics, tradeMarkers]);

  // Calculate Returns Distribution
  const returnsDistribution = useMemo(() => {
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prevValue = equityCurve[i - 1].value;
      const currValue = equityCurve[i].value;
      const returnPct = ((currValue - prevValue) / prevValue) * 100;
      returns.push(returnPct);
    }

    // Create histogram bins
    const bins = 20;
    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const binSize = (max - min) / bins;
    const histogram = Array(bins).fill(0);

    returns.forEach(ret => {
      const binIndex = Math.min(Math.floor((ret - min) / binSize), bins - 1);
      histogram[binIndex]++;
    });

    return {
      returns,
      histogram: histogram.map((count, idx) => ({
        bin: min + (idx * binSize),
        count,
      })),
      mean: returns.reduce((sum, r) => sum + r, 0) / returns.length,
      stdDev: Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - (returns.reduce((s, x) => s + x, 0) / returns.length), 2), 0) / returns.length),
    };
  }, [equityCurve]);

  // Performance Warnings
  const warnings = useMemo(() => {
    const warns: string[] = [];

    if (metrics.tradeCount < 10) {
      warns.push(`Low sample size (${metrics.tradeCount} trades) - results may not be statistically significant`);
    }
    if (metrics.maxDrawdownPct > 30) {
      warns.push(`High drawdown (${metrics.maxDrawdownPct.toFixed(1)}%) - consider improving risk management`);
    }
    if (metrics.sharpeRatio < 1) {
      warns.push(`Low Sharpe Ratio (${metrics.sharpeRatio.toFixed(2)}) - poor risk-adjusted returns`);
    }
    if (metrics.winRate < 40) {
      warns.push(`Low win rate (${metrics.winRate.toFixed(1)}%) - strategy may be too aggressive`);
    }
    if (advancedMetrics.payoffRatio < 1.5 && metrics.winRate < 50) {
      warns.push(`Low payoff ratio (${advancedMetrics.payoffRatio.toFixed(2)}) with low win rate - unsustainable strategy`);
    }

    return warns;
  }, [metrics, advancedMetrics]);

  // Filtered and sorted trades
  const processedTrades = useMemo(() => {
    let filtered = tradeMarkers.filter(trade => {
      if (tradeFilter === 'all') return true;
      return trade.type === tradeFilter;
    });

    filtered.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (tradeSortField) {
        case 'date':
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
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

      if (tradeSortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [tradeMarkers, tradeFilter, tradeSortField, tradeSortDirection]);

  // Paginated trades
  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * tradesPerPage;
    const end = start + tradesPerPage;
    return processedTrades.slice(start, end);
  }, [processedTrades, currentPage, tradesPerPage]);

  const totalPages = Math.ceil(processedTrades.length / tradesPerPage);

  // Initialize equity curve chart
  useEffect(() => {
    if (!equityChartRef.current) return;
    
    // Only initialize once, but allow re-initialization if chart was disposed
    if (chartInitializedRef.current && equityChartApiRef.current && !(equityChartApiRef.current as any)._disposed) {
      return;
    }

    // Clean up existing chart if any
    if (equityChartApiRef.current) {
      try {
        // Check if chart is still valid before removing
        if (equityChartApiRef.current && !(equityChartApiRef.current as any)._disposed) {
          equityChartApiRef.current.remove();
        }
      } catch (error) {
        // Chart might already be disposed, ignore error
        console.warn('Chart cleanup warning:', error);
      }
      equityChartApiRef.current = null;
      equitySeriesRef.current = null;
    }

    const chart = createChart(equityChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: equityChartRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        entireTextOnly: true,
        minimumWidth: 80,
        autoScale: true,
      },
    });

    // Scientific notation formatter for y-axis
    const scientificFormatter = (price: number) => {
      if (price === 0) return '0';
      const absPrice = Math.abs(price);
      if (absPrice >= 1 || absPrice < 0.0001) {
        return price.toExponential(2);
      }
      // For values between 0.0001 and 1, use regular notation with appropriate precision
      return price.toFixed(4);
    };

    const series = chart.addLineSeries({
      color: '#2196F3',
      lineWidth: 2,
      title: 'Equity Curve',
      priceFormat: {
        type: 'custom',
        formatter: scientificFormatter,
        minMove: 0.0001,
      },
    });

    // Convert equity curve to chart format
    const chartData = equityCurve.map((point) => ({
      time: new Date(point.date).getTime() / 1000 as any,
      value: point.value,
    }));

    series.setData(chartData);
    chart.timeScale().fitContent();

    equityChartApiRef.current = chart;
    equitySeriesRef.current = series;
    chartInitializedRef.current = true;

    // Handle resize
    const handleResize = () => {
      if (equityChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: equityChartRef.current.clientWidth });
        } catch (error) {
          // Chart might be disposed, ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't remove chart on cleanup - keep it alive for tab switching
    };
  }, [equityCurve]);

  // Update chart data when equity curve changes (but don't recreate chart)
  useEffect(() => {
    if (equitySeriesRef.current && equityCurve.length > 0) {
      const chartData = equityCurve.map((point) => ({
        time: new Date(point.date).getTime() / 1000 as any,
        value: point.value,
      }));
      equitySeriesRef.current.setData(chartData);
      if (equityChartApiRef.current && !(equityChartApiRef.current as any)._disposed) {
        try {
          equityChartApiRef.current.timeScale().fitContent();
        } catch (error) {
          // Ignore errors
        }
      }
    }
  }, [equityCurve]);

  // Update chart when tab changes to metrics (to ensure it's visible and properly sized)
  useEffect(() => {
    if (selectedTab === 'metrics' && equityChartApiRef.current && equityChartRef.current) {
      // Force chart to resize and redraw when switching back to metrics tab
      // Use double requestAnimationFrame to ensure DOM is fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (equityChartRef.current && equityChartApiRef.current) {
            try {
              const chart = equityChartApiRef.current;
              if (!(chart as any)._disposed) {
                const width = equityChartRef.current.clientWidth;
                if (width > 0) {
                  chart.applyOptions({ width });
                  chart.timeScale().fitContent();
                }
              }
            } catch (error) {
              // Chart might be disposed, try to reinitialize
              console.warn('Chart resize warning, reinitializing:', error);
              chartInitializedRef.current = false;
              // Trigger re-initialization by clearing refs
              equityChartApiRef.current = null;
              equitySeriesRef.current = null;
            }
          }
        });
      });
    }
  }, [selectedTab]);

  // Initialize Price Chart with Trade Markers - always initialize, persist across tabs
  useEffect(() => {
    if (!priceChartRef.current) return;

    if (priceChartInitializedRef.current && priceChartApiRef.current && !(priceChartApiRef.current as any)._disposed) {
      return;
    }

    // Clean up existing chart
    if (priceChartApiRef.current) {
      try {
        if (!(priceChartApiRef.current as any)._disposed) {
          priceChartApiRef.current.remove();
        }
      } catch (error) {
        console.warn('Price chart cleanup warning:', error);
      }
      priceChartApiRef.current = null;
    }

    const chart = createChart(priceChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: priceChartRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Set candlestick data
    const candleData = candles.map(candle => ({
      time: candle.time as any,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    candlestickSeries.setData(candleData);

    // Add trade markers
    const markers = tradeMarkers.map(trade => {
      const tradeTime = new Date(trade.date).getTime() / 1000;
      return {
        time: tradeTime as any,
        position: trade.type === 'buy' ? 'belowBar' : 'aboveBar',
        color: trade.type === 'buy' ? '#2196F3' : '#f44336',
        shape: trade.type === 'buy' ? 'arrowUp' : 'arrowDown',
        text: trade.type === 'buy' ? 'B' : 'S',
      } as any;
    });
    candlestickSeries.setMarkers(markers);

    chart.timeScale().fitContent();
    priceChartApiRef.current = chart;
    priceChartInitializedRef.current = true;

    const handleResize = () => {
      if (priceChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: priceChartRef.current.clientWidth });
        } catch (error) {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't remove chart on cleanup - keep it alive for tab switching
    };
  }, [candles, tradeMarkers]);

  // Update price chart when tab changes to charts (to ensure it's visible and properly sized)
  useEffect(() => {
    if (selectedTab === 'charts' && priceChartApiRef.current && priceChartRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (priceChartRef.current && priceChartApiRef.current) {
            try {
              const chart = priceChartApiRef.current;
              if (!(chart as any)._disposed) {
                const width = priceChartRef.current.clientWidth;
                if (width > 0) {
                  chart.applyOptions({ width });
                  chart.timeScale().fitContent();
                }
              }
            } catch (error) {
              console.warn('Price chart resize warning:', error);
              priceChartInitializedRef.current = false;
              priceChartApiRef.current = null;
            }
          }
        });
      });
    }
  }, [selectedTab]);

  // Initialize Drawdown Chart - always initialize, persist across tabs
  useEffect(() => {
    if (!drawdownChartRef.current) return;

    if (drawdownChartInitializedRef.current && drawdownChartApiRef.current && !(drawdownChartApiRef.current as any)._disposed) {
      return;
    }

    // Clean up existing chart
    if (drawdownChartApiRef.current) {
      try {
        if (!(drawdownChartApiRef.current as any)._disposed) {
          drawdownChartApiRef.current.remove();
        }
      } catch (error) {
        console.warn('Drawdown chart cleanup warning:', error);
      }
      drawdownChartApiRef.current = null;
    }

    const chart = createChart(drawdownChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: drawdownChartRef.current.clientWidth,
      height: 300,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
      },
    });

    const areaSeries = chart.addAreaSeries({
      lineColor: '#ef5350',
      topColor: 'rgba(239, 83, 80, 0.4)',
      bottomColor: 'rgba(239, 83, 80, 0.0)',
      lineWidth: 2,
      priceFormat: {
        type: 'percent',
      },
    });

    // Set drawdown data
    const drawdownChartData = drawdownData.map(point => ({
      time: new Date(point.date).getTime() / 1000 as any,
      value: point.drawdownPct,
    }));
    areaSeries.setData(drawdownChartData);

    chart.timeScale().fitContent();
    drawdownChartApiRef.current = chart;
    drawdownChartInitializedRef.current = true;

    const handleResize = () => {
      if (drawdownChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: drawdownChartRef.current.clientWidth });
        } catch (error) {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't remove chart on cleanup - keep it alive for tab switching
    };
  }, [drawdownData]);

  // Update drawdown chart when tab changes to charts (to ensure it's visible and properly sized)
  useEffect(() => {
    if (selectedTab === 'charts' && drawdownChartApiRef.current && drawdownChartRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (drawdownChartRef.current && drawdownChartApiRef.current) {
            try {
              const chart = drawdownChartApiRef.current;
              if (!(chart as any)._disposed) {
                const width = drawdownChartRef.current.clientWidth;
                if (width > 0) {
                  chart.applyOptions({ width });
                  chart.timeScale().fitContent();
                }
              }
            } catch (error) {
              console.warn('Drawdown chart resize warning:', error);
              drawdownChartInitializedRef.current = false;
              drawdownChartApiRef.current = null;
            }
          }
        });
      });
    }
  }, [selectedTab]);

  const formatNumber = (value: number, decimals: number = 2): string => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(decimals) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(decimals) + 'K';
    }
    return value.toFixed(decimals);
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const handleExportJSON = () => {
    const exportData = {
      exportDate: new Date().toISOString(),
      strategyInfo,
      dateRange,
      metrics,
      advancedMetrics,
      buyHoldComparison: buyHoldMetrics,
      equityCurve,
      drawdownData,
      trades: tradeMarkers,
      monthlyPerformance,
      returnsDistribution: {
        mean: returnsDistribution.mean,
        stdDev: returnsDistribution.stdDev,
        histogram: returnsDistribution.histogram,
      },
      warnings,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const strategyName = strategyInfo?.name || 'strategy';
    a.download = `${strategyName}-backtest-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    // Create CSV header
    let csv = 'Backtest Results Export\n\n';

    // Strategy Info
    if (strategyInfo) {
      csv += 'Strategy Information\n';
      csv += 'Field,Value\n';
      csv += `Strategy Name,${strategyInfo.name || 'N/A'}\n`;
      csv += `Initial Cash,${strategyInfo.initialCash || 'N/A'}\n`;
      csv += `Commission,${strategyInfo.commission || 'N/A'}\n`;
      if (strategyInfo.parameters) {
        csv += `Parameters,${JSON.stringify(strategyInfo.parameters)}\n`;
      }
      csv += '\n';
    }

    // Date Range
    if (dateRange) {
      csv += 'Date Range\n';
      csv += `Start Date,${dateRange.startDate || 'N/A'}\n`;
      csv += `End Date,${dateRange.endDate || 'N/A'}\n`;
      csv += `Data Points,${dateRange.dataPoints || 'N/A'}\n`;
      csv += '\n';
    }

    // Buy & Hold Comparison
    if (buyHoldMetrics) {
      csv += 'Buy & Hold Comparison\n';
      csv += 'Metric,Value\n';
      csv += `Strategy Return,${metrics.totalReturnPct.toFixed(2)}%\n`;
      csv += `Buy & Hold Return,${buyHoldMetrics.buyHoldReturnPct.toFixed(2)}%\n`;
      csv += `Outperformance,${buyHoldMetrics.outperformance.toFixed(2)}%\n`;
      csv += '\n';
    }

    // Summary metrics
    csv += 'Performance Metrics\n';
    csv += 'Metric,Value\n';
    csv += `Initial Capital,${metrics.initialValue}\n`;
    csv += `Final Value,${metrics.finalValue}\n`;
    csv += `Total Return,${metrics.totalReturn}\n`;
    csv += `Total Return %,${metrics.totalReturnPct}%\n`;
    csv += `Max Drawdown,${metrics.maxDrawdown}\n`;
    csv += `Max Drawdown %,${metrics.maxDrawdownPct}%\n`;
    csv += `Sharpe Ratio,${metrics.sharpeRatio}\n`;
    csv += `Sortino Ratio,${metrics.sortinoRatio}\n`;
    csv += `Calmar Ratio,${metrics.calmarRatio}\n`;
    csv += `Win Rate,${metrics.winRate}%\n`;
    csv += `Profit Factor,${metrics.profitFactor}\n`;
    csv += `Total Trades,${metrics.tradeCount}\n`;
    csv += `Winning Trades,${metrics.wonTrades || 0}\n`;
    csv += `Losing Trades,${metrics.lostTrades || 0}\n`;
    csv += `Average Win,${metrics.avgWin}\n`;
    csv += `Average Loss,${metrics.avgLoss}\n`;
    csv += '\n';

    // Advanced Metrics
    csv += 'Advanced Metrics\n';
    csv += 'Metric,Value\n';
    csv += `Expectancy,${advancedMetrics.expectancy.toFixed(2)}\n`;
    csv += `Recovery Factor,${advancedMetrics.recoveryFactor.toFixed(2)}\n`;
    csv += `Payoff Ratio,${advancedMetrics.payoffRatio.toFixed(2)}\n`;
    csv += `Max Consecutive Wins,${advancedMetrics.maxConsecutiveWins}\n`;
    csv += `Max Consecutive Losses,${advancedMetrics.maxConsecutiveLosses}\n`;
    csv += `Avg Holding Period (days),${advancedMetrics.avgHoldingPeriod.toFixed(1)}\n`;
    csv += '\n';

    // Warnings
    if (warnings.length > 0) {
      csv += 'Performance Warnings\n';
      warnings.forEach(warn => {
        csv += `"${warn}"\n`;
      });
      csv += '\n';
    }

    // Monthly Performance
    csv += 'Monthly Performance\n';
    csv += 'Month,Return %,Trades,Avg Daily Return %\n';
    monthlyPerformance.forEach(month => {
      csv += `${month.month},${month.return.toFixed(2)},${month.trades},${month.avgReturn.toFixed(3)}\n`;
    });
    csv += '\n';

    // Add trades table
    csv += 'Trade History\n';
    csv += 'Date,Type,Price,Size,Value,Commission\n';
    tradeMarkers.forEach(trade => {
      csv += `${trade.date},${trade.type},${trade.price || ''},${trade.size || ''},${trade.value || ''},${trade.commission || ''}\n`;
    });
    csv += '\n';

    // Add equity curve
    csv += 'Equity Curve\n';
    csv += 'Date,Portfolio Value\n';
    equityCurve.forEach(point => {
      csv += `${point.date},${point.value}\n`;
    });
    csv += '\n';

    // Add drawdown data
    csv += 'Drawdown Data\n';
    csv += 'Date,Drawdown,Drawdown %\n';
    drawdownData.forEach(point => {
      csv += `${point.date},${point.drawdown.toFixed(2)},${point.drawdownPct.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const strategyName = strategyInfo?.name || 'strategy';
    a.download = `${strategyName}-backtest-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Strategy Info */}
      {strategyInfo && (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-medium">Strategy:</span>{' '}
              <span className="font-semibold">{strategyInfo.name || 'N/A'}</span>
              {warnings.length > 0 && (
                <div className="relative group">
                  <span className="text-yellow-600 font-bold text-lg cursor-help">⚠️</span>
                  {/* Tooltip */}
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50">
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-lg p-3 min-w-[300px] max-w-[500px]">
                      <div className="font-semibold text-yellow-800 mb-2">Performance Warnings</div>
                      <ul className="space-y-1">
                        {warnings.map((warn, idx) => (
                          <li key={idx} className="text-sm text-yellow-700">• {warn}</li>
                        ))}
                      </ul>
                      {/* Arrow */}
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-yellow-300"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {strategyInfo.datasetName && (
              <div>
                <span className="text-gray-600 font-medium">Dataset:</span>{' '}
                <span className="font-semibold text-gray-800">
                  {strategyInfo.datasetName.replace(/\.csv$/i, '')}
                </span>
              </div>
            )}
            {strategyInfo.parameters && Object.keys(strategyInfo.parameters).length > 0 && (
              <div>
                <span className="text-gray-600 font-medium">Parameters:</span>{' '}
                <span className="text-gray-800">
                  {Object.entries(strategyInfo.parameters).map(([key, val]) => `${key}=${val}`).join(', ')}
                </span>
              </div>
            )}
            {metrics && (metrics.sameDayTrades !== undefined || metrics.nextOpenTrades !== undefined) && (
              <div>
                <span className="text-gray-600 font-medium">Execution:</span>{' '}
                <span className="font-semibold">
                  {metrics.sameDayTrades || 0} same-day,{' '}
                  {metrics.nextOpenTrades || 0} next-day
                </span>
              </div>
            )}
            {metrics?.avgSlippagePct !== undefined && (
              <div>
                <span className="text-gray-600 font-medium">Avg Slippage:</span>{' '}
                <span className={`font-semibold ${metrics.avgSlippagePct >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {metrics.avgSlippagePct >= 0 ? '+' : ''}{metrics.avgSlippagePct.toFixed(3)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Section */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="relative group bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Initial Capital</div>
          <div className="text-2xl font-bold text-blue-900">
            RMB {formatNumber(metrics.initialValue)}
          </div>
          {/* Tooltip */}
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
            <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
              <div className="font-semibold mb-1">Initial Capital</div>
              <div>Starting cash available for trading at the beginning of the backtest period.</div>
              {/* Arrow */}
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        <div className="relative group bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Final Value</div>
          <div className="text-2xl font-bold text-purple-900">
            RMB {formatNumber(metrics.finalValue)}
          </div>
          {/* Tooltip */}
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
            <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
              <div className="font-semibold mb-1">Final Value</div>
              <div>Total portfolio value (cash + stock holdings) at the end of the backtest period.</div>
              {/* Arrow */}
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        <div className={`relative group p-4 rounded-lg border cursor-help bg-gradient-to-br ${
          metrics.totalReturnPct >= 0
            ? 'from-green-50 to-green-100 border-green-200'
            : 'from-red-50 to-red-100 border-red-200'
        }`}>
          <div className="text-xs text-gray-600 mb-1">Total Return</div>
          <div className={`text-2xl font-bold ${
            metrics.totalReturnPct >= 0 ? 'text-green-700' : 'text-red-700'
          }`}>
            {formatPercent(metrics.totalReturnPct)}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            RMB {formatNumber(Math.abs(metrics.totalReturn))}
          </div>
          {/* Tooltip */}
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
            <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
              <div className="font-semibold mb-1">Total Return</div>
              <div className="mb-1">Calculation: (Final Value - Initial Capital) / Initial Capital × 100%</div>
              <div>Measures the overall profit or loss as a percentage of your starting capital.</div>
              {/* Arrow */}
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        <div className="relative group bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Total Trades</div>
          <div className="text-2xl font-bold text-orange-900">
            {metrics.tradeCount}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {metrics.wonTrades || 0}W / {metrics.lostTrades || 0}L
          </div>
          {/* Tooltip */}
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
            <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
              <div className="font-semibold mb-1">Total Trades</div>
              <div>Number of completed buy-sell pairs (round trips). A winning trade has sell price {'>'} buy price, losing trade has sell price ≤ buy price.</div>
              {/* Arrow */}
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        {buyHoldMetrics && (
          <div className={`relative group p-4 rounded-lg border cursor-help bg-gradient-to-br ${
            buyHoldMetrics.outperformance >= 0
              ? 'from-teal-50 to-teal-100 border-teal-200'
              : 'from-rose-50 to-rose-100 border-rose-200'
          }`}>
            <div className="text-xs text-gray-600 mb-1">vs Buy & Hold</div>
            <div className={`text-2xl font-bold ${
              buyHoldMetrics.outperformance >= 0 ? 'text-teal-700' : 'text-rose-700'
            }`}>
              {formatPercent(buyHoldMetrics.outperformance)}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              B&H: {formatPercent(buyHoldMetrics.buyHoldReturnPct)}
            </div>
            {/* Tooltip */}
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
              <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                <div className="font-semibold mb-1">vs Buy & Hold</div>
                <div className="mb-1">Calculation: Strategy Return % - Buy & Hold Return %</div>
                <div>Compares your strategy's performance against simply buying and holding the stock. Positive = outperformed buy & hold.</div>
                {/* Arrow */}
                <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs and Export Buttons */}
      <div className="flex justify-between items-center mb-4 border-b">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedTab('metrics')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'metrics'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Performance Metrics
          </button>
          <button
            onClick={() => setSelectedTab('trades')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'trades'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Trade List ({tradeMarkers.length})
          </button>
          <button
            onClick={() => setSelectedTab('charts')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'charts'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Charts
          </button>
          <button
            onClick={() => setSelectedTab('analysis')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'analysis'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Analysis
          </button>
        </div>

        <div className="flex gap-2 pb-2">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
            title="Export as CSV"
          >
            Export CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            title="Export as JSON"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Always render chart container to keep it alive, but conditionally show content */}
      <div className={selectedTab === 'metrics' ? 'space-y-4' : 'hidden'}>
        {/* Equity Curve Chart - always mounted */}
        <div
          className="w-full"
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-y pinch-zoom' }}
          onWheel={(e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
              e.preventDefault();
            }
          }}
        >
          <div ref={equityChartRef} className="border rounded bg-white w-full" style={{ height: '400px', minHeight: '400px', overscrollBehavior: 'contain' }} />
        </div>

        {selectedTab === 'metrics' && (
          <>

          {/* Performance Metrics Grid */}
          <div className="space-y-6">
            {/* Risk-Adjusted Returns */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Risk-Adjusted Performance</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="relative group bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Max Drawdown</div>
                  <div className="text-2xl font-bold text-red-600">
                    {formatPercent(metrics.maxDrawdownPct)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    RMB {formatNumber(metrics.maxDrawdown)}
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Maximum Drawdown</div>
                      <div className="mb-1">Peak-to-trough decline during the backtest period.</div>
                      <div>Measures the largest loss from a portfolio peak. Lower is better. Shows worst-case scenario risk.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Sharpe Ratio</div>
                  <div className="text-2xl font-bold">
                    {metrics.sharpeRatio.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Annualized</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Sharpe Ratio</div>
                      <div className="mb-1">Calculation: (Mean Return × √252) / Std Dev of Returns</div>
                      <div>Risk-adjusted return metric. Higher is better. &gt;1 is good, &gt;2 is very good, &gt;3 is excellent.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Sortino Ratio</div>
                  <div className="text-2xl font-bold">
                    {metrics.sortinoRatio.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Downside Risk</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Sortino Ratio</div>
                      <div className="mb-1">Calculation: (Mean Return × √252) / Downside Deviation</div>
                      <div>Like Sharpe but only penalizes downside volatility. Better for asymmetric returns. Higher is better.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Calmar Ratio</div>
                  <div className="text-2xl font-bold">
                    {metrics.calmarRatio.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Return/Drawdown</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Calmar Ratio</div>
                      <div className="mb-1">Calculation: Annual Return / Max Drawdown %</div>
                      <div>Return per unit of drawdown risk. Higher is better. &gt;3 is good, &gt;5 is excellent.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Profit Factor</div>
                  <div className="text-2xl font-bold">
                    {metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Wins/Losses</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Profit Factor</div>
                      <div className="mb-1">Calculation: Total Winning P&L / Total Losing P&L</div>
                      <div>Gross profit divided by gross loss. &gt;1.5 is good, &gt;2 is very good. &lt;1 means losing strategy.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Trade Statistics */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Trade Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Total Trades</div>
                  <div className="text-2xl font-bold">
                    {metrics.tradeCount}
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Total Trades</div>
                      <div>Number of completed round-trip trades (buy-sell pairs). Not individual buy or sell orders.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Winning Trades</div>
                  <div className="text-2xl font-bold text-green-600">
                    {metrics.wonTrades || 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {metrics.tradeCount > 0 ? ((metrics.wonTrades || 0) / metrics.tradeCount * 100).toFixed(1) : 0}%
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Winning Trades</div>
                      <div>Number of profitable trades where sell price {'>'} buy price. Percentage shows proportion of total trades.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Losing Trades</div>
                  <div className="text-2xl font-bold text-red-600">
                    {metrics.lostTrades || 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {metrics.tradeCount > 0 ? ((metrics.lostTrades || 0) / metrics.tradeCount * 100).toFixed(1) : 0}%
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Losing Trades</div>
                      <div>Number of unprofitable trades where sell price ≤ buy price. Percentage shows proportion of total trades.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Win Rate</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {metrics.winRate.toFixed(1)}%
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Win Rate</div>
                      <div className="mb-1">Calculation: Winning Trades / Total Trades × 100%</div>
                      <div>Percentage of profitable trades. &gt;50% is good, but profitability also depends on win/loss size ratio.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Avg Win</div>
                  <div className="text-2xl font-bold text-green-600">
                    RMB {formatNumber(metrics.avgWin)}
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Average Win</div>
                      <div className="mb-1">Calculation: Total Profit from Wins / Number of Wins</div>
                      <div>Average profit per winning trade. Compare with Avg Loss for risk/reward ratio.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Avg Loss</div>
                  <div className="text-2xl font-bold text-red-600">
                    RMB {formatNumber(Math.abs(metrics.avgLoss))}
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Average Loss</div>
                      <div className="mb-1">Calculation: Total Loss from Losses / Number of Losses</div>
                      <div>Average loss per losing trade. Ideally should be smaller than Avg Win for positive expectancy.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Execution & Slippage */}
            {(metrics.avgSlippagePct !== undefined || metrics.sameDayTrades !== undefined) && (
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Execution & Slippage</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                    <div className="text-sm text-gray-600 mb-1">Same-Day Trades</div>
                    <div className="text-2xl font-bold">{metrics.sameDayTrades || 0}</div>
                    <div className="text-xs text-gray-500 mt-1">Execute at close</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                      <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                        <div className="font-semibold mb-1">Same-Day Trades</div>
                        <div>Trades executed at the close price on the same day as the signal. Immediate execution with no overnight gap.</div>
                        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>

                  <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                    <div className="text-sm text-gray-600 mb-1">Next-Day Trades</div>
                    <div className="text-2xl font-bold">{metrics.nextOpenTrades || 0}</div>
                    <div className="text-xs text-gray-500 mt-1">Execute at open</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                      <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                        <div className="font-semibold mb-1">Next-Day Trades</div>
                        <div>Trades executed at the open price the day after the signal. More realistic execution with overnight gap risk.</div>
                        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>

                  <div className="relative group bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200 cursor-help">
                    <div className="text-sm text-gray-600 mb-1">Avg Slippage</div>
                    <div className={`text-2xl font-bold ${(metrics.avgSlippagePct ?? 0) >= 0 ? 'text-orange-700' : 'text-green-700'}`}>
                      {(metrics.avgSlippagePct ?? 0) >= 0 ? '+' : ''}{metrics.avgSlippagePct?.toFixed(3) ?? '0.000'}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Price difference</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                      <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                        <div className="font-semibold mb-1">Average Slippage</div>
                        <div className="mb-1">Calculation: Avg((Execution Price - Signal Price) / Signal Price × 100%)</div>
                        <div>Price difference between signal and execution. Positive = worse fill, negative = better fill. For next-day trades only.</div>
                        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>

                  <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                    <div className="text-sm text-gray-600 mb-1">Slippage Cost</div>
                    <div className="text-2xl font-bold">
                      RMB {formatNumber(metrics.totalSlippageCost || 0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Total impact</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                      <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                        <div className="font-semibold mb-1">Slippage Cost</div>
                        <div className="mb-1">Calculation: Sum(|Execution Price - Signal Price| × Shares)</div>
                        <div>Total monetary impact of price slippage across all trades. Lower is better.</div>
                        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Metrics */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Advanced Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Expectancy</div>
                  <div className="text-2xl font-bold">
                    RMB {formatNumber(advancedMetrics.expectancy)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Per Trade</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Expectancy</div>
                      <div className="mb-1">Calculation: (Avg Win × Win Rate) - (Avg Loss × Loss Rate)</div>
                      <div>Average profit/loss per trade. Positive means profitable long-term. Higher is better.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Recovery Factor</div>
                  <div className="text-2xl font-bold">
                    {advancedMetrics.recoveryFactor.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Profit/Drawdown</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Recovery Factor</div>
                      <div className="mb-1">Calculation: Net Profit / Max Drawdown</div>
                      <div>How many times profit exceeds max drawdown. &gt;2 is good. Shows how quickly losses are recovered.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Payoff Ratio</div>
                  <div className="text-2xl font-bold">
                    {advancedMetrics.payoffRatio.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Win/Loss Size</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Payoff Ratio</div>
                      <div className="mb-1">Calculation: Avg Win / Avg Loss</div>
                      <div>Size of average win vs average loss. &gt;2 is good. Can be profitable even with low win rate if this is high.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Max Win Streak</div>
                  <div className="text-2xl font-bold text-green-600">
                    {advancedMetrics.maxConsecutiveWins}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Consecutive</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Max Win Streak</div>
                      <div>Maximum number of consecutive winning trades in a row. Shows best performance streak.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Max Loss Streak</div>
                  <div className="text-2xl font-bold text-red-600">
                    {advancedMetrics.maxConsecutiveLosses}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Consecutive</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Max Loss Streak</div>
                      <div>Maximum number of consecutive losing trades in a row. Shows worst performance streak. Important for risk management.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Avg Holding</div>
                  <div className="text-2xl font-bold">
                    {advancedMetrics.avgHoldingPeriod.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Days</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Average Holding Period</div>
                      <div className="mb-1">Calculation: Avg(Days between Buy and Sell)</div>
                      <div>Average number of days positions are held. Shows if strategy is short-term or long-term.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </>
        )}
      </div>

      {selectedTab === 'trades' && (
        <div>
          {/* Trade Filters and Controls */}
          <div className="mb-4 flex items-center gap-4 p-4 bg-gray-50 border rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Filter:</label>
              <select
                value={tradeFilter}
                onChange={(e) => { setTradeFilter(e.target.value as any); setCurrentPage(1); }}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="all">All Trades</option>
                <option value="buy">Buy Only</option>
                <option value="sell">Sell Only</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Per Page:</label>
              <select
                value={tradesPerPage}
                onChange={(e) => { setTradesPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div className="ml-auto text-sm text-gray-600">
              Showing {processedTrades.length} trades (Page {currentPage} of {totalPages || 1})
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th
                    className="border p-3 text-left font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => {
                      if (tradeSortField === 'date') {
                        setTradeSortDirection(tradeSortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setTradeSortField('date');
                        setTradeSortDirection('asc');
                      }
                    }}
                  >
                    Signal Date {tradeSortField === 'date' && (tradeSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="border p-3 text-left font-semibold">Exec Date</th>
                  <th className="border p-3 text-left font-semibold">Type</th>
                  <th className="border p-3 text-right font-semibold">Signal Price</th>
                  <th className="border p-3 text-right font-semibold">Exec Price</th>
                  <th className="border p-3 text-right font-semibold">Slippage %</th>
                  <th
                    className="border p-3 text-right font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => {
                      if (tradeSortField === 'size') {
                        setTradeSortDirection(tradeSortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setTradeSortField('size');
                        setTradeSortDirection('desc');
                      }
                    }}
                  >
                    Size {tradeSortField === 'size' && (tradeSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="border p-3 text-right font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => {
                      if (tradeSortField === 'value') {
                        setTradeSortDirection(tradeSortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setTradeSortField('value');
                        setTradeSortDirection('desc');
                      }
                    }}
                  >
                    Value {tradeSortField === 'value' && (tradeSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="border p-3 text-right font-semibold">Commission</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrades.map((trade, idx) => {
                  const slippage = trade.signal_price && trade.price
                    ? ((trade.price - trade.signal_price) / trade.signal_price * 100)
                    : null;

                  return (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="border p-3">{trade.signal_date || trade.date}</td>
                      <td className="border p-3">
                        {trade.execution_date || trade.date}
                        {trade.execution_mode === 'next_open' && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            Next Day
                          </span>
                        )}
                      </td>
                      <td className="border p-3">
                        <span
                          className={`px-3 py-1 rounded text-sm font-medium ${
                            trade.type === 'buy'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {trade.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="border p-3 text-right font-mono">
                        {trade.signal_price !== undefined && trade.signal_price > 0
                          ? trade.signal_price.toFixed(2)
                          : '-'}
                      </td>
                      <td className="border p-3 text-right font-mono">
                        {trade.price !== undefined && trade.price > 0
                          ? trade.price.toFixed(2)
                          : 'N/A'}
                      </td>
                      <td className={`border p-3 text-right font-mono ${
                        slippage !== null ? (slippage >= 0 ? 'text-red-600' : 'text-green-600') : ''
                      }`}>
                        {slippage !== null ? `${slippage >= 0 ? '+' : ''}${slippage.toFixed(2)}%` : '-'}
                      </td>
                      <td className="border p-3 text-right font-mono">
                        {trade.size !== undefined ? trade.size.toLocaleString() : (trade.amount ? formatNumber(trade.amount) : 'N/A')}
                      </td>
                      <td className="border p-3 text-right font-mono">
                        {trade.value !== undefined && trade.value > 0
                          ? formatNumber(trade.value)
                          : 'N/A'}
                      </td>
                      <td className="border p-3 text-right font-mono text-gray-500">
                        {trade.commission !== undefined && trade.commission > 0
                          ? formatNumber(trade.commission)
                          : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-2 border rounded ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Charts Tab - always render containers but conditionally show them */}
      <div className={selectedTab === 'charts' ? 'space-y-6' : 'hidden'}>
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Price Chart with Trade Markers</h3>
          <div
            className="border rounded-lg bg-white overflow-hidden"
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y pinch-zoom' }}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
              }
            }}
          >
            <div ref={priceChartRef} style={{ width: '100%', height: '400px', overscrollBehavior: 'contain' }} />
          </div>
          <div className="mt-2 text-sm text-gray-600 flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 bg-blue-500"></span>
              <span>Buy (B)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 bg-red-500"></span>
              <span>Sell (S)</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Drawdown Chart</h3>
          <div
            className="border rounded-lg bg-white overflow-hidden"
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y pinch-zoom' }}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
              }
            }}
          >
            <div ref={drawdownChartRef} style={{ width: '100%', height: '300px', overscrollBehavior: 'contain' }} />
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Shows the percentage decline from the peak equity value over time
          </div>
        </div>
      </div>

      {/* Analysis Tab */}
      {selectedTab === 'analysis' && (
        <div className="space-y-6">
          {/* Year Selection */}
          {availableYears.length > 0 && (
            <div className="mb-4 p-4 bg-gray-50 border rounded-lg">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Select Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                {availableYears.length > 1 && (
                  <div className="ml-auto text-sm text-gray-600">
                    Showing {filteredMonthlyPerformance.length} months for {selectedYear}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Monthly Performance */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">
              Monthly Performance {selectedYear && `(${selectedYear})`}
            </h3>
            {filteredMonthlyPerformance.length > 0 ? (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-3 text-left font-semibold">Month</th>
                      <th className="border p-3 text-right font-semibold">Return %</th>
                      <th className="border p-3 text-right font-semibold">Trades</th>
                      <th className="border p-3 text-right font-semibold">Avg Daily Return %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMonthlyPerformance.map((month, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border p-3">{month.month}</td>
                        <td className={`border p-3 text-right font-mono font-semibold ${
                          month.return >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatPercent(month.return)}
                        </td>
                        <td className="border p-3 text-right">{month.trades}</td>
                        <td className={`border p-3 text-right font-mono ${
                          month.avgReturn >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {month.avgReturn.toFixed(3)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 border rounded-lg bg-gray-50">
                No data available for the selected year
              </div>
            )}
          </div>

          {/* Returns Distribution */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Returns Distribution</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600 mb-1">Mean Daily Return</div>
                <div className={`text-2xl font-bold ${
                  returnsDistribution.mean >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {returnsDistribution.mean.toFixed(3)}%
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600 mb-1">Std Deviation</div>
                <div className="text-2xl font-bold">
                  {returnsDistribution.stdDev.toFixed(3)}%
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600 mb-1">Sample Size</div>
                <div className="text-2xl font-bold">
                  {returnsDistribution.returns.length}
                </div>
                <div className="text-xs text-gray-500 mt-1">Days</div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 border rounded-lg text-center text-gray-600">
              Returns distribution histogram will be displayed here
              <div className="mt-2 text-sm">(Visualization in progress)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

