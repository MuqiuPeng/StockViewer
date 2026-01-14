'use client';

import { useState, useEffect, useRef } from 'react';
import { getDataSourceConfig } from '@/lib/data-sources';

interface Strategy {
  id: string;
  name: string;
  description: string;
  strategyType: 'single' | 'portfolio';
  parameters?: Record<string, any>;
}

interface DatasetInfo {
  name: string;
  code: string;
  filename: string;
  rowCount: number;
  firstDate?: string;
  lastDate?: string;
  dataSource?: string;
  indicators?: string[];
}

interface StockGroup {
  id: string;
  name: string;
  description?: string;
  datasetNames: string[];
}

// Helper to format dataset display as {groupname}-{symbol}-{name}
function formatDatasetDisplay(ds: DatasetInfo): string {
  const sourceConfig = getDataSourceConfig(ds.dataSource || 'stock_zh_a_hist');
  const groupName = sourceConfig?.name || ds.dataSource || '';
  return `${groupName}-${ds.code}-${ds.name}`;
}

interface RunBacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (
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
  ) => void;
  currentDataset: string;
  strategies: Strategy[];
  datasets?: DatasetInfo[];
  groups?: StockGroup[];
  isLoading?: boolean;
  initialValues?: {
    strategyId?: string;
    targetType?: 'single' | 'portfolio' | 'group';
    initialCash?: number;
    commission?: number;
    startDate?: string;
    endDate?: string;
    parameters?: Record<string, any>;
    datasetName?: string;
    symbols?: string[];
    groupId?: string;
  };
}

