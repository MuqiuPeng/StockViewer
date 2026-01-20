'use client';

import { useState, useEffect, useCallback } from 'react';
import ImportWithRenameModal from './ImportWithRenameModal';

interface Strategy {
  id: string;
  name: string;
  description: string;
  creator: {
    id: string;
    name: string | null;
    image: string | null;
  };
  isSubscribed: boolean;
  subscriberCount: number;
  createdAt: string;
}

export default function StrategyShareTab() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [excludeSubscribed, setExcludeSubscribed] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const fetchStrategies = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (excludeSubscribed) params.set('excludeSubscribed', 'true');
      params.set('page', page.toString());
      params.set('limit', '20');

      const response = await fetch(`/api/share/strategies?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch strategies');
      }

      setStrategies(data.strategies);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [search, excludeSubscribed, page]);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const handleImportClick = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setShowImportModal(true);
  };

  const handleImport = async (displayName: string | null) => {
    if (!selectedStrategy) return;

    const response = await fetch('/api/share/strategies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId: selectedStrategy.id,
        displayName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Import failed');
    }

    // Refresh list
    fetchStrategies();
  };

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="Search strategies..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={excludeSubscribed}
            onChange={(e) => {
              setExcludeSubscribed(e.target.checked);
              setPage(1);
            }}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Hide already subscribed
        </label>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full p-8 text-center text-gray-500 dark:text-gray-400">
            Loading...
          </div>
        ) : error ? (
          <div className="col-span-full p-8 text-center text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : strategies.length === 0 ? (
          <div className="col-span-full p-8 text-center text-gray-500 dark:text-gray-400">
            No strategies found
          </div>
        ) : (
          strategies.map((strategy) => (
            <div
              key={strategy.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
            >
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                {strategy.name}
              </h3>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-3">
                {strategy.description}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {strategy.creator.image && (
                    <img
                      src={strategy.creator.image}
                      alt=""
                      className="w-5 h-5 rounded-full mr-2"
                    />
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {strategy.creator.name || 'Unknown'}
                  </span>
                </div>

                {strategy.isSubscribed ? (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Subscribed
                  </span>
                ) : (
                  <button
                    onClick={() => handleImportClick(strategy)}
                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Import
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Import Modal */}
      {selectedStrategy && (
        <ImportWithRenameModal
          isOpen={showImportModal}
          onClose={() => {
            setShowImportModal(false);
            setSelectedStrategy(null);
          }}
          itemType="strategy"
          item={selectedStrategy}
          onImport={handleImport}
        />
      )}
    </div>
  );
}
