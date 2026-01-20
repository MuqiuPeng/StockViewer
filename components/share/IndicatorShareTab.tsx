'use client';

import { useState, useEffect, useCallback } from 'react';
import ImportWithRenameModal from './ImportWithRenameModal';

interface Indicator {
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  creator: {
    id: string;
    name: string | null;
    image: string | null;
  };
  isSubscribed: boolean;
  subscriberCount: number;
  createdAt: string;
}

interface CategoryFilter {
  name: string;
  count: number;
}

export default function IndicatorShareTab() {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<CategoryFilter[]>([]);
  const [excludeSubscribed, setExcludeSubscribed] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIndicator, setSelectedIndicator] = useState<Indicator | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const fetchIndicators = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (excludeSubscribed) params.set('excludeSubscribed', 'true');
      params.set('page', page.toString());
      params.set('limit', '20');

      const response = await fetch(`/api/share/indicators?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch indicators');
      }

      setIndicators(data.indicators);
      setCategories(data.categories);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [search, category, excludeSubscribed, page]);

  useEffect(() => {
    fetchIndicators();
  }, [fetchIndicators]);

  const handleImportClick = (indicator: Indicator) => {
    setSelectedIndicator(indicator);
    setShowImportModal(true);
  };

  const handleImport = async (displayName: string | null) => {
    if (!selectedIndicator) return;

    const response = await fetch('/api/share/indicators/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        indicatorId: selectedIndicator.id,
        displayName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Import failed');
    }

    // Refresh list
    fetchIndicators();
  };

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="Search indicators..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.name} value={cat.name}>
              {cat.name} ({cat.count})
            </option>
          ))}
        </select>

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
        ) : indicators.length === 0 ? (
          <div className="col-span-full p-8 text-center text-gray-500 dark:text-gray-400">
            No indicators found
          </div>
        ) : (
          indicators.map((indicator) => (
            <div
              key={indicator.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  {indicator.name}
                </h3>
                {indicator.category && (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {indicator.category}
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
                {indicator.description}
              </p>

              {indicator.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {indicator.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                  {indicator.tags.length > 3 && (
                    <span className="text-xs text-gray-400">
                      +{indicator.tags.length - 3}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {indicator.creator.image && (
                    <img
                      src={indicator.creator.image}
                      alt=""
                      className="w-5 h-5 rounded-full mr-2"
                    />
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {indicator.creator.name || 'Unknown'}
                  </span>
                </div>

                {indicator.isSubscribed ? (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Subscribed
                  </span>
                ) : (
                  <button
                    onClick={() => handleImportClick(indicator)}
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
      {selectedIndicator && (
        <ImportWithRenameModal
          isOpen={showImportModal}
          onClose={() => {
            setShowImportModal(false);
            setSelectedIndicator(null);
          }}
          itemType="indicator"
          item={selectedIndicator}
          onImport={handleImport}
        />
      )}
    </div>
  );
}
