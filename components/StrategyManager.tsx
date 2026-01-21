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
  const [viewingStrategy, setViewingStrategy] = useState<Strategy | null>(null);

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
    // Find strategy to check ownership
    const strategy = strategies.find(s => s.id === id);
    const isOwner = strategy?.isOwner ?? true;

    const confirmMessage = isOwner
      ? `Are you sure you want to delete "${name}"?`
      : `Are you sure you want to unsubscribe from "${name}"?\n\nThis will remove it from your collection but the strategy will still exist.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await fetch(`/api/strategies/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || (isOwner ? 'Failed to delete strategy' : 'Failed to unsubscribe'));
      }

      await loadStrategies();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  const handleEdit = (strategy: Strategy) => {
    setEditingStrategy(strategy);
    setViewingStrategy(null);
    setIsEditorOpen(true);
  };

  const handleView = (strategy: Strategy) => {
    setViewingStrategy(strategy);
    setEditingStrategy(null);
    setIsEditorOpen(true);
  };

  const handleEditorClose = () => {
    setIsEditorOpen(false);
    setEditingStrategy(null);
    setViewingStrategy(null);
  };

  const handleEditorSuccess = () => {
    setIsEditorOpen(false);
    setEditingStrategy(null);
    setViewingStrategy(null);
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
                <th className="border dark:border-gray-600 p-2 text-left dark:text-white">Status</th>
                <th className="border dark:border-gray-600 p-2 text-left dark:text-white">Type</th>
                <th className="border dark:border-gray-600 p-2 text-left dark:text-white">Dependencies</th>
                <th className="border dark:border-gray-600 p-2 text-left dark:text-white">Description</th>
                <th className="border dark:border-gray-600 p-2 text-left dark:text-white">Actions</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((strategy) => (
                <tr key={strategy.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="border dark:border-gray-600 p-2 font-medium dark:text-white">{strategy.name}</td>
                  <td className="border dark:border-gray-600 p-2">
                    {strategy.isOwner ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        Owner
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Subscribed
                      </span>
                    )}
                  </td>
                  <td className="border dark:border-gray-600 p-2 dark:text-gray-200">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      strategy.strategyType === 'portfolio'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}>
                      {strategy.strategyType || 'single'}
                    </span>
                  </td>
                  <td className="border dark:border-gray-600 p-2 dark:text-gray-200">
                    {strategy.dependencies && strategy.dependencies.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {strategy.dependencies.map((dep, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-200"
                          >
                            {dep}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-sm">None</span>
                    )}
                  </td>
                  <td className="border dark:border-gray-600 p-2 dark:text-gray-200">{strategy.description}</td>
                  <td className="border dark:border-gray-600 p-2">
                    <div className="flex gap-2">
                      {strategy.isOwner ? (
                        <button
                          onClick={() => handleEdit(strategy)}
                          className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          onClick={() => handleView(strategy)}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          View
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(strategy.id, strategy.name)}
                        className={`px-3 py-1 text-white rounded text-sm ${
                          strategy.isOwner
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-orange-600 hover:bg-orange-700'
                        }`}
                      >
                        {strategy.isOwner ? 'Delete' : 'Unsubscribe'}
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
          strategy={editingStrategy || viewingStrategy}
          readOnly={!!viewingStrategy}
        />
      </div>
    </div>
  );
}

