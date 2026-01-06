'use client';

import { useState } from 'react';

interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (datasetName: string) => void;
}

interface AddResult {
  symbol: string;
  success: boolean;
  message?: string;
}

export default function AddStockModal({ isOpen, onClose, onSuccess }: AddStockModalProps) {
  const [stockSymbol, setStockSymbol] = useState('');
  const [dataSource, setDataSource] = useState('stock_zh_a_hist');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AddResult[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

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
    setResults([]);

    // Parse symbols (comma-separated)
    const symbols = stockSymbol
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (symbols.length === 0) {
      setError('Please enter at least one stock symbol');
      return;
    }

    // Validate all symbols
    const invalidSymbols = symbols.filter(s => !validateSymbol(s));
    if (invalidSymbols.length > 0) {
      setError(`Invalid symbol(s): ${invalidSymbols.join(', ')}. All symbols must be 6 digits.`);
      return;
    }

    setIsLoading(true);
    setProgress({ current: 0, total: symbols.length });

    const addResults: AddResult[] = [];

    // Add stocks sequentially
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      setProgress({ current: i, total: symbols.length });

      try {
        const response = await fetch('/api/add-stock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ symbol, dataSource }),
        });

        const data = await response.json();

        if (!response.ok) {
          addResults.push({
            symbol,
            success: false,
            message: data.message || 'Failed to add stock',
          });
        } else {
          addResults.push({
            symbol,
            success: true,
            message: 'Added successfully',
          });
          // Call onSuccess for the first successful addition
          if (i === 0 || addResults.filter(r => r.success).length === 1) {
            onSuccess(data.dataset.name);
          }
        }
      } catch (err) {
        addResults.push({
          symbol,
          success: false,
          message: err instanceof Error ? err.message : 'Network error',
        });
      }
    }

    setProgress({ current: symbols.length, total: symbols.length });
    setResults(addResults);
    setIsLoading(false);

    // Clear input if all succeeded
    if (addResults.every(r => r.success)) {
      setStockSymbol('');
      setDataSource('stock_zh_a_hist');
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setStockSymbol('');
      setDataSource('stock_zh_a_hist');
      setError(null);
      setResults([]);
      setProgress(null);
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
              Stock Symbol(s)
            </label>
            <input
              id="stock-symbol"
              type="text"
              value={stockSymbol}
              onChange={(e) => setStockSymbol(e.target.value)}
              placeholder="e.g., 000001 or 000001, 000002, 600000"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter 6-digit stock code(s). Separate multiple stocks with commas. All historical data will be fetched.
            </p>
          </div>

          {progress && (
            <div className="mb-4">
              <div className="text-sm font-medium mb-1">
                Progress: {progress.current} / {progress.total}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="mb-4 p-3 border border-gray-300 rounded">
              <div className="text-sm font-medium mb-2">
                Results: {results.filter(r => r.success).length} succeeded, {results.filter(r => !r.success).length} failed
              </div>
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-1 text-left">Symbol</th>
                      <th className="border p-1 text-left">Status</th>
                      <th className="border p-1 text-left">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, idx) => (
                      <tr key={idx}>
                        <td className="border p-1 font-mono">{result.symbol}</td>
                        <td className="border p-1">
                          {result.success ? (
                            <span className="text-green-600">✓ Success</span>
                          ) : (
                            <span className="text-red-600">✗ Failed</span>
                          )}
                        </td>
                        <td className="border p-1 text-xs">{result.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
              {isLoading ? 'Adding...' : (results.length > 0 ? 'Add More' : 'Add Stock(s)')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
