'use client';

import { useState, useEffect } from 'react';
import StrategyManager from './StrategyManager';
import RunBacktestModal from './RunBacktestModal';
import BacktestResults from './BacktestResults';
import BacktestHistorySidebar from './BacktestHistorySidebar';
import BacktestHistoryDetailModal from './BacktestHistoryDetailModal';
import Link from 'next/link';
import { BacktestHistoryEntry } from '@/lib/backtest-history-storage';
import { Strategy } from '@/lib/strategy-storage';

interface DatasetInfo {
  name: string;
  code: string;
  filename: string;
  rowCount: number;
}

interface StockGroup {
  id: string;
  name: string;
  description?: string;
  datasetNames: string[];
}

export default function BacktestPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [isStrategyManagerOpen, setIsStrategyManagerOpen] = useState(false);
  const [isRunBacktestOpen, setIsRunBacktestOpen] = useState(false);
  const [isBacktestLoading, setIsBacktestLoading] = useState(false);
  const [backtestResults, setBacktestResults] = useState<any>(null);
  const [datasetData, setDatasetData] = useState<any>(null);
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<BacktestHistoryEntry | null>(null);

  useEffect(() => {
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

    // Load datasets
    fetch('/api/datasets')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setDatasets(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load datasets:', err);
      });

    // Load groups
    fetch('/api/groups')
      .then((res) => res.json())
      .then((data) => {
        if (data.groups) {
          setGroups(data.groups);
        }
      })
      .catch((err) => {
        console.error('Failed to load groups:', err);
      });
  }, []);

  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [backtestParams, setBacktestParams] = useState<{
    initialCash: number;
    commission: number;
    startDate?: string;
    endDate?: string;
    parameters: Record<string, any>;
    datasetName?: string;
    targetType?: 'single' | 'portfolio' | 'group';
    symbols?: string[];
    groupId?: string;
  } | null>(null);

  const handleViewResults = async (entry: BacktestHistoryEntry) => {
    // Close the detail modal
    setSelectedHistoryEntry(null);

    // Display the stored result directly
    setBacktestResults(entry.result);

    // Load dataset for single stock backtests (for chart display)
    if (entry.target.type === 'single' && entry.target.datasetName) {
      const datasetApiName = entry.target.datasetName.replace(/\.csv$/i, '');
      const datasetRes = await fetch(`/api/dataset/${encodeURIComponent(datasetApiName)}`);
      const datasetResult = await datasetRes.json();
      if (!datasetResult.error) {
        setDatasetData(datasetResult);
      }
    } else {
      setDatasetData(null);
    }

    // Set strategy and params for display
    const strategy = strategies.find(s => s.id === entry.strategyId);
    setSelectedStrategy(strategy || null);
    setBacktestParams({
      initialCash: entry.parameters.initialCash,
      commission: entry.parameters.commission,
      parameters: entry.parameters.strategyParameters || {},
      datasetName: entry.target.type === 'single' ? entry.target.datasetName : undefined,
    });
  };

  const handleUseAsTemplate = (entry: BacktestHistoryEntry) => {
    // Close the detail modal
    setSelectedHistoryEntry(null);

    // Find the strategy
    const strategy = strategies.find(s => s.id === entry.strategyId);
    if (!strategy) {
      alert('Strategy not found. It may have been deleted.');
      return;
    }

    // Set the strategy
    setSelectedStrategy(strategy);

    // Pre-fill the backtest parameters from history (including date range and target info)
    setBacktestParams({
      initialCash: entry.parameters.initialCash,
      commission: entry.parameters.commission,
      startDate: entry.parameters.startDate,
      endDate: entry.parameters.endDate,
      parameters: entry.parameters.strategyParameters || {},
      datasetName: entry.target.type === 'single' ? entry.target.datasetName : undefined,
      targetType: entry.target.type,
      symbols: entry.target.type === 'portfolio' ? entry.target.symbols : undefined,
      groupId: entry.target.type === 'group' ? entry.target.groupId : undefined,
    });

    // Open the Run Backtest modal with pre-filled values
    setIsRunBacktestOpen(true);
  };

  const handleRunBacktest = async (
    strategyId: string,
    target:
      | { type: 'single'; datasetName: string }
      | { type: 'group'; groupId: string }
      | { type: 'portfolio'; symbols: string[] },
    initialCash: number,
    commission: number,
    parameters: Record<string, any>,
    startDate?: string,
    endDate?: string
  ) => {
    setIsBacktestLoading(true);
    setIsRunBacktestOpen(false);

    // Find and store the selected strategy
    const strategy = strategies.find(s => s.id === strategyId);
    setSelectedStrategy(strategy || null);

    // Store backtest parameters
    setBacktestParams({
      initialCash,
      commission,
      startDate,
      endDate,
      parameters,
      datasetName: target.type === 'single' ? target.datasetName : undefined,
    });

    try {
      // Load dataset for candles (needed for BacktestPanel) - only for single stock
      if (target.type === 'single') {
        let datasetApiName = target.datasetName;
        if (!datasetApiName.toLowerCase().endsWith('.csv')) {
          datasetApiName = `${datasetApiName}.csv`;
        }
        const datasetNameForApi = datasetApiName.replace(/\.csv$/i, '');

        const datasetRes = await fetch(`/api/dataset/${encodeURIComponent(datasetNameForApi)}`);
        const datasetResult = await datasetRes.json();
        if (!datasetResult.error) {
          setDatasetData(datasetResult);
        }
      } else {
        // For group and portfolio backtests, clear dataset data
        setDatasetData(null);
      }

      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId,
          target,
          initialCash,
          commission,
          parameters,
          startDate,
          endDate,
        }),
      });

      const data = await response.json();
      if (data.error) {
        const errorMessage = data.message || data.error || 'Unknown error occurred';
        console.error('Backtest error:', data);
        alert(`Backtest failed: ${errorMessage}`);
        return;
      }

      setBacktestResults(data.result);
    } catch (err) {
      alert(`Failed to run backtest: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsBacktestLoading(false);
    }
  };

  return (
    <div className="p-4">
      {/* Navigation */}
      <div className="mb-4 flex items-center gap-2 border-b pb-4">
        <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">Home</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-600">Backtest</span>
        <div className="ml-auto flex gap-2">
          <Link
            href="/viewer"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Viewer
          </Link>
          <Link
            href="/datasets"
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Manage Datasets
          </Link>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setIsStrategyManagerOpen(true)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            Manage Strategies
          </button>
          <button
            onClick={() => {
              if (!isBacktestLoading) {
                setBacktestParams(null); // Clear previous params when opening fresh
                setIsRunBacktestOpen(true);
              }
            }}
            className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={strategies.length === 0 || datasets.length === 0 || isBacktestLoading}
          >
            {isBacktestLoading ? 'Running...' : 'Run Backtest'}
          </button>
          <button
            onClick={() => setIsHistorySidebarOpen(true)}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
          >
            History
          </button>
        </div>

        {backtestResults?.dateRange && (
          <div className="flex items-center gap-4 text-sm bg-blue-50 border border-blue-200 rounded px-4 py-2">
            <div>
              <span className="text-gray-600">Period:</span>{' '}
              <span className="font-medium">
                {backtestResults.dateRange.startDate
                  ? new Date(backtestResults.dateRange.startDate).toLocaleDateString()
                  : 'Start'} -{' '}
                {backtestResults.dateRange.endDate
                  ? new Date(backtestResults.dateRange.endDate).toLocaleDateString()
                  : 'End'}
              </span>
            </div>
            {backtestResults.dateRange.dataPoints && (
              <div>
                <span className="text-gray-600">Data Points:</span>{' '}
                <span className="font-medium">{backtestResults.dateRange.dataPoints.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </div>


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
        onClose={() => {
          setIsRunBacktestOpen(false);
          setBacktestParams(null); // Clear params when closing
        }}
        onRun={handleRunBacktest}
        currentDataset={datasets.length > 0 ? datasets[0].name : ''}
        strategies={strategies}
        datasets={datasets}
        groups={groups}
        isLoading={isBacktestLoading}
        initialValues={backtestParams ? {
          strategyId: selectedStrategy?.id,
          targetType: backtestParams.targetType,
          initialCash: backtestParams.initialCash,
          commission: backtestParams.commission,
          startDate: backtestParams.startDate,
          endDate: backtestParams.endDate,
          parameters: backtestParams.parameters,
          datasetName: backtestParams.datasetName,
          symbols: backtestParams.symbols,
          groupId: backtestParams.groupId,
        } : undefined}
      />

      {isBacktestLoading && (
        <div className="mt-8 text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
          <p className="mt-4 text-gray-600">Running backtest...</p>
        </div>
      )}

      {backtestResults && !isBacktestLoading && (
        <div className="mt-4">
          {backtestResults.type === 'portfolio' ? (
            <BacktestResults
              portfolioResult={backtestResults}
              dateRange={backtestResults.dateRange}
              strategyInfo={{
                name: selectedStrategy?.name,
                parameters: backtestParams?.parameters,
                initialCash: backtestParams?.initialCash,
                commission: backtestParams?.commission,
              }}
            />
          ) : backtestResults.type === 'group' ? (
            <BacktestResults
              groupResult={backtestResults}
              dateRange={backtestResults.dateRange}
              strategyInfo={{
                name: selectedStrategy?.name,
                parameters: backtestParams?.parameters,
                initialCash: backtestParams?.initialCash,
                commission: backtestParams?.commission,
              }}
            />
          ) : datasetData ? (
            <BacktestResults
              metrics={backtestResults.metrics}
              equityCurve={backtestResults.equityCurve}
              tradeMarkers={backtestResults.tradeMarkers}
              candles={datasetData.candles}
              dateRange={backtestResults.dateRange}
              strategyInfo={{
                name: selectedStrategy?.name,
                parameters: backtestParams?.parameters,
                initialCash: backtestParams?.initialCash,
                commission: backtestParams?.commission,
                datasetName: backtestParams?.datasetName,
              }}
            />
          ) : null}
        </div>
      )}

      {/* History Sidebar */}
      <BacktestHistorySidebar
        isOpen={isHistorySidebarOpen}
        onClose={() => setIsHistorySidebarOpen(false)}
        onSelectEntry={(entry) => {
          setSelectedHistoryEntry(entry);
          setIsHistorySidebarOpen(false);
        }}
        onViewResults={(entry) => {
          handleViewResults(entry);
          setIsHistorySidebarOpen(false);
        }}
      />

      {/* History Detail Modal */}
      <BacktestHistoryDetailModal
        entry={selectedHistoryEntry}
        onClose={() => setSelectedHistoryEntry(null)}
        onUseAsTemplate={handleUseAsTemplate}
        onViewResults={handleViewResults}
      />
    </div>
  );
}