export default function RunBacktestModal({
  isOpen,
  onClose,
  onRun,
  currentDataset,
  strategies,
  datasets = [],
  groups = [],
  isLoading = false,
  initialValues,
}: RunBacktestModalProps) {
  const [mode, setMode] = useState<'single' | 'group' | 'portfolio'>('single');
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
  const [selectedDataset, setSelectedDataset] = useState<string>(currentDataset);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [initialCash, setInitialCash] = useState<string>('100000');
  const [commission, setCommission] = useState<string>('0.001');
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [portfolioSearch, setPortfolioSearch] = useState<string>('');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Use initial values if provided, otherwise use defaults
      if (initialValues) {
        if (initialValues.strategyId) {
          setSelectedStrategyId(initialValues.strategyId);
        }
        if (initialValues.targetType) {
          setMode(initialValues.targetType);
        }
        if (initialValues.initialCash !== undefined) {
          setInitialCash(String(initialValues.initialCash));
        }
        if (initialValues.commission !== undefined) {
          setCommission(String(initialValues.commission));
        }
        if (initialValues.startDate) {
          setStartDate(initialValues.startDate);
        }
        if (initialValues.endDate) {
          setEndDate(initialValues.endDate);
        }
        if (initialValues.datasetName) {
          setSelectedDataset(initialValues.datasetName);
        }
        if (initialValues.symbols) {
          setSelectedSymbols(initialValues.symbols);
        }
        if (initialValues.groupId) {
          setSelectedGroupId(initialValues.groupId);
        }
        if (initialValues.parameters) {
          const paramValues: Record<string, string> = {};
          Object.entries(initialValues.parameters).forEach(([key, value]) => {
            paramValues[key] = String(value || '');
          });
          setParameters(paramValues);
        }
      } else {
        // Reset to defaults when opening without initialValues
        setInitialCash('100000');
        setCommission('0.001');
        setStartDate('');
        setEndDate('');
        setMode('single');
        setSelectedDataset(currentDataset || (datasets.length > 0 ? datasets[0].name : ''));
        setSelectedGroupId(groups.length > 0 ? groups[0].id : '');
        setSelectedSymbols([]);
        if (strategies.length > 0) {
          setSelectedStrategyId(strategies[0].id);
        }
        setParameters({});
      }
    }
  }, [isOpen, currentDataset, strategies, datasets, groups, initialValues]);

  useEffect(() => {
    if (selectedStrategyId) {
      const strategy = strategies.find(s => s.id === selectedStrategyId);
      setSelectedStrategy(strategy || null);

      // Auto-set mode based on strategy type
      if (strategy?.strategyType === 'portfolio') {
        setMode('portfolio');
      } else if (mode === 'portfolio') {
        // If switching from portfolio strategy to single-stock strategy, reset to single mode
        setMode('single');
      }

      if (strategy?.parameters) {
        const paramValues: Record<string, string> = {};
        Object.keys(strategy.parameters).forEach(key => {
          paramValues[key] = String(strategy.parameters![key] || '');
        });
        setParameters(paramValues);
      } else {
        setParameters({});
      }
    }
  }, [selectedStrategyId, strategies, mode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cash = parseFloat(initialCash);
    const comm = parseFloat(commission);

    if (isNaN(cash) || cash <= 0) {
      alert('Initial cash must be a positive number');
      return;
    }

    if (isNaN(comm) || comm < 0 || comm >= 1) {
      alert('Commission must be between 0 and 1');
      return;
    }

    // Validate selection based on mode
    if (mode === 'single' && !selectedDataset) {
      alert('Please select a dataset');
      return;
    }

    if (mode === 'group' && !selectedGroupId) {
      alert('Please select a group');
      return;
    }

    if (mode === 'portfolio' && selectedSymbols.length === 0) {
      alert('Please select at least one stock for portfolio backtest');
      return;
    }

    // Convert parameters to proper types
    const typedParameters: Record<string, any> = {};
    Object.entries(parameters).forEach(([key, value]) => {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && value.trim() !== '') {
        typedParameters[key] = numValue;
      } else if (value.trim() !== '') {
        typedParameters[key] = value;
      }
    });

    // Validate date range if provided
    if (startDate && endDate && startDate > endDate) {
      alert('Start date must be before end date');
      return;
    }

    const target =
      mode === 'single'
        ? { type: 'single' as const, datasetName: selectedDataset }
        : mode === 'group'
        ? { type: 'group' as const, groupId: selectedGroupId }
        : { type: 'portfolio' as const, symbols: selectedSymbols };

    onRun(
      selectedStrategyId,
      target,
      cash,
      comm,
      typedParameters,
      startDate || undefined,
      endDate || undefined
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-7xl max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold dark:text-white">Run Backtest</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-white">Strategy</label>
            <select
              value={selectedStrategyId}
              onChange={(e) => setSelectedStrategyId(e.target.value)}
              className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
              required
            >
              <option value="">Select a strategy</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name} ({strategy.strategyType === 'portfolio' ? 'Portfolio' : 'Single Stock'})
                </option>
              ))}
            </select>
            {selectedStrategy && (
              <>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{selectedStrategy.description}</p>
                <p className="text-xs font-medium mt-1">
                  {selectedStrategy.strategyType === 'portfolio' ? (
                    <span className="text-purple-600 dark:text-purple-400">Portfolio Strategy - Requires multiple stocks with shared capital</span>
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400">Single Stock Strategy</span>
                  )}
                </p>
              </>
            )}
          </div>

          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-white">Backtest Target</label>
            <div className="flex gap-4 mb-3">
              <label className={`flex items-center dark:text-gray-200 ${selectedStrategy?.strategyType === 'portfolio' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="radio"
                  value="single"
                  checked={mode === 'single'}
                  onChange={(e) => setMode(e.target.value as 'single' | 'group' | 'portfolio')}
                  className="mr-2"
                  disabled={selectedStrategy?.strategyType === 'portfolio'}
                />
                <span>Single Stock</span>
              </label>
              <label className={`flex items-center dark:text-gray-200 ${selectedStrategy?.strategyType === 'portfolio' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="radio"
                  value="group"
                  checked={mode === 'group'}
                  onChange={(e) => setMode(e.target.value as 'single' | 'group' | 'portfolio')}
                  className="mr-2"
                  disabled={selectedStrategy?.strategyType === 'portfolio'}
                />
                <span>Stock Group</span>
              </label>
              <label className={`flex items-center dark:text-gray-200 ${selectedStrategy?.strategyType === 'single' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="radio"
                  value="portfolio"
                  checked={mode === 'portfolio'}
                  onChange={(e) => setMode(e.target.value as 'single' | 'group' | 'portfolio')}
                  className="mr-2"
                  disabled={selectedStrategy?.strategyType === 'single'}
                />
                <span>Portfolio (Multi-Stock)</span>
              </label>
            </div>
            {selectedStrategy?.strategyType === 'portfolio' && (
              <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
                Portfolio strategies require multiple stocks with shared capital
              </p>
            )}
          </div>

          {/* Single Stock Selection */}
          {mode === 'single' && (
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-white">Dataset</label>
              {datasets.length > 0 ? (
                <select
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                  required
                >
                  {datasets.map((ds) => (
                    <option key={ds.name} value={ds.filename || ds.name}>
                      {formatDatasetDisplay(ds)} ({ds.rowCount.toLocaleString()} rows)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                  required
                  placeholder="Dataset name (e.g., 000001.csv)"
                />
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Select a dataset to test against</p>
            </div>
          )}

          {/* Group Selection */}
          {mode === 'group' && (
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-white">Stock Group</label>
              {groups.length > 0 ? (
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                  required
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group.datasetNames.length} stocks)
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-2 px-3 border dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700">
                  No groups available. Create a group first to backtest multiple stocks.
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Run backtest on all stocks in the group (separate capital per stock)
              </p>
            </div>
          )}

          {/* Portfolio Multi-Stock Selection */}
          {mode === 'portfolio' && (
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-white">Select Stocks for Portfolio</label>

              {/* Quick Group Selection */}
              {groups.length > 0 && (
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded">
                  <label className="block text-xs font-medium text-blue-900 dark:text-blue-300 mb-2">Quick Select from Group:</label>
                  <div className="flex gap-2 flex-wrap">
                    {groups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          const groupStocks = group.datasetNames.map(name => {
                            const ds = datasets.find(d => d.name === name || d.filename === name);
                            return ds?.filename || name;
                          });
                          setSelectedSymbols(groupStocks);
                        }}
                        className="text-xs px-3 py-1.5 bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-600 rounded hover:bg-blue-100 dark:hover:bg-gray-600 transition-colors dark:text-white"
                      >
                        📁 {group.name} ({group.datasetNames.length})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Input */}
              <div className="mb-3">
                <input
                  type="text"
                  value={portfolioSearch}
                  onChange={(e) => setPortfolioSearch(e.target.value)}
                  placeholder="Search by code or name..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {datasets.length > 0 ? (
                <div className="border dark:border-gray-600 rounded bg-white dark:bg-gray-800 overflow-hidden">
                  {/* Table Header */}
                  <div className="bg-gray-100 dark:bg-gray-700 border-b dark:border-gray-600 px-3 py-2 grid grid-cols-12 gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                    <div className="col-span-1"></div>
                    <div className="col-span-5">Dataset</div>
                    <div className="col-span-1 text-right">Rows</div>
                    <div className="col-span-2">Date Range</div>
                    <div className="col-span-3">Indicators</div>
                  </div>

                  {/* Stock List */}
                  <div className="max-h-96 overflow-y-auto">
                    {datasets.filter(ds => {
                      if (!portfolioSearch) return true;
                      const search = portfolioSearch.toLowerCase();
                      const displayName = formatDatasetDisplay(ds).toLowerCase();
                      return displayName.includes(search) || ds.code?.toLowerCase().includes(search);
                    }).map((ds) => {
                      const isChecked = selectedSymbols.includes(ds.filename || ds.name);
                      return (
                        <label
                          key={ds.name}
                          className={`grid grid-cols-12 gap-2 items-center px-3 py-2.5 cursor-pointer border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors ${
                            isChecked ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                          }`}
                        >
                          <div className="col-span-1 flex items-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const symbol = ds.filename || ds.name;
                                if (e.target.checked) {
                                  setSelectedSymbols([...selectedSymbols, symbol]);
                                } else {
                                  setSelectedSymbols(selectedSymbols.filter(s => s !== symbol));
                                }
                              }}
                              className="w-4 h-4"
                            />
                          </div>
                          <div className="col-span-5 font-medium text-gray-900 dark:text-white truncate" title={formatDatasetDisplay(ds)}>
                            {formatDatasetDisplay(ds)}
                          </div>
                          <div className="col-span-1 text-right text-sm font-mono text-gray-700 dark:text-gray-300">
                            {ds.rowCount?.toLocaleString() || 0}
                          </div>
                          <div className="col-span-2 text-xs font-mono text-gray-600 dark:text-gray-400">
                            {ds.firstDate && ds.lastDate ? (
                              <span>
                                {new Date(ds.firstDate).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit' })} ~ {new Date(ds.lastDate).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </div>
                          <div className="col-span-3 text-xs text-gray-600 dark:text-gray-400 truncate">
                            {ds.indicators && ds.indicators.length > 0 ? (
                              <span>
                                {ds.indicators.slice(0, 3).join(', ')}
                                {ds.indicators.length > 3 ? ` +${ds.indicators.length - 3}` : ''}
                              </span>
                            ) : (
                              <span className="text-gray-400">No indicators</span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-2 px-3 border dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700">
                  No datasets available. Add stocks first.
                </div>
              )}
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 font-medium">
                Selected: {selectedSymbols.length} stock{selectedSymbols.length !== 1 ? 's' : ''} | Shared capital across all positions
              </p>
              {selectedSymbols.length > 0 && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSymbols(datasets.map(ds => ds.filename || ds.name))}
                    className="text-xs px-2 py-1 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSymbols([])}
                    className="text-xs px-2 py-1 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-white">Start Date (Optional)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty for earliest</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-white">End Date (Optional)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty for latest</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-white">Initial Cash</label>
              <input
                type="number"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                min="0"
                step="1000"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-white">Commission</label>
              <input
                type="number"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                min="0"
                max="1"
                step="0.0001"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">e.g., 0.001 = 0.1%</p>
            </div>
          </div>

          {selectedStrategy && Object.keys(parameters).length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-white">Strategy Parameters</label>
              <div className="space-y-2 border dark:border-gray-600 rounded p-3 bg-gray-50 dark:bg-gray-700">
                {Object.keys(parameters).map((key) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{key}</label>
                    <input
                      type="text"
                      value={parameters[key]}
                      onChange={(e) => setParameters({ ...parameters, [key]: e.target.value })}
                      className="w-full px-2 py-1 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 dark:text-white"
                      placeholder={String(selectedStrategy.parameters?.[key] || '')}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

        </form>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t dark:border-gray-600">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={isLoading || !selectedStrategyId}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </div>
    </div>
  );
}

