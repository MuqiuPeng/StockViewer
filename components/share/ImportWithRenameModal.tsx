'use client';

import { useState } from 'react';

interface ImportWithRenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: 'indicator' | 'strategy';
  item: {
    id: string;
    name: string;
    description: string;
    creator?: {
      id: string;
      name: string | null;
      image: string | null;
    };
  };
  onImport: (displayName: string | null) => Promise<void>;
}

export default function ImportWithRenameModal({
  isOpen,
  onClose,
  itemType,
  item,
  onImport,
}: ImportWithRenameModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImport = async () => {
    try {
      setLoading(true);
      setError(null);
      await onImport(displayName.trim() || null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscribe failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setDisplayName('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Subscribe to {itemType === 'indicator' ? 'Indicator' : 'Strategy'}
        </h2>

        {/* Item info */}
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {item.name}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {item.description}
          </div>
          {item.creator && (
            <div className="flex items-center mt-2">
              {item.creator.image && (
                <img
                  src={item.creator.image}
                  alt=""
                  className="w-5 h-5 rounded-full mr-2"
                />
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                by {item.creator.name || 'Unknown'}
              </span>
            </div>
          )}
        </div>

        {/* Display name input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Custom Display Name (Optional)
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={item.name}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Leave empty to use the original name. This only affects how it appears to you.
          </p>
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
            onClick={handleImport}
            disabled={loading}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Subscribing...' : 'Subscribe'}
          </button>
        </div>
      </div>
    </div>
  );
}
