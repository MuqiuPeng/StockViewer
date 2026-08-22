'use client';

import { useState, useCallback, useEffect } from 'react';

interface SimulatedCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SimulationResult {
  [indicatorId: string]: {
    value?: number | null;
    groupValues?: Record<string, number | null>;
    error?: string;
  };
}

interface SimulationPanelProps {
  stockId: string;
  lastClose: number;
  lastDate: string;
  indicatorIds: string[];
  indicatorNames: Map<string, string>; // indicatorId -> display name
  isOpen: boolean;
  onToggle: () => void;
  onSimulationResult: (candle: SimulatedCandle, indicators: SimulationResult) => void;
  onClearSimulation: () => void;
}

function getNextTradingDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  // Skip weekends
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

export default function SimulationPanel({
  stockId,
  lastClose,
  lastDate,
  indicatorIds,
  indicatorNames,
  isOpen,
  onToggle,
  onSimulationResult,
  onClearSimulation,
}: SimulationPanelProps) {
  const [date, setDate] = useState(() => getNextTradingDay(lastDate));
  const [open, setOpen] = useState(lastClose);
  const [high, setHigh] = useState(lastClose);
  const [low, setLow] = useState(lastClose);
  const [close, setClose] = useState(lastClose);
  const [volume, setVolume] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset defaults when stock changes
  useEffect(() => {
    setDate(getNextTradingDay(lastDate));
    setOpen(lastClose);
    setHigh(lastClose);
    setLow(lastClose);
    setClose(lastClose);
    setVolume(0);
    setResult(null);
    setError(null);
  }, [stockId, lastClose, lastDate]);

  // Auto-fit H/L when O/H/L/C changes
  const handleOpenChange = useCallback((v: number) => {
    setOpen(v);
    setHigh(h => Math.max(h, v));
    setLow(l => Math.min(l, v));
  }, []);

  const handleHighChange = useCallback((v: number) => {
    const fitted = Math.max(v, open, close);
    setHigh(fitted);
  }, [open, close]);

  const handleLowChange = useCallback((v: number) => {
    const fitted = Math.min(v, open, close);
    setLow(fitted);
  }, [open, close]);

  const handleCloseChange = useCallback((v: number) => {
    setClose(v);
    setHigh(h => Math.max(h, v));
    setLow(l => Math.min(l, v));
  }, []);

  const handleCopyFromLast = useCallback(() => {
    setOpen(lastClose);
    setHigh(lastClose);
    setLow(lastClose);
    setClose(lastClose);
  }, [lastClose]);

  const handleCalculate = useCallback(async () => {
    setIsCalculating(true);
    setError(null);

    try {
      // If no custom indicators, just show the candle without API call
      if (indicatorIds.length === 0) {
        setResult({});
        onSimulationResult(
          { time: date, open, high, low, close, volume },
          {},
        );
        return;
      }

      const response = await fetch('/api/simulate-indicator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId,
          simulatedCandle: { date, open, high, low, close, volume },
          indicatorIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Simulation failed');
      }

      setResult(data.indicators);
      onSimulationResult(
        { time: date, open, high, low, close, volume },
        data.indicators,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCalculating(false);
    }
  }, [stockId, date, open, high, low, close, volume, indicatorIds, onSimulationResult]);

  const handleClear = useCallback(() => {
    setResult(null);
    setError(null);
    onClearSimulation();
  }, [onClearSimulation]);

  // Collapsed state
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-1 py-4 rounded-l-lg shadow-lg hover:bg-blue-700 z-20 text-xs"
        style={{ writingMode: 'vertical-lr' }}
      >
        What-If
      </button>
    );
  }

  return (
    <div className="w-64 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="text-sm font-semibold dark:text-white">What-If</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Simulate next day</div>
        </div>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg"
        >
          &times;
        </button>
      </div>

      {/* Inputs */}
      <div className="p-3 space-y-2 flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Open</label>
            <input
              type="number"
              step="0.01"
              value={open}
              onChange={(e) => handleOpenChange(Number(e.target.value))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">High</label>
            <input
              type="number"
              step="0.01"
              value={high}
              onChange={(e) => handleHighChange(Number(e.target.value))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Low</label>
            <input
              type="number"
              step="0.01"
              value={low}
              onChange={(e) => handleLowChange(Number(e.target.value))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Close</label>
            <input
              type="number"
              step="0.01"
              value={close}
              onChange={(e) => handleCloseChange(Number(e.target.value))}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Volume (optional)</label>
          <input
            type="number"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white font-mono"
          />
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <button
            onClick={handleCopyFromLast}
            className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
          >
            Copy Last
          </button>
          <button
            onClick={handleCalculate}
            disabled={isCalculating}
            className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isCalculating ? 'Calculating...' : 'Calculate'}
          </button>
        </div>

        {result && (
          <button
            onClick={handleClear}
            className="w-full px-2 py-1 text-xs border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Clear Simulation
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-gray-200 dark:border-gray-700">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
            Simulated Values ({date})
          </div>
          <div className="space-y-1.5">
            {Object.entries(result).map(([indicatorId, res]) => {
              const name = indicatorNames.get(indicatorId) || indicatorId;
              if (res.error) {
                return (
                  <div key={indicatorId} className="text-xs">
                    <span className="text-gray-600 dark:text-gray-300">{name}</span>
                    <span className="text-red-500 ml-1">Error</span>
                  </div>
                );
              }
              if (res.groupValues) {
                return (
                  <div key={indicatorId}>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{name}</div>
                    {Object.entries(res.groupValues).map(([col, val]) => (
                      <div key={col} className="text-xs flex justify-between pl-2">
                        <span className="text-gray-600 dark:text-gray-300">{col}</span>
                        <span className="font-mono dark:text-white">
                          {val != null ? val.toFixed(4) : 'N/A'}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div key={indicatorId} className="text-xs flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">{name}</span>
                  <span className="font-mono dark:text-white">
                    {res.value != null ? res.value.toFixed(4) : 'N/A'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No indicators hint */}
      {!result && indicatorIds.length === 0 && (
        <div className="p-3 text-xs text-gray-400 dark:text-gray-500 text-center">
          Enable custom indicators in chart to simulate.
          Base indicators (volume, turnover) are not supported.
        </div>
      )}
    </div>
  );
}
