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

  const handleDelete = async (datasetName: string) => {
    if (!confirm(`Are you sure you want to delete "${datasetName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Extract symbol from dataset name (remove .csv and data source suffix)
      const symbol = datasetName.replace(/\.csv$/, '').split('_')[0];
      
      const response = await fetch('/api/datasets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: datasetName }),
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
    const symbol = datasetName.replace(/\.csv$/, '').split('_')[0];
    
    setIsUpdating(prev => ({ ...prev, [datasetName]: true }));
    setError(null);

    try {
      const response = await fetch('/api/add-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
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

      <div className="mb-4 flex gap-2">
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
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdate(dataset.name)}
                                disabled={isUpdating[dataset.name]}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                              >
                                {isUpdating[dataset.name] ? 'Updating...' : 'Update'}
                              </button>
                              <button
                                onClick={() => handleDelete(dataset.name)}
                                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
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
    </div>
  );
}

