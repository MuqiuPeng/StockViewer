'use client';

import { useEffect, useRef, useState } from 'react';
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
}

interface EquityPoint {
  date: string;
  value: number;
}

interface TradeMarker {
  date: string;
  type: 'buy' | 'sell';
  amount: number;
}

interface BacktestPanelProps {
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  tradeMarkers: TradeMarker[];
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  isOpen: boolean;
  onClose: () => void;
}

export default function BacktestPanel({
  metrics,
  equityCurve,
  tradeMarkers,
  candles,
  isOpen,
  onClose,
}: BacktestPanelProps) {
  const equityChartRef = useRef<HTMLDivElement>(null);
  const equityChartApiRef = useRef<IChartApi | null>(null);
  const equitySeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [selectedTab, setSelectedTab] = useState<'metrics' | 'trades'>('metrics');

  // Initialize equity curve chart
  useEffect(() => {
    if (!isOpen || !equityChartRef.current) return;

    const chart = createChart(equityChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: equityChartRef.current.clientWidth,
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

    const series = chart.addLineSeries({
      color: '#2196F3',
      lineWidth: 2,
      title: 'Equity Curve',
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

    // Handle resize
    const handleResize = () => {
      if (equityChartRef.current && chart) {
        chart.applyOptions({ width: equityChartRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [isOpen, equityCurve]);

  if (!isOpen) return null;

  const formatNumber = (value: number, decimals: number = 2): string => {
    if (value >= 100000000) {
      return (value / 100000000).toFixed(decimals) + '亿';
    } else if (value >= 10000) {
      return (value / 10000).toFixed(decimals) + '万';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(decimals) + 'K';
    }
    return value.toFixed(decimals);
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Backtest Results</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b">
          <button
            onClick={() => setSelectedTab('metrics')}
            className={`px-4 py-2 font-medium ${
              selectedTab === 'metrics'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Performance Metrics
          </button>
          <button
            onClick={() => setSelectedTab('trades')}
            className={`px-4 py-2 font-medium ${
              selectedTab === 'trades'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Trade List ({tradeMarkers.length})
          </button>
        </div>

        {selectedTab === 'metrics' && (
          <div className="space-y-6">
            {/* Equity Curve Chart */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Equity Curve</h3>
              <div ref={equityChartRef} className="border rounded" style={{ height: '300px' }} />
            </div>

            {/* Performance Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Total Return</div>
                <div className={`text-2xl font-bold ${metrics.totalReturnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(metrics.totalReturnPct)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatNumber(metrics.finalValue)} / {formatNumber(metrics.initialValue)}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Max Drawdown</div>
                <div className="text-2xl font-bold text-red-600">
                  {formatPercent(metrics.maxDrawdownPct)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatNumber(metrics.maxDrawdown)}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Sharpe Ratio</div>
                <div className="text-2xl font-bold">
                  {metrics.sharpeRatio.toFixed(2)}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Sortino Ratio</div>
                <div className="text-2xl font-bold">
                  {metrics.sortinoRatio.toFixed(2)}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Calmar Ratio</div>
                <div className="text-2xl font-bold">
                  {metrics.calmarRatio.toFixed(2)}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Win Rate</div>
                <div className="text-2xl font-bold">
                  {metrics.winRate.toFixed(1)}%
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Avg Win</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatPercent(metrics.avgWin)}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Avg Loss</div>
                <div className="text-2xl font-bold text-red-600">
                  {formatPercent(metrics.avgLoss)}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Profit Factor</div>
                <div className="text-2xl font-bold">
                  {metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600">Trade Count</div>
                <div className="text-2xl font-bold">
                  {metrics.tradeCount}
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'trades' && (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left">Date</th>
                    <th className="border p-2 text-left">Type</th>
                    <th className="border p-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeMarkers.map((trade, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="border p-2">{trade.date}</td>
                      <td className="border p-2">
                        <span
                          className={`px-2 py-1 rounded text-sm font-medium ${
                            trade.type === 'buy'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {trade.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="border p-2 text-right font-mono">
                        {formatNumber(trade.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

