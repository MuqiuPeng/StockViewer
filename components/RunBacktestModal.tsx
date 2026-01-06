'use client';

import { useState, useEffect } from 'react';

interface Strategy {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

interface DatasetInfo {
  name: string;
  filename: string;
  rowCount: number;
}

interface StockGroup {
  id: string;
  name: string;
  description?: string;
  datasetNames: string[];
}

interface RunBacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (
    strategyId: string,
    target: { type: 'single'; datasetName: string } | { type: 'group'; groupId: string },
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
}: RunBacktestModalProps) {
  const [mode, setMode] = useState<'single' | 'group'>('single');
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
  const [selectedDataset, setSelectedDataset] = useState<string>(currentDataset);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [initialCash, setInitialCash] = useState<string>('100000');
  const [commission, setCommission] = useState<string>('0.001');
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setSelectedDataset(currentDataset || (datasets.length > 0 ? datasets[0].name : ''));
      setSelectedGroupId(groups.length > 0 ? groups[0].id : '');
      if (strategies.length > 0 && !selectedStrategyId) {
        setSelectedStrategyId(strategies[0].id);
      }
    }
  }, [isOpen, currentDataset, strategies, datasets, groups, selectedStrategyId]);

  useEffect(() => {
    if (selectedStrategyId) {
      const strategy = strategies.find(s => s.id === selectedStrategyId);
      setSelectedStrategy(strategy || null);
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
  }, [selectedStrategyId, strategies]);

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

    const target = mode === 'single'
      ? { type: 'single' as const, datasetName: selectedDataset }
      : { type: 'group' as const, groupId: selectedGroupId };

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
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Run Backtest</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Strategy</label>
            <select
              value={selectedStrategyId}
              onChange={(e) => setSelectedStrategyId(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            >
              <option value="">Select a strategy</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </select>
            {selectedStrategy && (
              <p className="text-xs text-gray-500 mt-1">{selectedStrategy.description}</p>
            )}
          </div>

          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Backtest Target</label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="single"
                  checked={mode === 'single'}
                  onChange={(e) => setMode(e.target.value as 'single' | 'group')}
                  className="mr-2"
                />
                <span>Single Stock</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="group"
                  checked={mode === 'group'}
                  onChange={(e) => setMode(e.target.value as 'single' | 'group')}
                  className="mr-2"
                />
                <span>Stock Group</span>
              </label>
            </div>
          </div>

          {/* Single Stock Selection */}
          {mode === 'single' && (
            <div>
              <label className="block text-sm font-medium mb-1">Dataset</label>
              {datasets.length > 0 ? (
                <select
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  required
                >
                  {datasets.map((ds) => (
                    <option key={ds.name} value={ds.filename || ds.name}>
                      {ds.name} ({ds.rowCount.toLocaleString()} rows)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  required
                  placeholder="Dataset name (e.g., 000001.csv)"
                />
              )}
              <p className="text-xs text-gray-500 mt-1">Select a dataset to test against</p>
            </div>
          )}

          {/* Group Selection */}
          {mode === 'group' && (
            <div>
              <label className="block text-sm font-medium mb-1">Stock Group</label>
              {groups.length > 0 ? (
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  required
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group.datasetNames.length} stocks)
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500 py-2 px-3 border rounded bg-gray-50">
                  No groups available. Create a group first to backtest multiple stocks.
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Run backtest on all stocks in the group
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date (Optional)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty for earliest</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date (Optional)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty for latest</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Initial Cash</label>
              <input
                type="number"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                min="0"
                step="1000"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Commission</label>
              <input
                type="number"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                min="0"
                max="1"
                step="0.0001"
                required
              />
              <p className="text-xs text-gray-500 mt-1">e.g., 0.001 = 0.1%</p>
            </div>
          </div>

          {selectedStrategy && Object.keys(parameters).length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Strategy Parameters</label>
              <div className="space-y-2 border rounded p-3 bg-gray-50">
                {Object.keys(parameters).map((key) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-600 mb-1">{key}</label>
                    <input
                      type="text"
                      value={parameters[key]}
                      onChange={(e) => setParameters({ ...parameters, [key]: e.target.value })}
                      className="w-full px-2 py-1 border rounded text-sm"
                      placeholder={String(selectedStrategy.parameters?.[key] || '')}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !selectedStrategyId}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Running...' : 'Run Backtest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

