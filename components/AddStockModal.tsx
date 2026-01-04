'use client';

import { useState } from 'react';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (datasetName: string) => void;
}

export default function AddStockModal({ isOpen, onClose, onSuccess }: AddStockModalProps) {
  const [stockSymbol, setStockSymbol] = useState('');
  const [dataSource, setDataSource] = useState('stock_zh_a_hist');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available data sources
  const dataSources = [
    { value: 'stock_zh_a_hist', label: 'stock_zh_a_hist' }
  ];

  if (!isOpen) return null;

  const validateSymbol = (symbol: string): boolean => {
    return /^\d{6}$/.test(symbol);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedSymbol = stockSymbol.trim();

    if (!validateSymbol(trimmedSymbol)) {
      setError('Stock symbol must be 6 digits');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/add-stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol: trimmedSymbol, dataSource }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to add stock');
        setIsLoading(false);
        return;
      }

      // Success
      setStockSymbol('');
      setDataSource('stock_zh_a_hist');
      setIsLoading(false);
      onSuccess(data.dataset.name);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setStockSymbol('');
      setDataSource('stock_zh_a_hist');
      setError(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Add Stock</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="data-source" className="block text-sm font-medium mb-2">
              Data Source
            </label>
            <select
              id="data-source"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              {dataSources.map((ds) => (
                <option key={ds.value} value={ds.value}>
                  {ds.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="stock-symbol" className="block text-sm font-medium mb-2">
              Stock Symbol
            </label>
            <input
              id="stock-symbol"
              type="text"
              value={stockSymbol}
              onChange={(e) => setStockSymbol(e.target.value)}
              placeholder="e.g., 000001"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
              maxLength={6}
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter 6-digit stock code. All historical data will be fetched.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !stockSymbol.trim()}
              className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isLoading ? 'Adding...' : 'Add Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
