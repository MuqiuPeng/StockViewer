'use client';

import { useState, useEffect, useMemo } from 'react';
import ChartPanel from './ChartPanel';
import IndicatorSelector from './IndicatorSelector';
import AddDatasetModal from './AddDatasetModal';
import IndicatorManager from './IndicatorManager';
import DataPanel from './DataPanel';
import StrategyManager from './StrategyManager';
import RunBacktestModal from './RunBacktestModal';
import BacktestPanel from './BacktestPanel';
import { API_CONFIG } from '@/lib/env';

interface DatasetInfo {
  name: string;
  code: string;
  filename: string;
  columns: string[];
  indicators: string[];
  rowCount: number;
  dataSource?: string;
}

interface CandleData {
  time: string; // YYYY-MM-DD format
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndicatorData {
  time: string; // YYYY-MM-DD format
  value: number | null;
}

interface DatasetData {
  meta: {
    name: string;
    filename: string;
    columns: string[];
    indicators: string[];
    rowCount: number;
  };
  candles: CandleData[];
  indicators: Record<string, IndicatorData[]>;
}

export default function StockDashboard() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [datasetData, setDatasetData] = useState<DatasetData | null>(null);
  const [enabledIndicators1, setEnabledIndicators1] = useState<Set<string>>(new Set());
  const [enabledIndicators2, setEnabledIndicators2] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddDatasetModalOpen, setIsAddDatasetModalOpen] = useState(false);
  const [isIndicatorManagerOpen, setIsIndicatorManagerOpen] = useState(false);
  const [isOutdated, setIsOutdated] = useState(false);
  const [lastDataDate, setLastDataDate] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [definedIndicators, setDefinedIndicators] = useState<string[]>([]);
  const [indicatorGroups, setIndicatorGroups] = useState<Set<string>>(new Set());
  const [crosshairTime, setCrosshairTime] = useState<string | null>(null);
  const [isStrategyManagerOpen, setIsStrategyManagerOpen] = useState(false);
  const [isRunBacktestOpen, setIsRunBacktestOpen] = useState(false);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [isBacktestLoading, setIsBacktestLoading] = useState(false);
  const [backtestResults, setBacktestResults] = useState<any>(null);
  const [isBacktestPanelOpen, setIsBacktestPanelOpen] = useState(false);

  // Base indicators from API (not custom calculated)
  const BASE_INDICATORS = ['volume', 'turnover', 'amplitude', 'change_pct', 'change_amount', 'turnover_rate'];

  // Color palette matching ChartPanel
  const INDICATOR_COLORS = [
    '#2196F3', '#FF9800', '#4CAF50', '#9C27B0', '#F44336',
    '#00BCD4', '#FFEB3B', '#795548', '#607D8B', '#E91E63',
  ];

  // Calculate shared color map for all indicators across both charts
  const indicatorColorMap = useMemo(() => {
    const allEnabled = new Set([...enabledIndicators1, ...enabledIndicators2]);
    const sorted = Array.from(allEnabled).sort();
    const colorMap = new Map<string, string>();
    sorted.forEach((ind, idx) => {
      colorMap.set(ind, INDICATOR_COLORS[idx % INDICATOR_COLORS.length]);
    });
    return colorMap;
  }, [enabledIndicators1, enabledIndicators2]);

  // Load datasets list and defined indicators on mount
  useEffect(() => {
    // Load datasets
    fetch('/api/datasets')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.message || 'Failed to load datasets');
          return;
        }
        setDatasets(data);
        if (data.length > 0) {
          setSelectedDataset(data[0].name);
        }
      })
      .catch((err) => {
        setError(`Failed to load datasets: ${err.message}`);
      });

    // Load defined indicators
    fetch('/api/indicators')
      .then((res) => res.json())
      .then((data) => {
        if (data.indicators) {
          const outputColumns = data.indicators.map((ind: any) => ind.outputColumn);
          setDefinedIndicators(outputColumns);

          // Track which indicators are groups
          const groups = new Set<string>();
          data.indicators.forEach((ind: any) => {
            if (ind.isGroup && ind.groupName) {
              groups.add(ind.groupName);
            }
          });
          setIndicatorGroups(groups);
        }
      })
      .catch((err) => {
        console.error('Failed to load indicators:', err);
      });

    // Load strategies
    fetch('/api/strategies')
      .then((res) => res.json())
      .then((data) => {
        if (data.strategies) {
          setStrategies(data.strategies);
        }
      })
      .catch((err) => {
        console.error('Failed to load strategies:', err);
      });
  }, []);

  // Load dataset data when selection changes
  useEffect(() => {
    if (!selectedDataset) return;

    const loadDatasetData = async () => {
      setLoading(true);
      setError(null);
      setIsOutdated(false);
      setLastDataDate(null);

      try {
        const res = await fetch(`/api/dataset/${encodeURIComponent(selectedDataset)}`);
        const data = await res.json();

        if (data.error) {
          setError(data.message || 'Failed to load dataset');
          setDatasetData(null);
          return;
        }

        setDatasetData(data);

        // Check which currently enabled indicators are missing in the new dataset
        const availableIndicators = new Set(data.meta.indicators || []);
        const missingIndicators1 = Array.from(enabledIndicators1).filter(ind => !availableIndicators.has(ind));
        const missingIndicators2 = Array.from(enabledIndicators2).filter(ind => !availableIndicators.has(ind));
        const allMissingIndicators = [...new Set([...missingIndicators1, ...missingIndicators2])];

        // If there are missing indicators, calculate them automatically
        if (allMissingIndicators.length > 0) {
          console.log(`Auto-calculating ${allMissingIndicators.length} missing indicators for ${selectedDataset}...`);

          try {
            const indicatorsRes = await fetch('/api/indicators');
            const indicatorsData = await indicatorsRes.json();
            const allIndicators = indicatorsData.indicators || [];

            // Find the indicator definitions for missing indicators
            const indicatorsToApply = allIndicators.filter((ind: any) =>
              allMissingIndicators.includes(ind.outputColumn)
            );

            if (indicatorsToApply.length > 0) {
              // Apply each missing indicator
              for (const indicator of indicatorsToApply) {
                await fetch('/api/apply-indicator', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    indicatorId: indicator.id,
                    datasetNames: [selectedDataset],
                  }),
                });
                console.log(`Applied ${indicator.name} to ${selectedDataset}`);
              }

              // Reload the dataset to get the newly calculated indicators
              const reloadRes = await fetch(`/api/dataset/${encodeURIComponent(selectedDataset)}`);
              const reloadData = await reloadRes.json();
              if (!reloadData.error) {
                setDatasetData(reloadData);
              }
            }
          } catch (err) {
            console.error('Failed to auto-calculate missing indicators:', err);
            // Continue anyway - don't block loading
          }
        }

        // Keep existing enabled indicators if they exist in new dataset
        // No default indicators - user must manually enable them

        // Check if data is outdated by fetching latest 10 days from API
        if (data.candles && data.candles.length > 0) {
          const lastCandle = data.candles[data.candles.length - 1];
          const lastLocalDate = new Date(lastCandle.time * 1000);

          // Fetch last 10 days of data from API to check for updates
          const today = new Date();
          const tenDaysAgo = new Date(today);
          tenDaysAgo.setDate(today.getDate() - 10);

          const formatDate = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}${month}${day}`;
          };

          // Check for newer data from API
          fetch(`${API_CONFIG.AKTOOLS_URL}/api/public/stock_zh_a_hist?symbol=${selectedDataset}&start_date=${formatDate(tenDaysAgo)}&end_date=${formatDate(today)}&adjust=qfq`)
            .then(res => res.json())
            .then(apiData => {
              if (apiData && apiData.data && apiData.data.length > 0) {
                // Get the latest date from API data
                const latestApiData = apiData.data[apiData.data.length - 1];
                const latestApiDate = new Date(latestApiData.日期);

                // Compare with local data
                if (latestApiDate > lastLocalDate) {
                  setIsOutdated(true);
                  setLastDataDate(lastLocalDate.toISOString().split('T')[0]);
                }
              }
            })
            .catch(err => {
              // Silently fail - if we can't check, don't show warning
              console.warn('Failed to check for data updates:', err);
            });
        }
      } catch (err: any) {
        setError(`Failed to load dataset: ${err.message}`);
        setDatasetData(null);
      } finally {
        setLoading(false);
      }
    };

    loadDatasetData();
  }, [selectedDataset]);

  // Helper function to check if an indicator column should be shown
  const isDefinedIndicator = (indicatorName: string): boolean => {
    // Check if it's a base indicator
    if (BASE_INDICATORS.includes(indicatorName)) {
      return true;
    }

    // Check if it's a single indicator
    if (definedIndicators.includes(indicatorName)) {
      return true;
    }

    // Check if it's a group indicator column (groupName:indicatorName)
    if (indicatorName.includes(':')) {
      const groupName = indicatorName.split(':')[0];
      if (indicatorGroups.has(groupName)) {
        return true;
      }
    }

    return false;
  };

  const handleToggleIndicator1 = (indicator: string) => {
    setEnabledIndicators1((prev) => {
      const next = new Set(prev);
      if (next.has(indicator)) {
        next.delete(indicator);
      } else {
        next.add(indicator);
      }
      return next;
    });
  };

  const handleToggleIndicator2 = (indicator: string) => {
    setEnabledIndicators2((prev) => {
      const next = new Set(prev);
      if (next.has(indicator)) {
        next.delete(indicator);
      } else {
        next.add(indicator);
      }
      return next;
    });
  };

  const refreshDatasets = async () => {
    try {
      const res = await fetch('/api/datasets');
      const data = await res.json();
      if (!data.error) {
        setDatasets(data);
      }
    } catch (err) {
      console.error('Failed to refresh datasets:', err);
    }
  };

  const handleAddDatasetSuccess = async (datasetName: string) => {
    setIsAddDatasetModalOpen(false);
    await refreshDatasets();
    setSelectedDataset(datasetName);
  };

  const handleUpdateData = async () => {
    if (!selectedDataset) return;

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/add-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedDataset }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.message || 'Failed to update stock data');
        return;
      }

      // Refresh the dataset
      await refreshDatasets();

      // Reload the current dataset to show updated data
      await reloadCurrentDataset();
    } catch (err: any) {
      setError(`Failed to update stock data: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const reloadCurrentDataset = async () => {
    if (!selectedDataset) return;

    try {
      const res = await fetch(`/api/dataset/${encodeURIComponent(selectedDataset)}`);
      const updatedData = await res.json();

      if (!updatedData.error) {
        setDatasetData(updatedData);
        setIsOutdated(false);
        setLastDataDate(null);
      }

      // Also reload defined indicators list
      const indicatorsRes = await fetch('/api/indicators');
      const indicatorsData = await indicatorsRes.json();
      if (indicatorsData.indicators) {
        const outputColumns = indicatorsData.indicators.map((ind: any) => ind.outputColumn);
        setDefinedIndicators(outputColumns);

        // Track which indicators are groups
        const groups = new Set<string>();
        indicatorsData.indicators.forEach((ind: any) => {
          if (ind.isGroup && ind.groupName) {
            groups.add(ind.groupName);
          }
        });
        setIndicatorGroups(groups);
      }
    } catch (err: any) {
      console.error('Failed to reload dataset:', err);
    }
  };

  return (
    <div className="stock-dashboard p-4">
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="dataset-select" className="text-sm font-medium whitespace-nowrap">
          Select Dataset:
        </label>
        <select
          id="dataset-select"
          value={selectedDataset}
          onChange={(e) => setSelectedDataset(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded"
          disabled={loading || datasets.length === 0}
        >
          {datasets.length === 0 ? (
            <option value="">No datasets available</option>
          ) : (() => {
            // Group datasets by data source
            const grouped = datasets.reduce((acc, ds) => {
              const source = ds.dataSource || 'stock_zh_a_hist';
              if (!acc[source]) acc[source] = [];
              acc[source].push(ds);
              return acc;
            }, {} as Record<string, typeof datasets>);

            // Sort data sources
            const sources = Object.keys(grouped).sort();
            
            const options: JSX.Element[] = [];
            sources.forEach(source => {
              const sourceDatasets = grouped[source].sort((a, b) => a.name.localeCompare(b.name));
              options.push(
                <optgroup key={source} label={source}>
                  {sourceDatasets.map((ds) => (
                    <option key={ds.name} value={ds.name}>
                      {ds.name} ({ds.rowCount} rows)
                    </option>
                  ))}
                </optgroup>
              );
            });
            return options;
          })()}
        </select>
        <button
          onClick={() => setIsAddDatasetModalOpen(true)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 whitespace-nowrap"
        >
          + Add Dataset
        </button>
        <button
          onClick={() => setIsIndicatorManagerOpen(true)}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 whitespace-nowrap"
        >
          Manage Indicators
        </button>
        <button
          onClick={() => setIsStrategyManagerOpen(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 whitespace-nowrap"
        >
          Manage Strategies
        </button>
        <button
          onClick={() => setIsRunBacktestOpen(true)}
          className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 whitespace-nowrap"
          disabled={!selectedDataset || strategies.length === 0}
        >
          Run Backtest
        </button>
      </div>

      {loading && (
        <div className="mb-4 text-gray-600">Loading dataset...</div>
      )}

      {isOutdated && lastDataDate && (
        <div className="mb-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded flex items-center justify-between">
          <span className="text-sm">
            ⚠️ Data is outdated. Last update: {lastDataDate}
          </span>
          <button
            onClick={handleUpdateData}
            disabled={isUpdating}
            className="px-4 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isUpdating ? 'Updating...' : 'Update Now'}
          </button>
        </div>
      )}

      {datasetData && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1 flex flex-col space-y-4 min-h-0">
            <IndicatorSelector
              indicators={datasetData.meta.indicators.filter((ind: string) =>
                isDefinedIndicator(ind)
              )}
              enabledIndicators={enabledIndicators1}
              onToggle={handleToggleIndicator1}
              title="Indicator Chart 1"
              defaultCollapsed={true}
              colorMap={indicatorColorMap}
            />
            <IndicatorSelector
              indicators={datasetData.meta.indicators.filter((ind: string) =>
                isDefinedIndicator(ind)
              )}
              enabledIndicators={enabledIndicators2}
              onToggle={handleToggleIndicator2}
              title="Indicator Chart 2"
              defaultCollapsed={true}
              colorMap={indicatorColorMap}
            />
            <div className="flex-1 min-h-0">
              <DataPanel
                candles={datasetData.candles}
                indicators={datasetData.indicators}
                crosshairTime={crosshairTime}
                colorMap={indicatorColorMap}
                enabledIndicators1={enabledIndicators1}
                enabledIndicators2={enabledIndicators2}
                baseIndicators={BASE_INDICATORS}
                definedIndicators={definedIndicators}
                indicatorGroups={indicatorGroups}
              />
            </div>
          </div>
          <div className="lg:col-span-3">
            <ChartPanel
              candles={datasetData.candles}
              indicators={datasetData.indicators}
              enabledIndicators1={enabledIndicators1}
              enabledIndicators2={enabledIndicators2}
              colorMap={indicatorColorMap}
              onCrosshairMove={setCrosshairTime}
            />
          </div>
        </div>
      )}

      <AddDatasetModal
        isOpen={isAddDatasetModalOpen}
        onClose={() => setIsAddDatasetModalOpen(false)}
        onSuccess={handleAddDatasetSuccess}
      />

      <IndicatorManager
        isOpen={isIndicatorManagerOpen}
        onClose={() => setIsIndicatorManagerOpen(false)}
        onRefreshDataset={reloadCurrentDataset}
      />

      <StrategyManager
        isOpen={isStrategyManagerOpen}
        onClose={() => {
          setIsStrategyManagerOpen(false);
          // Reload strategies
          fetch('/api/strategies')
            .then((res) => res.json())
            .then((data) => {
              if (data.strategies) {
                setStrategies(data.strategies);
              }
            })
            .catch((err) => {
              console.error('Failed to reload strategies:', err);
            });
        }}
      />

      <RunBacktestModal
        isOpen={isRunBacktestOpen}
        onClose={() => setIsRunBacktestOpen(false)}
        onRun={async (strategyId, datasetName, initialCash, commission, parameters) => {
          setIsBacktestLoading(true);
          setIsRunBacktestOpen(false);
          try {
            const response = await fetch('/api/backtest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                strategyId,
                datasetName,
                initialCash,
                commission,
                parameters,
              }),
            });

            const data = await response.json();
            if (data.error) {
              alert(`Backtest failed: ${data.message}`);
              return;
            }

            setBacktestResults(data.result);
            setIsBacktestPanelOpen(true);
          } catch (err) {
            alert(`Failed to run backtest: ${err instanceof Error ? err.message : 'Unknown error'}`);
          } finally {
            setIsBacktestLoading(false);
          }
        }}
        currentDataset={selectedDataset}
        strategies={strategies}
        isLoading={isBacktestLoading}
      />

      {backtestResults && datasetData && (
        <BacktestPanel
          metrics={backtestResults.metrics}
          equityCurve={backtestResults.equityCurve}
          tradeMarkers={backtestResults.tradeMarkers}
          candles={datasetData.candles}
          isOpen={isBacktestPanelOpen}
          onClose={() => setIsBacktestPanelOpen(false)}
        />
      )}
    </div>
  );
}

