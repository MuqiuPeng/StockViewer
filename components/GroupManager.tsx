'use client';

import { useState, useEffect } from 'react';
import GroupEditorModal from './GroupEditorModal';

interface StockGroup {
  id: string;
  name: string;
  description?: string;
  datasetNames: string[];
  createdAt: string;
  updatedAt?: string;
  isDataSource?: boolean;
}

interface GroupManagerProps {
  isOpen: boolean;
  onClose: () => void;
  datasets: Array<{ name: string; filename: string }>;
}

export default function GroupManager({ isOpen, onClose, datasets }: GroupManagerProps) {
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StockGroup | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadGroups();
    }
  }, [isOpen]);

  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/groups');
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to load groups');
      } else {
        // Filter out data source groups - they are auto-generated
        const customGroups = (data.groups || []).filter((g: StockGroup) => !g.isDataSource);
        setGroups(customGroups);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingGroup(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (group: StockGroup) => {
    setEditingGroup(group);
    setIsEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    const group = groups.find(g => g.id === id);
    if (!group) return;

    if (!confirm(`Are you sure you want to delete group "${group.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch('/api/groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.message || 'Failed to delete group');
      }

      await loadGroups();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete group');
    }
  };

  const handleEditorClose = () => {
    setIsEditorOpen(false);
    setEditingGroup(null);
  };

  const handleEditorSuccess = async () => {
    await loadGroups();
    setIsEditorOpen(false);
    setEditingGroup(null);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b dark:border-gray-600 flex items-center justify-between">
            <h2 className="text-2xl font-bold dark:text-white">Stock Groups</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded">
                {error}
              </div>
            )}

            <div className="mb-4">
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                + Create New Group
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading groups...</div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="mb-4">No groups found.</p>
                <button
                  onClick={handleCreate}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Create Your First Group
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map((group) => (
                  <div key={group.id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{group.name}</h3>
                        {group.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{group.description}</p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          {group.datasetNames.length} dataset{group.datasetNames.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(group)}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(group.id)}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {group.datasetNames.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                        <div className="flex flex-wrap gap-2">
                          {group.datasetNames.map((datasetName) => {
                            const dataset = datasets.find(d => d.filename === datasetName || d.name === datasetName);
                            return (
                              <span
                                key={datasetName}
                                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs"
                              >
                                {dataset?.name || datasetName}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <GroupEditorModal
        isOpen={isEditorOpen}
        onClose={handleEditorClose}
        onSuccess={handleEditorSuccess}
        group={editingGroup}
        datasets={datasets}
      />
    </>
  );
}

