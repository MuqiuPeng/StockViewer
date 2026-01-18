'use client';

import { useState, useEffect, useRef } from 'react';
import AddDatasetModal from './AddDatasetModal';
import GroupManager from './GroupManager';
import { getDataSourceConfig } from '@/lib/data-sources';

interface DatasetInfo {
  id: string;
  name: string;
  code: string;
  filename: string;
  columns: string[];
  indicators: string[];
  rowCount: number;
  dataSource?: string;
  firstDate?: string;
  lastDate?: string;
  lastUpdate?: string;
}

// Helper function to format dataset display name
function formatDatasetDisplay(dataset: DatasetInfo): string {
  const sourceConfig = getDataSourceConfig(dataset.dataSource || 'stock_zh_a_hist');
  const sourceName = sourceConfig?.name || dataset.dataSource;
  return `${dataset.code} - ${sourceName}`;
}

interface StockGroup {
  id: string;
  name: string;
  description?: string;
  stockIds: string[];
  createdAt: string;
  updatedAt?: string;
  isDataSource?: boolean;
}

export default function DatasetManagement() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddDatasetModalOpen, setIsAddDatasetModalOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({});
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set());
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [targetDatasetForGroup, setTargetDatasetForGroup] = useState<string | null>(null);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingDataset, setEditingDataset] = useState<DatasetInfo | null>(null);
  const [newName, setNewName] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [searchGroup, setSearchGroup] = useState('');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [searchName, setSearchName] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDatasets();
    loadGroups();
  }, []);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadGroups = async () => {
    try {
      const response = await fetch('/api/groups');
      const data = await response.json();
      if (!data.error) {
        setGroups(data.groups || []);
      }
    } catch (err) {
      // Silently fail - groups are optional
    }
  };

  const loadDatasets = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/datasets');
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to load datasets');
      } else {
        setDatasets(data.datasets || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (dataset: DatasetInfo) => {
    const displayName = formatDatasetDisplay(dataset);
    if (!confirm(`Are you sure you want to delete "${displayName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch('/api/datasets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: dataset.id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete dataset');
      }

      await loadDatasets();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete dataset');
    }
  };

  const handleUpdate = async (datasetName: string) => {
    // Find the dataset to get its filename
    const dataset = datasets.find(ds => ds.name === datasetName);
    if (!dataset) {
      setError('Dataset not found');
      return;
    }

    // Extract symbol and dataSource from filename
    // Format: {symbol}_{dataSource}.csv
    const nameParts = dataset.filename.replace(/\.csv$/i, '').split('_');
    const symbol = nameParts[0];
    const dataSource = nameParts.length > 1 ? nameParts.slice(1).join('_') : 'stock_zh_a_hist';

    setIsUpdating(prev => ({ ...prev, [datasetName]: true }));
    setError(null);

    try {
      const response = await fetch('/api/add-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, dataSource }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.message || 'Failed to update dataset');
      }

      await loadDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update dataset');
    } finally {
      setIsUpdating(prev => ({ ...prev, [datasetName]: false }));
    }
  };

  const handleAddDatasetSuccess = async () => {
    await loadDatasets();
  };

  const handleGroupManagerClose = async () => {
    setIsGroupManagerOpen(false);
    await loadGroups();
  };

  const handleSelectDataset = (filename: string) => {
    const newSelected = new Set(selectedDatasets);
    if (newSelected.has(filename)) {
      newSelected.delete(filename);
    } else {
      newSelected.add(filename);
    }
    setSelectedDatasets(newSelected);
  };

  const handleSelectAll = (datasets: DatasetInfo[]) => {
    if (selectedDatasets.size === datasets.length) {
      setSelectedDatasets(new Set());
    } else {
      setSelectedDatasets(new Set(datasets.map(ds => ds.filename)));
    }
  };

  const handleBatchUpdate = async () => {
    if (selectedDatasets.size === 0) {
      alert('Please select at least one dataset');
      return;
    }

    if (!confirm(`Update ${selectedDatasets.size} selected dataset(s)?`)) {
      return;
    }

    const selectedArray = Array.from(selectedDatasets);
    for (const filename of selectedArray) {
      const dataset = datasets.find(ds => ds.filename === filename);
      if (dataset) {
        await handleUpdate(dataset.name);
      }
    }
    setSelectedDatasets(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedDatasets.size === 0) {
      alert('Please select at least one dataset');
      return;
    }

    if (!confirm(`Delete ${selectedDatasets.size} selected dataset(s)? This action cannot be undone.`)) {
      return;
    }

    const selectedArray = Array.from(selectedDatasets);
    for (const filename of selectedArray) {
      const dataset = datasets.find(ds => ds.filename === filename);
      if (dataset) {
        try {
          const response = await fetch('/api/datasets', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: dataset.id }),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to delete dataset');
          }
        } catch (err) {
          const displayName = formatDatasetDisplay(dataset);
          alert(`Failed to delete ${displayName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    await loadDatasets();
    setSelectedDatasets(new Set());
  };

  const handleBatchAddToGroup = () => {
    if (selectedDatasets.size === 0) {
      alert('Please select at least one dataset');
      return;
    }
    setTargetDatasetForGroup('batch');
    setShowAddToGroupModal(true);
  };

  const handleAddToGroup = (filename: string) => {
    setTargetDatasetForGroup(filename);
    setShowAddToGroupModal(true);
  };

  const handleAddToGroupConfirm = async (groupId: string) => {
    try {
      const group = groups.find(g => g.id === groupId);
      if (!group) {
        throw new Error('Group not found');
      }

      const datasetsToAdd = targetDatasetForGroup === 'batch'
        ? Array.from(selectedDatasets)
        : [targetDatasetForGroup!];

      const updatedStockIds = [...new Set([...group.stockIds, ...datasetsToAdd])];

      const response = await fetch('/api/groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: groupId,
          name: group.name,
          description: group.description,
          stockIds: updatedStockIds,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to add to group');
      }

      await loadGroups();
      setShowAddToGroupModal(false);
      setTargetDatasetForGroup(null);
      if (targetDatasetForGroup === 'batch') {
        setSelectedDatasets(new Set());
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add to group');
    }
  };

  const handleEditName = (dataset: DatasetInfo) => {
    setEditingDataset(dataset);
    setNewName(dataset.name);
    setShowEditNameModal(true);
  };

  const handleSaveName = async () => {
    if (!editingDataset) return;

    const trimmedName = newName.trim();
    if (!trimmedName) {
      alert('Name cannot be empty');
      return;
    }

    try {
      const response = await fetch('/api/datasets/name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: editingDataset.filename,
          name: trimmedName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update name');
      }

      await loadDatasets();
      setShowEditNameModal(false);
      setEditingDataset(null);
      setNewName('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update name');
    }
  };

  const handleCancelEdit = () => {
    setShowEditNameModal(false);
    setEditingDataset(null);
    setNewName('');
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  // Helper to get display name for a group
  const getGroupDisplayName = (groupKey: string, groupType: 'group' | 'datasource'): string => {
    if (groupType === 'group') {
      return groupKey; // Custom groups use their own name
    } else {
      // Data source groups - get friendly name
      const sourceConfig = getDataSourceConfig(groupKey);
      return sourceConfig?.name || groupKey;
    }
  };

  // Search filters
  const groupFilter = searchGroup.trim().toLowerCase();
  const symbolFilter = searchSymbol.trim().toLowerCase();
  const nameFilter = searchName.trim().toLowerCase();

  // Check if dataset matches symbol and name filters
  const datasetMatchesSearch = (ds: DatasetInfo) => {
    const matchesSymbol = !symbolFilter || ds.code.toLowerCase().includes(symbolFilter);
    const matchesName = !nameFilter || ds.name.toLowerCase().includes(nameFilter);
    return matchesSymbol && matchesName;
  };

  // Check if group name matches group filter
  const groupNameMatchesSearch = (groupName: string) =>
    !groupFilter || groupName.toLowerCase().includes(groupFilter);

  // Group datasets: first by custom groups, then by data source
  // Datasets can appear in both custom groups AND their data source groups
  const groupedDatasets: Record<string, { type: 'group' | 'datasource'; datasets: DatasetInfo[] }> = {};

  // Filter out data source groups (they are auto-generated and shown separately)
  const customGroups = groups.filter(g => !g.isDataSource);

  // First, add datasets that belong to custom groups (datasets can appear in multiple groups)
  customGroups.forEach(group => {
    if (!groupNameMatchesSearch(group.name)) return;

    if (!groupedDatasets[group.name]) {
      groupedDatasets[group.name] = { type: 'group', datasets: [] };
    }
    group.stockIds.forEach(stockId => {
      const dataset = datasets.find(d => d.id === stockId || d.filename === stockId || d.name === stockId);
      if (dataset && datasetMatchesSearch(dataset)) {
        groupedDatasets[group.name].datasets.push(dataset);
      }
    });
  });

  // Then, add ALL datasets grouped by data source (datasets remain in their data source groups)
  datasets.forEach(ds => {
    const source = ds.dataSource || 'stock_zh_a_hist';
    const sourceConfig = getDataSourceConfig(source);
    const sourceName = sourceConfig?.name || source;

    if (!groupNameMatchesSearch(sourceName)) return;
    if (!datasetMatchesSearch(ds)) return;

    if (!groupedDatasets[source]) {
      groupedDatasets[source] = { type: 'datasource', datasets: [] };
    }
    groupedDatasets[source].datasets.push(ds);
  });

  // Sort datasets within each group by symbol (code)
  Object.values(groupedDatasets).forEach(groupData => {
    groupData.datasets.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  });

  // Sort: custom groups first, then data sources; filter out empty groups
  const sortedGroups = Object.entries(groupedDatasets)
    .filter(([, groupData]) => groupData.datasets.length > 0)
    .sort(([aKey, aVal], [bKey, bVal]) => {
      if (aVal.type === 'group' && bVal.type === 'datasource') return -1;
      if (aVal.type === 'datasource' && bVal.type === 'group') return 1;
      return aKey.localeCompare(bKey);
    });

  return (
    <div className="p-4 h-screen flex flex-col">
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="mb-4 flex gap-2 flex-wrap items-center">
        <input
          type="text"
          placeholder="Group..."
          value={searchGroup}
          onChange={(e) => setSearchGroup(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 bg-white dark:bg-gray-800 dark:text-white"
        />
        <input
          type="text"
          placeholder="Symbol..."
          value={searchSymbol}
          onChange={(e) => setSearchSymbol(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 bg-white dark:bg-gray-800 dark:text-white"
        />
        <input
          type="text"
          placeholder="Name..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-56 bg-white dark:bg-gray-800 dark:text-white"
        />

        {(() => {
          const hasExpandedGroup = sortedGroups.some(([key]) => !collapsedGroups.has(key));
          return (
            <button
              onClick={() => {
                if (hasExpandedGroup) {
                  setCollapsedGroups(new Set(sortedGroups.map(([key]) => key)));
                } else {
                  setCollapsedGroups(new Set());
                }
              }}
              className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title={hasExpandedGroup ? "Collapse All" : "Expand All"}
            >
              {hasExpandedGroup ? '▲ Collapse' : '▼ Expand'}
            </button>
          );
        })()}

        {selectedDatasets.size > 0 && (
          <>
            <div className="border-l border-gray-300 mx-2 h-8"></div>
            <span className="px-3 py-2 bg-blue-100 text-blue-800 rounded font-medium">
              {selectedDatasets.size} selected
            </span>
            <button
              onClick={handleBatchUpdate}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              🔄 Update Selected
            </button>
            <button
              onClick={handleBatchAddToGroup}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              📁 Add to Group
            </button>
            <button
              onClick={handleBatchDelete}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              🗑️ Delete Selected
            </button>
          </>
        )}

        {/* Settings Menu */}
        <div className="relative ml-auto" ref={settingsRef}>
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
                  setIsGroupManagerOpen(true);
                  setIsSettingsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                Manage Groups
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading datasets...</div>
        ) : datasets.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p className="mb-4">No datasets found.</p>
            <button
              onClick={() => setIsAddDatasetModalOpen(true)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add Your First Dataset
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedGroups.map(([groupKey, groupData]) => (
            <div key={groupKey} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
              <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => toggleGroupCollapse(groupKey)}
              >
                <span className={`transition-transform dark:text-gray-300 ${collapsedGroups.has(groupKey) ? '' : 'rotate-90'}`}>
                  ▶
                </span>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                  {groupData.type === 'group' ? '📁 ' : ''}{getGroupDisplayName(groupKey, groupData.type)} ({groupData.datasets.length} datasets)
                </h2>
                {groupData.type === 'datasource' && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    Data Source
                  </span>
                )}
                {groupData.type === 'group' && (
                  <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900 px-2 py-1 rounded">
                    Custom Group
                  </span>
                )}
              </div>
              {!collapsedGroups.has(groupKey) && (
              <div className="overflow-x-auto mt-4">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-center w-12 dark:text-white">
                        <input
                          type="checkbox"
                          checked={groupData.datasets.every(ds => selectedDatasets.has(ds.filename))}
                          onChange={() => handleSelectAll(groupData.datasets)}
                          className="cursor-pointer"
                        />
                      </th>
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-left dark:text-white">Code</th>
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-left dark:text-white">Name</th>
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-left dark:text-white">Data Source</th>
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-left dark:text-white">Start Date</th>
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-left dark:text-white">End Date</th>
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-left dark:text-white">Last Update</th>
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-left dark:text-white">Rows</th>
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-left dark:text-white">Indicators</th>
                      <th className="border border-gray-200 dark:border-gray-600 p-2 text-left dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupData.datasets
                      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                      .map((dataset) => (
                        <tr key={dataset.name} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="border border-gray-200 dark:border-gray-600 p-2 text-center dark:text-white">
                            <input
                              type="checkbox"
                              checked={selectedDatasets.has(dataset.filename)}
                              onChange={() => handleSelectDataset(dataset.filename)}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="border border-gray-200 dark:border-gray-600 p-2 font-mono font-medium dark:text-white">{dataset.code}</td>
                          <td className="border border-gray-200 dark:border-gray-600 p-2 dark:text-white">{dataset.name}</td>
                          <td className="border border-gray-200 dark:border-gray-600 p-2 text-sm dark:text-gray-300">{getGroupDisplayName(dataset.dataSource || 'stock_zh_a_hist', 'datasource')}</td>
                          <td className="border border-gray-200 dark:border-gray-600 p-2 text-sm dark:text-gray-300">
                            {dataset.firstDate ? dataset.firstDate.split('T')[0] : 'N/A'}
                          </td>
                          <td className="border border-gray-200 dark:border-gray-600 p-2 text-sm dark:text-gray-300">
                            {dataset.lastDate ? dataset.lastDate.split('T')[0] : 'N/A'}
                          </td>
                          <td className="border border-gray-200 dark:border-gray-600 p-2 text-sm text-gray-600 dark:text-gray-400">
                            {dataset.lastUpdate
                              ? new Date(dataset.lastUpdate).toLocaleString()
                              : 'N/A'}
                          </td>
                          <td className="border border-gray-200 dark:border-gray-600 p-2 dark:text-white">{dataset.rowCount.toLocaleString()}</td>
                          <td className="border border-gray-200 dark:border-gray-600 p-2">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {dataset.indicators.length} indicators
                            </span>
                          </td>
                          <td className="border border-gray-200 dark:border-gray-600 p-2">
                            <div className="flex gap-1 flex-wrap">
                              <button
                                onClick={() => handleUpdate(dataset.name)}
                                disabled={isUpdating[dataset.name]}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                              >
                                {isUpdating[dataset.name] ? 'Updating...' : 'Update'}
                              </button>
                              <button
                                onClick={() => handleEditName(dataset)}
                                className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                              >
                                Edit Name
                              </button>
                              <button
                                onClick={() => handleAddToGroup(dataset.filename)}
                                className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
                              >
                                + Group
                              </button>
                              <button
                                onClick={() => handleDelete(dataset)}
                                className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
            ))}
          </div>
        )}
      </div>

      <GroupManager
        isOpen={isGroupManagerOpen}
        onClose={handleGroupManagerClose}
        datasets={datasets.map(ds => ({ name: ds.name, filename: ds.filename }))}
      />

      <AddDatasetModal
        isOpen={isAddDatasetModalOpen}
        onClose={() => setIsAddDatasetModalOpen(false)}
        onSuccess={handleAddDatasetSuccess}
      />

      {/* Add to Group Modal */}
      {showAddToGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => {
              setShowAddToGroupModal(false);
              setTargetDatasetForGroup(null);
            }}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Add to Group</h2>

            {customGroups.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-gray-600 dark:text-gray-400 mb-4">No groups available. Create a group first.</p>
                <button
                  onClick={() => {
                    setShowAddToGroupModal(false);
                    setIsGroupManagerOpen(true);
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  Create Group
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {targetDatasetForGroup === 'batch'
                    ? `Select a group to add ${selectedDatasets.size} dataset(s):`
                    : 'Select a group to add this dataset:'}
                </p>
                {customGroups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => handleAddToGroupConfirm(group.id)}
                    className="w-full text-left px-4 py-3 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="font-medium dark:text-white">{group.name}</div>
                    {group.description && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">{group.description}</div>
                    )}
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {group.stockIds.length} dataset(s)
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setShowAddToGroupModal(false);
                  setTargetDatasetForGroup(null);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Name Modal */}
      {showEditNameModal && editingDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={handleCancelEdit}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Edit Dataset Name</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 dark:text-white">
                Code: <span className="font-mono">{editingDataset.code}</span>
              </label>
              <label className="block text-sm font-medium mb-2 dark:text-white">
                Custom Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveName();
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
                placeholder="Enter custom name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                autoFocus
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Leave as code or enter a custom name (e.g., "Ping An Bank")
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveName}
                className="px-4 py-2 text-white bg-purple-600 rounded hover:bg-purple-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

