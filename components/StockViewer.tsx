'use client';

import { useState, useEffect, useMemo } from 'react';
import ChartPanel from './ChartPanel';
import IndicatorSelector from './IndicatorSelector';
import AddStockModal from './AddStockModal';
import IndicatorManager from './IndicatorManager';
import DataPanel from './DataPanel';
import { API_CONFIG } from '@/lib/env';
import Link from 'next/link';

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
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndicatorData {
  time: number;
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

interface StockGroup {
  id: string;
  name: string;
  description?: string;
  datasetNames: string[];
  createdAt: string;
  updatedAt?: string;
}

export default function StockViewer() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [datasetData, setDatasetData] = useState<DatasetData | null>(null);
  const [enabledIndicators1, setEnabledIndicators1] = useState<Set<string>>(new Set());
  const [enabledIndicators2, setEnabledIndicators2] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [isIndicatorManagerOpen, setIsIndicatorManagerOpen] = useState(false);
  const [isOutdated, setIsOutdated] = useState(false);
  const [lastDataDate, setLastDataDate] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [definedIndicators, setDefinedIndicators] = useState<string[]>([]);
  const [indicatorGroups, setIndicatorGroups] = useState<Set<string>>(new Set());
  const [crosshairTime, setCrosshairTime] = useState<number | null>(null);
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);

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

  // Get available groups (custom groups + data sources)
  const availableGroups = useMemo(() => {
    const groupList: Array<{ id: string; name: string; type: 'group' | 'datasource' }> = [];
    
    // Add custom groups
    groups.forEach(group => {
      groupList.push({ id: group.id, name: group.name, type: 'group' });
    });
    
    // Add data sources
    const dataSources = new Set<string>();
    datasets.forEach(ds => {
      const source = ds.dataSource || 'stock_zh_a_hist';
      dataSources.add(source);
    });
    dataSources.forEach(source => {
      groupList.push({ id: `datasource_${source}`, name: source, type: 'datasource' });
    });
    
    return groupList.sort((a, b) => {
      if (a.type === 'group' && b.type === 'datasource') return -1;
      if (a.type === 'datasource' && b.type === 'group') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [groups, datasets]);

  // Filter datasets by selected group
  const filteredDatasets = useMemo(() => {
    if (!selectedGroup) return datasets;
    
    const group = availableGroups.find(g => g.id === selectedGroup);
    if (!group) return datasets;
    
    if (group.type === 'group') {
      // Custom group - get datasets from group
      const customGroup = groups.find(g => g.id === selectedGroup);
      if (!customGroup) return [];
      
      return datasets.filter(ds => {
        const datasetKey = ds.filename || ds.name;
        return customGroup.datasetNames.includes(datasetKey);
      });
    } else {
      // Data source - filter by dataSource
      const sourceName = group.name;
      return datasets.filter(ds => (ds.dataSource || 'stock_zh_a_hist') === sourceName);
    }
  }, [selectedGroup, datasets, groups, availableGroups]);

  // Set default group and dataset when groups/datasets load
  useEffect(() => {
    if (availableGroups.length > 0 && !selectedGroup) {
      setSelectedGroup(availableGroups[0].id);
    }
  }, [availableGroups, selectedGroup]);

  // Set default dataset when group changes
  useEffect(() => {
    if (filteredDatasets.length > 0) {
      // If current dataset is not in filtered list, select first one
      if (!filteredDatasets.find(ds => ds.name === selectedDataset)) {
        setSelectedDataset(filteredDatasets[0].name);
      }
    } else {
      setSelectedDataset('');
    }
  }, [filteredDatasets, selectedGroup]);

  // Navigation functions
  const handlePrevious = () => {
    const currentIndex = filteredDatasets.findIndex(ds => ds.name === selectedDataset);
    if (currentIndex > 0) {
      setSelectedDataset(filteredDatasets[currentIndex - 1].name);
    } else if (filteredDatasets.length > 0) {
      // Wrap around to last
      setSelectedDataset(filteredDatasets[filteredDatasets.length - 1].name);
    }
  };

  const handleNext = () => {
    const currentIndex = filteredDatasets.findIndex(ds => ds.name === selectedDataset);
    if (currentIndex < filteredDatasets.length - 1) {
      setSelectedDataset(filteredDatasets[currentIndex + 1].name);
    } else if (filteredDatasets.length > 0) {
      // Wrap around to first
      setSelectedDataset(filteredDatasets[0].name);
    }
  };

  const currentIndex = filteredDatasets.findIndex(ds => ds.name === selectedDataset);
  const canNavigate = filteredDatasets.length > 1;

  // Load datasets list, groups, and defined indicators on mount
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
      })
      .catch((err) => {
        setError(`Failed to load datasets: ${err.message}`);
      });

    // Load groups
    fetch('/api/groups')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error && data.groups) {
          setGroups(data.groups || []);
        }
      })
      .catch((err) => {
        // Silently fail - groups are optional
        console.error('Failed to load groups:', err);
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

        // Check if data is outdated (older than 1 day)
        if (data.candles && data.candles.length > 0) {
          const lastCandle = data.candles[data.candles.length - 1];
          const lastDate = new Date(lastCandle.time * 1000);
          const now = new Date();
          const daysDiff = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

          if (daysDiff > 1) {
            setIsOutdated(true);
            setLastDataDate(lastDate.toLocaleDateString());
          }
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

  const handleAddStockSuccess = async () => {
    // Refresh datasets list
    await refreshDatasets();
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

  const handleUpdateData = async () => {
    if (!datasetData) return;

    setIsUpdating(true);
    setError(null);

    try {
      // Extract symbol and dataSource from filename
      // Format: {symbol}_{dataSource}.csv
      const filename = datasetData.meta.filename;
      const nameParts = filename.replace(/\.csv$/i, '').split('_');
      const symbol = nameParts[0];
      const dataSource = nameParts.length > 1 ? nameParts.slice(1).join('_') : 'stock_zh_a_hist';

      const response = await fetch('/api/add-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, dataSource }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.message || 'Failed to update stock data');
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

  const handleAddToGroup = async (groupId: string) => {
    if (!datasetData) return;

    try {
      const group = groups.find(g => g.id === groupId);
      if (!group) {
        alert('Group not found');
        return;
      }

      // Check if dataset is already in the group
      if (group.datasetNames.includes(datasetData.meta.filename)) {
        alert('This dataset is already in the selected group');
        return;
      }

      // Add dataset to group
      const updatedDatasetNames = [...group.datasetNames, datasetData.meta.filename];

      const response = await fetch('/api/groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: groupId,
          name: group.name,
          description: group.description,
          datasetNames: updatedDatasetNames,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to add to group');
      }

      // Reload groups
      const groupsRes = await fetch('/api/groups');
      const groupsData = await groupsRes.json();
      if (!groupsData.error && groupsData.groups) {
        setGroups(groupsData.groups || []);
      }

      setShowAddToGroupModal(false);
      alert(`Successfully added "${datasetData.meta.name}" to group "${group.name}"`);
    } catch (err: any) {
      alert(err instanceof Error ? err.message : 'Failed to add to group');
    }
  };

  return (
    <div className="stock-dashboard p-4 h-screen flex flex-col overflow-hidden">
      {/* Navigation */}
      <div className="mb-4 flex items-center gap-2 border-b pb-4">
        <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">Home</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-600">Viewer</span>
        <div className="ml-auto flex gap-2">
          <Link
            href="/backtest"
            className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
          >
            Backtest
          </Link>
          <Link
            href="/datasets"
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Manage Datasets
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {/* Group Selection */}
        <select
          id="group-select"
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded"
          disabled={loading || availableGroups.length === 0}
        >
          {!selectedGroup && (
            <option value="">Select Group:</option>
          )}
          {availableGroups.length === 0 ? (
            <option value="">No groups available</option>
          ) : (
            availableGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.type === 'group' ? '📁 ' : ''}{group.name}
              </option>
            ))
          )}
        </select>

        {/* Dataset Selection with Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevious}
            disabled={!canNavigate || loading || !selectedDataset}
            className="px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous stock"
          >
            ←
          </button>
          <select
            id="dataset-select"
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded min-w-[200px]"
            disabled={loading || filteredDatasets.length === 0 || !selectedGroup}
          >
            {!selectedDataset && (
              <option value="">Select Dataset:</option>
            )}
            {filteredDatasets.length === 0 ? (
              <option value="">No datasets in this group</option>
            ) : (
              filteredDatasets.map((ds) => (
                <option key={ds.name} value={ds.name}>
                  {ds.name} ({ds.rowCount.toLocaleString()} rows)
                </option>
              ))
            )}
          </select>
          <button
            onClick={handleNext}
            disabled={!canNavigate || loading || !selectedDataset}
            className="px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next stock"
          >
            →
          </button>
          {canNavigate && selectedDataset && (
            <span className="text-sm text-gray-600 whitespace-nowrap">
              {currentIndex + 1} / {filteredDatasets.length}
            </span>
          )}
        </div>

        {isOutdated && lastDataDate && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded">
            <span className="text-sm whitespace-nowrap">
              ⚠️ Data is outdated. Last update: {lastDataDate}
            </span>
            <button
              onClick={handleUpdateData}
              disabled={isUpdating}
              className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
            >
              {isUpdating ? 'Updating...' : 'Update Now'}
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setIsAddStockModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 whitespace-nowrap"
          >
            + Add Stock
          </button>
          <button
            onClick={() => setIsIndicatorManagerOpen(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 whitespace-nowrap"
          >
            Manage Indicators
          </button>
          <button
            onClick={() => setShowAddToGroupModal(true)}
            disabled={!datasetData}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add to Group
          </button>
        </div>
      </div>

      {loading && (
        <div className="mb-4 text-gray-600">Loading dataset...</div>
      )}

      {datasetData && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0 overflow-hidden">
          <div className="lg:col-span-1 flex flex-col space-y-4 min-h-0 overflow-hidden">
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
            <div className="flex-1 min-h-0 overflow-hidden">
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
          <div className="lg:col-span-3 flex flex-col min-h-0 overflow-hidden">
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

      <AddStockModal
        isOpen={isAddStockModalOpen}
        onClose={() => setIsAddStockModalOpen(false)}
        onSuccess={handleAddStockSuccess}
      />

      <IndicatorManager
        isOpen={isIndicatorManagerOpen}
        onClose={() => setIsIndicatorManagerOpen(false)}
        onRefreshDataset={reloadCurrentDataset}
      />

      {/* Add to Group Modal */}
      {showAddToGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setShowAddToGroupModal(false)}
          />
          <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add to Group</h2>
            {groups.length === 0 ? (
              <div className="text-gray-600 mb-4">
                <p className="mb-2">No groups available.</p>
                <p className="text-sm text-gray-500">
                  Create a group first from the{' '}
                  <Link href="/datasets" className="text-blue-600 hover:underline">
                    Dataset Management
                  </Link>{' '}
                  page.
                </p>
              </div>
            ) : (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  Select a group to add{' '}
                  <span className="font-semibold">{datasetData?.meta.name}</span>:
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => handleAddToGroup(group.id)}
                      className="w-full text-left p-3 border border-gray-300 rounded hover:bg-gray-50 hover:border-indigo-400 transition-colors"
                    >
                      <div className="font-semibold text-gray-800">{group.name}</div>
                      {group.description && (
                        <div className="text-sm text-gray-600 mt-1">{group.description}</div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {group.datasetNames.length} dataset(s)
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddToGroupModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

