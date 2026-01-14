'use client';

import { useState, useEffect } from 'react';
import StrategyEditorModal from './StrategyEditorModal';
import { Strategy } from '@/lib/strategy-storage';

interface StrategyManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StrategyManager({ isOpen, onClose }: StrategyManagerProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadStrategies();
    }
  }, [isOpen]);

  const loadStrategies = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/strategies');
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to load strategies');
      } else {
        setStrategies(data.strategies || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load strategies');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/strategies/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete strategy');
      }

      await loadStrategies();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete strategy');
    }
  };

  const handleEdit = (strategy: Strategy) => {
    setEditingStrategy(strategy);
    setIsEditorOpen(true);
  };

  const handleEditorClose = () => {
    setIsEditorOpen(false);
    setEditingStrategy(null);
  };

  const handleEditorSuccess = () => {
    setIsEditorOpen(false);
    setEditingStrategy(null);
    loadStrategies();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold dark:text-white">Strategy Manager</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        <div className="mb-4">
          <button
            onClick={() => setIsEditorOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Create New Strategy
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading strategies...</div>
        ) : strategies.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No strategies yet. Create your first strategy to get started!
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="border dark:border-gray-600 p-2 text-left dark:text-white">Name</th>
                <th className="border dark:border-gray-600 p-2 text-left dark:text-white">Description</th>
                <th className="border dark:border-gray-600 p-2 text-left dark:text-white">Actions</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((strategy) => (
                <tr key={strategy.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="border dark:border-gray-600 p-2 font-medium dark:text-white">{strategy.name}</td>
                  <td className="border dark:border-gray-600 p-2 dark:text-gray-200">{strategy.description}</td>
                  <td className="border dark:border-gray-600 p-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(strategy)}
                        className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(strategy.id, strategy.name)}
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
        )}

        <StrategyEditorModal
          isOpen={isEditorOpen}
          onClose={handleEditorClose}
          onSuccess={handleEditorSuccess}
          strategy={editingStrategy}
        />
      </div>
    </div>
  );
}

