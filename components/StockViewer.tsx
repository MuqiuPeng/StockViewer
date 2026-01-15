'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import ChartPanel from './ChartPanel';
import IndicatorSelector from './IndicatorSelector';
import AddDatasetModal from './AddDatasetModal';
import IndicatorManager from './IndicatorManager';
import DataPanel from './DataPanel';
import SaveViewSettingModal from './SaveViewSettingModal';
import { API_CONFIG } from '@/lib/env';
import { getDataSourceConfig } from '@/lib/data-sources';
import Link from 'next/link';

interface ConstantLine {
  value: number;
  color: string;
  label: string;
}

interface ViewSetting {
  id: string;
  name: string;
  enabledIndicators1: string[];
  enabledIndicators2: string[];
  constantLines1: ConstantLine[];
  constantLines2: ConstantLine[];
}

interface DatasetInfo {
  id: string;
  name: string;
  code: string;
  filename: string;
  columns: string[];
  indicators: string[];
  rowCount: number;
  dataSource?: string;
}

// Helper function to format dataset display name
function formatDatasetDisplay(dataset: DatasetInfo): string {
  return `${dataset.code} - ${dataset.name}`;
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
    lastUpdate?: string;
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
  isDataSource?: boolean;
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
  const [isAddDatasetModalOpen, setIsAddDatasetModalOpen] = useState(false);
  const [isIndicatorManagerOpen, setIsIndicatorManagerOpen] = useState(false);
  const [isOutdated, setIsOutdated] = useState(false);
  const [lastDataDate, setLastDataDate] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [definedIndicators, setDefinedIndicators] = useState<string[]>([]);
  const [indicatorGroups, setIndicatorGroups] = useState<Set<string>>(new Set());
  const [crosshairTime, setCrosshairTime] = useState<string | null>(null);
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [isOutdatedModalDismissed, setIsOutdatedModalDismissed] = useState(false);
  const [keyboardNavMode, setKeyboardNavMode] = useState(false);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState<number | null>(null);
  const [preservedVisibleRange, setPreservedVisibleRange] = useState<{ width: number } | null>(null);
  const [preservedDateRange, setPreservedDateRange] = useState<{ from: string; to: string } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [keyboardZoomTrigger, setKeyboardZoomTrigger] = useState(0);
  const keyboardNavDateRef = useRef<string | null>(null); // Store target date for keyboard nav
  const [isArrowKeyNav, setIsArrowKeyNav] = useState(false); // Track if navigation is from arrow keys

  // View settings state
  const [viewSettings, setViewSettings] = useState<ViewSetting[]>([]);
  const [selectedViewSetting, setSelectedViewSetting] = useState<string>('');
  const [constantLines1, setConstantLines1] = useState<ConstantLine[]>([]);
  const [constantLines2, setConstantLines2] = useState<ConstantLine[]>([]);
  const [isSaveViewSettingModalOpen, setIsSaveViewSettingModalOpen] = useState(false);

  // Base indicators from API (not custom calculated)
  const BASE_INDICATORS = ['volume', 'turnover', 'amplitude', 'change_pct', 'change_amount', 'turnover_rate'];

  // Color palette matching ChartPanel
  const INDICATOR_COLORS = [
    '#2196F3', '#FF9800', '#4CAF50', '#9C27B0', '#F44336',
    '#00BCD4', '#FFEB3B', '#795548', '#607D8B', '#E91E63',
  ];

  // Persistent color assignments - once assigned, colors don't change
  const persistentColorMapRef = useRef<Map<string, string>>(new Map());
  const nextColorIndexRef = useRef<number>(0);

  // Calculate shared color map for all indicators across both charts
  // Colors are assigned persistently - once an indicator gets a color, it keeps it
  const indicatorColorMap = useMemo(() => {
    const allEnabled = new Set([...enabledIndicators1, ...enabledIndicators2]);
    const persistentMap = persistentColorMapRef.current;

    // Assign colors to any new indicators that don't have one yet
    for (const ind of allEnabled) {
      if (!persistentMap.has(ind)) {
        persistentMap.set(ind, INDICATOR_COLORS[nextColorIndexRef.current % INDICATOR_COLORS.length]);
        nextColorIndexRef.current++;
      }
    }

    // Return a new Map with only the currently enabled indicators
    const colorMap = new Map<string, string>();
    for (const ind of allEnabled) {
      colorMap.set(ind, persistentMap.get(ind)!);
    }
    return colorMap;
  }, [enabledIndicators1, enabledIndicators2]);

  // Get available groups (custom groups + data sources)
  const availableGroups = useMemo(() => {
    const groupList: Array<{ id: string; name: string; type: 'group' | 'datasource' }> = [];

    // Add only custom groups (not data source groups, those are added separately below)
    groups.filter(g => !g.isDataSource).forEach(group => {
      groupList.push({ id: `group_${group.id}`, name: group.name, type: 'group' });
    });

    // Add data sources with friendly names
    const dataSources = new Set<string>();
    datasets.forEach(ds => {
      const source = ds.dataSource || 'stock_zh_a_hist';
      dataSources.add(source);
    });
    dataSources.forEach(source => {
      const sourceConfig = getDataSourceConfig(source);
      const friendlyName = sourceConfig?.name || source;
      groupList.push({ id: `datasource_${source}`, name: friendlyName, type: 'datasource' });
    });

    return groupList.sort((a, b) => {
      if (a.type === 'group' && b.type === 'datasource') return -1;
      if (a.type === 'datasource' && b.type === 'group') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [groups, datasets]);

  // Filter datasets by selected group and sort by symbol
  const filteredDatasets = useMemo(() => {
    let result: DatasetInfo[];

    if (!selectedGroup) {
      result = datasets;
    } else {
      const group = availableGroups.find(g => g.id === selectedGroup);
      if (!group) {
        result = datasets;
      } else if (group.type === 'group') {
        // Custom group - get datasets from group (strip 'group_' prefix to find original group)
        const originalGroupId = selectedGroup.replace(/^group_/, '');
        const customGroup = groups.find(g => g.id === originalGroupId);
        if (!customGroup) {
          result = [];
        } else {
          result = datasets.filter(ds => {
            const datasetKey = ds.filename || ds.name;
            return customGroup.datasetNames.includes(datasetKey);
          });
        }
      } else {
        // Data source - filter by dataSource
        // Extract technical source name from group ID (format: "datasource_{source}")
        const technicalSourceName = group.id.replace('datasource_', '');
        result = datasets.filter(ds => (ds.dataSource || 'stock_zh_a_hist') === technicalSourceName);
      }
    }

    // Sort by symbol (code)
    return result.sort((a, b) => a.code.localeCompare(b.code));
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
      if (!filteredDatasets.find(ds => ds.id === selectedDataset)) {
        setSelectedDataset(filteredDatasets[0].id);
      }
    } else {
      setSelectedDataset('');
    }
  }, [filteredDatasets, selectedGroup]);

  // Navigation functions
  const handlePrevious = () => {
    const currentIndex = filteredDatasets.findIndex(ds => ds.id === selectedDataset);
    if (currentIndex > 0) {
      setSelectedDataset(filteredDatasets[currentIndex - 1].id);
    } else if (filteredDatasets.length > 0) {
      // Wrap around to last
      setSelectedDataset(filteredDatasets[filteredDatasets.length - 1].id);
    }
  };

  const handleNext = () => {
    const currentIndex = filteredDatasets.findIndex(ds => ds.id === selectedDataset);
    if (currentIndex < filteredDatasets.length - 1) {
      setSelectedDataset(filteredDatasets[currentIndex + 1].id);
    } else if (filteredDatasets.length > 0) {
      // Wrap around to first
      setSelectedDataset(filteredDatasets[0].id);
    }
  };

  const currentIndex = filteredDatasets.findIndex(ds => ds.id === selectedDataset);
  const canNavigate = filteredDatasets.length > 1;

  // Keyboard navigation mode
  useEffect(() => {
    if (!keyboardNavMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setIsArrowKeyNav(true);
          // Move to the previous candle
          setSelectedCandleIndex(prev => {
            if (prev === null) return datasetData ? datasetData.candles.length - 1 : null;
            return Math.max(0, prev - 1);
          });
          break;
        case 'ArrowRight':
          e.preventDefault();
          setIsArrowKeyNav(true);
          // Move to the next candle
          setSelectedCandleIndex(prev => {
            if (prev === null) return datasetData ? datasetData.candles.length - 1 : null;
            const maxIndex = datasetData ? datasetData.candles.length - 1 : 0;
            return Math.min(maxIndex, prev + 1);
          });
          break;
        case 'ArrowUp':
          console.log('ArrowUp pressed');
          e.preventDefault();
          // Previous dataset in group
          setSelectedDataset(prevDataset => {
            const currentIndex = filteredDatasets.findIndex(ds => ds.id === prevDataset);
            if (currentIndex > 0) {
              return filteredDatasets[currentIndex - 1].id;
            } else if (filteredDatasets.length > 0) {
              return filteredDatasets[filteredDatasets.length - 1].id;
            }
            return prevDataset;
          });
          break;
        case 'ArrowDown':
          console.log('ArrowDown pressed');
          e.preventDefault();
          // Next dataset in group
          setSelectedDataset(prevDataset => {
            const currentIndex = filteredDatasets.findIndex(ds => ds.id === prevDataset);
            if (currentIndex < filteredDatasets.length - 1) {
              return filteredDatasets[currentIndex + 1].id;
            } else if (filteredDatasets.length > 0) {
              return filteredDatasets[0].id;
            }
            return prevDataset;
          });
          break;
        case '=':
        case '+':
          console.log('Zoom in pressed');
          e.preventDefault();
          setKeyboardZoomTrigger(prev => prev + 1);
          break;
        case '-':
          console.log('Zoom out pressed');
          e.preventDefault();
          setKeyboardZoomTrigger(prev => prev - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardNavMode, filteredDatasets, datasetData]);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSettingsOpen]);

  // Backtick key to toggle keyboard nav mode (always active)
  useEffect(() => {
    const handleBacktick = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === '`') {
        e.preventDefault();
        setKeyboardNavMode(prev => {
          if (prev) {
            setSelectedCandleIndex(null);
          }
          return !prev;
        });
      }
    };

    window.addEventListener('keydown', handleBacktick);
    return () => window.removeEventListener('keydown', handleBacktick);
  }, []);

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

    // Load view settings
    fetch('/api/view-settings')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error && data.settings) {
          setViewSettings(data.settings);
        }
      })
      .catch((err) => {
        console.error('Failed to load view settings:', err);
      });
  }, []);

  // Load view setting when selection changes
  useEffect(() => {
    if (!selectedViewSetting) return;

    const setting = viewSettings.find(s => s.id === selectedViewSetting);
    if (setting) {
      setEnabledIndicators1(new Set(setting.enabledIndicators1));
      setEnabledIndicators2(new Set(setting.enabledIndicators2));
      setConstantLines1(setting.constantLines1 || []);
      setConstantLines2(setting.constantLines2 || []);
    }
  }, [selectedViewSetting, viewSettings]);

  // Save view setting handler
  const handleSaveViewSetting = async (name: string, existingId?: string) => {
    const settingData = {
      name,
      enabledIndicators1: Array.from(enabledIndicators1),
      enabledIndicators2: Array.from(enabledIndicators2),
      constantLines1,
      constantLines2,
    };

    if (existingId) {
      // Update existing
      const response = await fetch('/api/view-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existingId, ...settingData }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.message);

      // Refresh settings list
      const settingsRes = await fetch('/api/view-settings');
      const settingsData = await settingsRes.json();
      if (!settingsData.error) {
        setViewSettings(settingsData.settings);
      }
    } else {
      // Create new
      const response = await fetch('/api/view-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingData),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.message);

      // Add to list and select it
      setViewSettings(prev => [...prev, data.setting]);
      setSelectedViewSetting(data.setting.id);
    }
  };

  // Load dataset data when selection changes
  useEffect(() => {
    if (!selectedDataset) return;

    const loadDatasetData = async () => {
      setLoading(true);
      setError(null);
      setIsOutdated(false);
      setLastDataDate(null);
      setIsOutdatedModalDismissed(false); // Reset dismissed state for new dataset
      // Don't reset selectedCandleIndex - we want to preserve crosshair position

      try {
        const res = await fetch(`/api/dataset/${encodeURIComponent(selectedDataset)}`);
        const data = await res.json();

        if (data.error) {
          setError(data.message || 'Failed to load dataset');
          setDatasetData(null);
          return;
        }

        setDatasetData(data);

        // Check if data is outdated based on lastUpdate time (older than 1 day)
        if (data.meta.lastUpdate) {
          const lastUpdateDate = new Date(data.meta.lastUpdate);
          const now = new Date();
          const daysDiff = (now.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24);

          if (daysDiff > 1) {
            setIsOutdated(true);
            setLastDataDate(lastUpdateDate.toLocaleDateString());
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

  // Update keyboard nav date ref when crosshair moves in keyboard nav mode
  useEffect(() => {
    if (keyboardNavMode && crosshairTime) {
      keyboardNavDateRef.current = crosshairTime;
    }
  }, [keyboardNavMode, crosshairTime]);

  // When dataset changes in keyboard nav mode, find the same date in new dataset
  useEffect(() => {
    if (!datasetData || !keyboardNavMode) return;

    const targetDate = keyboardNavDateRef.current;

    // If we have a target date, try to find that date in the new dataset
    if (targetDate) {
      const newIndex = datasetData.candles.findIndex(c => c.time === targetDate);
      if (newIndex !== -1) {
        // Found exact date
        setSelectedCandleIndex(newIndex);
        return;
      }

      // Try to find the closest date (first date >= target)
      const closestIndex = datasetData.candles.findIndex(c => c.time >= targetDate);
      if (closestIndex !== -1) {
        setSelectedCandleIndex(closestIndex);
        return;
      }

      // Date is after all candles, go to the last one
      setSelectedCandleIndex(datasetData.candles.length - 1);
      return;
    }

    // Fallback: clamp index if no target date
    if (selectedCandleIndex !== null) {
      const maxIndex = datasetData.candles.length - 1;
      if (selectedCandleIndex > maxIndex) {
        setSelectedCandleIndex(maxIndex);
      }
    }
  }, [datasetData, keyboardNavMode]);

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

  const handleAddDatasetSuccess = async () => {
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

      const response = await fetch('/api/add-dataset', {
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

  // Enter key to trigger update when outdated notification is shown
  useEffect(() => {
    if (!isOutdated || !lastDataDate || isOutdatedModalDismissed || isUpdating) return;

    const handleEnter = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleUpdateData();
        setIsOutdatedModalDismissed(true);
      }
    };

    window.addEventListener('keydown', handleEnter);
    return () => window.removeEventListener('keydown', handleEnter);
  }, [isOutdated, lastDataDate, isOutdatedModalDismissed, isUpdating]);

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
      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {/* Group Selection */}
        <select
          id="group-select"
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white"
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
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:text-white"
            title="Previous stock"
          >
            ←
          </button>
          <select
            id="dataset-select"
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded min-w-[200px] bg-white dark:bg-gray-800 dark:text-white"
            disabled={loading || filteredDatasets.length === 0 || !selectedGroup}
          >
            {!selectedDataset && (
              <option value="">Select Dataset:</option>
            )}
            {filteredDatasets.length === 0 ? (
              <option value="">No datasets in this group</option>
            ) : (
              filteredDatasets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {formatDatasetDisplay(ds)} ({ds.rowCount.toLocaleString()} rows)
                </option>
              ))
            )}
          </select>
          <button
            onClick={handleNext}
            disabled={!canNavigate || loading || !selectedDataset}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:text-white"
            title="Next stock"
          >
            →
          </button>
          {canNavigate && selectedDataset && (
            <span className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
              {currentIndex + 1} / {filteredDatasets.length}
            </span>
          )}
        </div>

        {/* Loading/Updating indicator */}
        {(loading || isUpdating) && (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {loading ? 'Loading dataset...' : 'Updating...'}
          </span>
        )}

        {/* View Settings - right side */}
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={selectedViewSetting}
            onChange={(e) => setSelectedViewSetting(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white text-sm"
          >
            <option value="">View Setting...</option>
            {viewSettings.map((setting) => (
              <option key={setting.id} value={setting.id}>
                {setting.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setIsSaveViewSettingModalOpen(true)}
            className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm whitespace-nowrap"
            title="Save current view settings"
          >
            Save View
          </button>
        </div>

        {/* Settings Menu */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {isSettingsOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
              <div className="relative group">
                <button
                  onClick={() => {
                    const enabled = !keyboardNavMode;
                    setKeyboardNavMode(enabled);
                    if (!enabled) {
                      setSelectedCandleIndex(null);
                    }
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                    keyboardNavMode ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${keyboardNavMode ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-500'}`} />
                  Keyboard Nav
                  <span className="ml-auto text-xs text-gray-400">`</span>
                </button>
                <div className="absolute right-full top-0 mr-2 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  <div className="font-medium mb-1">Keyboard Navigation</div>
                  <div className="space-y-0.5 text-gray-300">
                    <div><span className="text-white">`</span> Toggle on/off</div>
                    <div><span className="text-white">←→</span> Move candle</div>
                    <div><span className="text-white">↑↓</span> Switch dataset</div>
                    <div><span className="text-white">-/=</span> Zoom out/in</div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAddDatasetModalOpen(true);
                  setIsSettingsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Add Dataset
              </button>
              <button
                onClick={() => {
                  setIsIndicatorManagerOpen(true);
                  setIsSettingsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                Manage Indicators
              </button>
              <button
                onClick={() => {
                  setShowAddToGroupModal(true);
                  setIsSettingsOpen(false);
                }}
                disabled={!datasetData}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                Add to Group
              </button>
            </div>
          )}
        </div>
      </div>

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
              keyboardNavMode={keyboardNavMode}
              selectedCandleIndex={selectedCandleIndex}
              onSelectedCandleIndexChange={setSelectedCandleIndex}
              onVisibleRangeChange={(width) => setPreservedVisibleRange({ width })}
              preservedVisibleRangeWidth={preservedVisibleRange?.width}
              keyboardZoomTrigger={keyboardZoomTrigger}
              preservedDateRange={preservedDateRange}
              onDateRangeChange={setPreservedDateRange}
              isArrowKeyNav={isArrowKeyNav}
              onArrowKeyNavHandled={() => setIsArrowKeyNav(false)}
              constantLines1={constantLines1}
              constantLines2={constantLines2}
              onConstantLines1Change={setConstantLines1}
              onConstantLines2Change={setConstantLines2}
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

      <SaveViewSettingModal
        isOpen={isSaveViewSettingModalOpen}
        onClose={() => setIsSaveViewSettingModalOpen(false)}
        onSave={handleSaveViewSetting}
        existingSettings={viewSettings}
      />

      {/* Add to Group Modal */}
      {showAddToGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setShowAddToGroupModal(false)}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Add to Group</h2>
            {groups.filter(g => !g.isDataSource).length === 0 ? (
              <div className="text-gray-600 dark:text-gray-300 mb-4">
                <p className="mb-2">No groups available.</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Create a group first from the{' '}
                  <Link href="/datasets" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Dataset Management
                  </Link>{' '}
                  page.
                </p>
              </div>
            ) : (
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                  Select a group to add{' '}
                  <span className="font-semibold">{datasetData?.meta.name}</span>:
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {groups.filter(g => !g.isDataSource).map((group) => (
                    <button
                      key={group.id}
                      onClick={() => handleAddToGroup(group.id)}
                      className="w-full text-left p-3 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                    >
                      <div className="font-semibold text-gray-800 dark:text-white">{group.name}</div>
                      {group.description && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{group.description}</div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outdated Data Warning Notification */}
      {isOutdated && lastDataDate && !isOutdatedModalDismissed && (
        <div className="fixed top-20 right-4 z-50 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border-l-4 border-yellow-500 animate-slide-in">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl flex-shrink-0">⚠️</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-yellow-800 dark:text-yellow-400 text-sm">Data is Outdated</h3>
                  <button
                    onClick={() => setIsOutdatedModalDismissed(true)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 ml-2"
                    title="Dismiss"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-gray-700 dark:text-gray-200 text-sm mb-1">
                  <span className="font-semibold">{datasetData?.meta.name}</span>
                </p>
                <p className="text-gray-600 dark:text-gray-400 text-xs mb-3">
                  Last update: <span className="font-medium">{lastDataDate}</span>
                </p>
                <button
                  onClick={() => {
                    handleUpdateData();
                    setIsOutdatedModalDismissed(true);
                  }}
                  disabled={isUpdating}
                  className="w-full px-3 py-2 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isUpdating ? 'Updating...' : 'Update Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

