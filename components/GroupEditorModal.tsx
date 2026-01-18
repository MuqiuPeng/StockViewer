'use client';

import { useState, useEffect } from 'react';

interface StockGroup {
  id: string;
  name: string;
  description?: string;
  stockIds: string[];
  createdAt: string;
  updatedAt?: string;
}

interface GroupEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  group?: StockGroup | null;
  datasets: Array<{ name: string; filename: string }>;
}

export default function GroupEditorModal({
  isOpen,
  onClose,
  onSuccess,
  group,
  datasets,
}: GroupEditorModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (group) {
        setName(group.name);
        setDescription(group.description || '');
        setSelectedDatasets(group.stockIds || []);
      } else {
        setName('');
        setDescription('');
        setSelectedDatasets([]);
      }
      setError(null);
    }
  }, [isOpen, group]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Group name is required');
      return;
    }

    setSaving(true);
    try {
      const url = group ? `/api/groups/${group.id}` : '/api/groups';
      const method = group ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          stockIds: selectedDatasets,
        }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.message || 'Failed to save group');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const toggleDataset = (datasetName: string) => {
    setSelectedDatasets(prev =>
      prev.includes(datasetName)
        ? prev.filter(name => name !== datasetName)
        : [...prev, datasetName]
    );
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b dark:border-gray-600 flex items-center justify-between">
            <h2 className="text-2xl font-bold dark:text-white">
              {group ? 'Edit Group' : 'Create New Group'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
                Group Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter group name"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter group description (optional)"
                rows={3}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">
                Select Datasets ({selectedDatasets.length} selected)
              </label>
              <div className="border border-gray-300 dark:border-gray-600 rounded p-3 max-h-64 overflow-y-auto bg-white dark:bg-gray-800">
                {datasets.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No datasets available</p>
                ) : (
                  <div className="space-y-2">
                    {datasets.map((dataset) => {
                      const datasetKey = dataset.filename || dataset.name;
                      const isSelected = selectedDatasets.includes(datasetKey);
                      return (
                        <label
                          key={datasetKey}
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleDataset(datasetKey)}
                            className="rounded"
                          />
                          <span className="text-sm dark:text-white">{dataset.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t dark:border-gray-600">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Saving...' : group ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

