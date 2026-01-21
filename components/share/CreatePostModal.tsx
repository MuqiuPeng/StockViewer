'use client';

import { useState, useEffect } from 'react';

interface Dataset {
  id: string;
  symbol: string;
  name: string;
  dataSource: string;
}

interface Indicator {
  id: string;
  name: string;
  description: string;
  category: string | null;
  isOwner: boolean;
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  strategyType: string;
  isOwner: boolean;
}

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ShareType = 'dataset' | 'indicator' | 'strategy';

export default function CreatePostModal({
  isOpen,
  onClose,
  onSuccess,
}: CreatePostModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [shareType, setShareType] = useState<ShareType>('dataset');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);

  // Fetch user's items when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen]);

  // Reset selected item when type changes
  useEffect(() => {
    setSelectedItemId('');
  }, [shareType]);

  const fetchItems = async () => {
    try {
      setLoadingItems(true);
      const response = await fetch('/api/subscription/posts/my-items');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch items');
      }

      setDatasets(data.datasets);
      setIndicators(data.indicators);
      setStrategies(data.strategies);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load items');
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!selectedItemId) {
      setError('Please select an item to share');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/subscription/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim() || null,
          type: shareType,
          itemId: selectedItemId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create post');
      }

      // Success
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setContent('');
    setShareType('dataset');
    setSelectedItemId('');
    setError(null);
    onClose();
  };

  const getCurrentItems = () => {
    switch (shareType) {
      case 'dataset':
        return datasets;
      case 'indicator':
        return indicators;
      case 'strategy':
        return strategies;
      default:
        return [];
    }
  };

  const getItemLabel = (item: Dataset | Indicator | Strategy) => {
    if ('symbol' in item) {
      return `${item.symbol} - ${item.name}`;
    }
    return item.name;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Create Share Post
        </h2>

        {/* Share Type Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            What do you want to share?
          </label>
          <div className="flex gap-2">
            {(['dataset', 'indicator', 'strategy'] as ShareType[]).map((type) => (
              <button
                key={type}
                onClick={() => setShareType(type)}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  shareType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Item Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Select {shareType}
          </label>
          {loadingItems ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
          ) : getCurrentItems().length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              No {shareType}s found in your collection
            </div>
          ) : (
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a {shareType}...</option>
              {getCurrentItems().map((item) => (
                <option key={item.id} value={item.id}>
                  {getItemLabel(item)}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give your share a title"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Content (Optional) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description (Optional)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add a description or notes about what you're sharing..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-sm">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedItemId || !title.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  );
}
