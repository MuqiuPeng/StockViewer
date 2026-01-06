'use client';

import { useState, useEffect } from 'react';
import AddStockModal from './AddStockModal';
import GroupManager from './GroupManager';
import Link from 'next/link';

interface DatasetInfo {
  name: string;
  filename: string;
  columns: string[];
  indicators: string[];
  rowCount: number;
  dataSource?: string;
  firstDate?: string;
  lastDate?: string;
  lastUpdate?: string;
}

interface StockGroup {
  id: string;
  name: string;
  description?: string;
  datasetNames: string[];
  createdAt: string;
  updatedAt?: string;
}

export default function DatasetManagement() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({});
  const [selectedDatasets, setSelectedDatasets] = useState<Set<string>>(new Set());
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [targetDatasetForGroup, setTargetDatasetForGroup] = useState<string | null>(null);

  useEffect(() => {
    loadDatasets();
    loadGroups();
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
        setDatasets(data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch('/api/datasets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: filename }),
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
      const response = await fetch('/api/add-stock', {
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

  const handleAddStockSuccess = async () => {
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
            body: JSON.stringify({ name: dataset.filename }),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to delete dataset');
          }
        } catch (err) {
          alert(`Failed to delete ${dataset.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

      const updatedDatasetNames = [...new Set([...group.datasetNames, ...datasetsToAdd])];

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

  // Group datasets: first by custom groups, then by data source
  // Datasets can appear in both custom groups AND their data source groups
  const groupedDatasets: Record<string, { type: 'group' | 'datasource'; datasets: DatasetInfo[] }> = {};
  
  // First, add datasets that belong to custom groups (datasets can appear in multiple groups)
  groups.forEach(group => {
    if (!groupedDatasets[group.name]) {
      groupedDatasets[group.name] = { type: 'group', datasets: [] };
    }
    group.datasetNames.forEach(datasetName => {
      const dataset = datasets.find(d => d.filename === datasetName || d.name === datasetName);
      if (dataset) {
        groupedDatasets[group.name].datasets.push(dataset);
      }
    });
  });

  // Then, add ALL datasets grouped by data source (datasets remain in their data source groups)
  datasets.forEach(ds => {
    const source = ds.dataSource || 'stock_zh_a_hist';
    if (!groupedDatasets[source]) {
      groupedDatasets[source] = { type: 'datasource', datasets: [] };
    }
    groupedDatasets[source].datasets.push(ds);
  });

  // Sort: custom groups first, then data sources
  const sortedGroups = Object.entries(groupedDatasets).sort(([aKey, aVal], [bKey, bVal]) => {
    if (aVal.type === 'group' && bVal.type === 'datasource') return -1;
    if (aVal.type === 'datasource' && bVal.type === 'group') return 1;
    return aKey.localeCompare(bKey);
  });

  return (
    <div className="p-4">
      {/* Navigation */}
      <div className="mb-4 flex items-center gap-2 border-b pb-4">
        <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">Home</Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-600">Datasets</span>
        <div className="ml-auto flex gap-2">
          <Link
            href="/viewer"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Viewer
          </Link>
          <Link
            href="/backtest"
            className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
          >
            Backtest
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Dataset Management</h1>
        <p className="text-gray-600">Manage your stock datasets</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="mb-4 flex gap-2 flex-wrap">
        <button
          onClick={() => setIsAddStockModalOpen(true)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          + Add New Dataset
        </button>
        <button
          onClick={() => setIsGroupManagerOpen(true)}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          📁 Manage Groups
        </button>

        {selectedDatasets.size > 0 && (
          <>
            <div className="border-l border-gray-300 mx-2"></div>
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
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-600">Loading datasets...</div>
      ) : datasets.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-4">No datasets found.</p>
          <button
            onClick={() => setIsAddStockModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Add Your First Dataset
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGroups.map(([groupKey, groupData]) => (
            <div key={groupKey} className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  {groupData.type === 'group' ? '📁 ' : ''}{groupKey} ({groupData.datasets.length} datasets)
                </h2>
                {groupData.type === 'datasource' && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Data Source
                  </span>
                )}
                {groupData.type === 'group' && (
                  <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">
                    Custom Group
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-center w-12">
                        <input
                          type="checkbox"
                          checked={groupData.datasets.every(ds => selectedDatasets.has(ds.filename))}
                          onChange={() => handleSelectAll(groupData.datasets)}
                          className="cursor-pointer"
                        />
                      </th>
                      <th className="border p-2 text-left">Name</th>
                      <th className="border p-2 text-left">Start Date</th>
                      <th className="border p-2 text-left">End Date</th>
                      <th className="border p-2 text-left">Last Update</th>
                      <th className="border p-2 text-left">Rows</th>
                      <th className="border p-2 text-left">Indicators</th>
                      <th className="border p-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupData.datasets
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((dataset) => (
                        <tr key={dataset.name} className="hover:bg-gray-50">
                          <td className="border p-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedDatasets.has(dataset.filename)}
                              onChange={() => handleSelectDataset(dataset.filename)}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="border p-2 font-medium">{dataset.name}</td>
                          <td className="border p-2 text-sm">
                            {dataset.firstDate ? dataset.firstDate.split('T')[0] : 'N/A'}
                          </td>
                          <td className="border p-2 text-sm">
                            {dataset.lastDate ? dataset.lastDate.split('T')[0] : 'N/A'}
                          </td>
                          <td className="border p-2 text-sm text-gray-600">
                            {dataset.lastUpdate
                              ? new Date(dataset.lastUpdate).toLocaleString()
                              : 'N/A'}
                          </td>
                          <td className="border p-2">{dataset.rowCount.toLocaleString()}</td>
                          <td className="border p-2">
                            <span className="text-sm text-gray-600">
                              {dataset.indicators.length} indicators
                            </span>
                          </td>
                          <td className="border p-2">
                            <div className="flex gap-1 flex-wrap">
                              <button
                                onClick={() => handleUpdate(dataset.name)}
                                disabled={isUpdating[dataset.name]}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                              >
                                {isUpdating[dataset.name] ? 'Updating...' : 'Update'}
                              </button>
                              <button
                                onClick={() => handleAddToGroup(dataset.filename)}
                                className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
                              >
                                + Group
                              </button>
                              <button
                                onClick={() => handleDelete(dataset.filename)}
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
            </div>
          ))}
        </div>
      )}

      <GroupManager
        isOpen={isGroupManagerOpen}
        onClose={handleGroupManagerClose}
        datasets={datasets.map(ds => ({ name: ds.name, filename: ds.filename }))}
      />

      <AddStockModal
        isOpen={isAddStockModalOpen}
        onClose={() => setIsAddStockModalOpen(false)}
        onSuccess={handleAddStockSuccess}
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
          <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add to Group</h2>

            {groups.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-gray-600 mb-4">No groups available. Create a group first.</p>
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
                <p className="text-sm text-gray-600 mb-3">
                  {targetDatasetForGroup === 'batch'
                    ? `Select a group to add ${selectedDatasets.size} dataset(s):`
                    : 'Select a group to add this dataset:'}
                </p>
                {groups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => handleAddToGroupConfirm(group.id)}
                    className="w-full text-left px-4 py-3 border rounded hover:bg-gray-50 transition-colors"
                  >
                    <div className="font-medium">{group.name}</div>
                    {group.description && (
                      <div className="text-sm text-gray-600">{group.description}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {group.datasetNames.length} dataset(s)
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
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

