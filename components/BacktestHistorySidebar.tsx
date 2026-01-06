'use client';

import { useState, useEffect } from 'react';
import { BacktestHistoryEntry } from '@/lib/backtest-history-storage';

interface BacktestHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEntry: (entry: BacktestHistoryEntry) => void;
}

export default function BacktestHistorySidebar({
  isOpen,
  onClose,
  onSelectEntry,
}: BacktestHistorySidebarProps) {
  const [entries, setEntries] = useState<BacktestHistoryEntry[]>([]);
  const [filter, setFilter] = useState({ starred: false, search: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [filter.starred, isOpen]);

  async function loadHistory() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.starred) params.append('starred', 'true');

      const response = await fetch(`/api/backtest-history?${params}`);
      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      console.error('Failed to load backtest history:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleStar(id: string, starred: boolean, event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await fetch(`/api/backtest-history/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred }),
      });
      loadHistory();
    } catch (error) {
      console.error('Failed to star entry:', error);
    }
  }

  async function handleDelete(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    if (!confirm('Delete this backtest from history?')) return;

    try {
      await fetch(`/api/backtest-history/${id}`, { method: 'DELETE' });
      loadHistory();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  }

  const filteredEntries = entries.filter(
    (e) =>
      !filter.search ||
      e.strategyName.toLowerCase().includes(filter.search.toLowerCase()) ||
      e.notes?.toLowerCase().includes(filter.search.toLowerCase())
  );

  return (
    <div
      className={`fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 z-50 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Backtest History
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Search..."
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <label className="flex items-center text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={filter.starred}
              onChange={(e) => setFilter({ ...filter, starred: e.target.checked })}
              className="mr-2"
            />
            <span>Starred only</span>
          </label>
        </div>
      </div>

      {/* Entry List */}
      <div className="overflow-y-auto" style={{ height: 'calc(100% - 200px)' }}>
        {loading ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">Loading...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            No backtest history
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              onClick={() => onSelectEntry(entry)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {entry.strategyName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(entry.createdAt).toLocaleString()}
                  </div>
                  <div className="text-sm mt-1">
                    Return:{' '}
                    <span
                      className={
                        entry.summary.totalReturnPct >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      {entry.summary.totalReturnPct.toFixed(2)}%
                    </span>
                  </div>
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 ml-2">
                  <button
                    onClick={(e) => handleStar(entry.id, !entry.starred, e)}
                    className="text-yellow-500 hover:text-yellow-600"
                    title={entry.starred ? 'Unstar' : 'Star'}
                  >
                    {entry.starred ? '★' : '☆'}
                  </button>
                  <button
                    onClick={(e) => handleDelete(entry.id, e)}
                    className="text-red-500 hover:text-red-600"
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
