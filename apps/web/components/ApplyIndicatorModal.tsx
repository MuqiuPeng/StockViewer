'use client';

import { useState, useEffect } from 'react';

interface ApplyIndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  indicatorId: string;
  onSuccess?: () => void;
}

interface DatasetInfo {
  id: string;
  name: string;
  code: string;
  filename: string;
  rowCount: number;
}

interface ApplyResult {
  success: boolean;
  rowsProcessed?: number;
  error?: string;
  errorType?: string;
  details?: {
    message?: string;
    type?: string;
    code_line?: string;
    hints?: string[];
    traceback?: string;
    warnings?: string[];
  };
}

export default function ApplyIndicatorModal({
  isOpen,
  onClose,
  indicatorId,
  onSuccess,
}: ApplyIndicatorModalProps) {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  const [applyToAll, setApplyToAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ApplyResult> | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDatasets();
      setSelectedStocks(new Set());
      setApplyToAll(false);
      setResults(null);
      setProgress(null);
      setError(null);
    }
  }, [isOpen]);

  const loadDatasets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/datasets');
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to load datasets');
      } else {
        const datasets = data.datasets || [];
        setDatasets(datasets);
        // Auto-select all stocks (use id, not filename)
        const allDatasetIds = datasets.map((ds: DatasetInfo) => ds.id);
        setApplyToAll(true);
        setSelectedStocks(new Set(allDatasetIds));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStock = (datasetId: string) => {
    const newSelected = new Set(selectedStocks);
    if (newSelected.has(datasetId)) {
      newSelected.delete(datasetId);
    } else {
      newSelected.add(datasetId);
    }
    setSelectedStocks(newSelected);
  };

  const handleApplyToAllChange = (checked: boolean) => {
    setApplyToAll(checked);
    if (checked) {
      setSelectedStocks(new Set(datasets.map(ds => ds.id)));
    } else {
      setSelectedStocks(new Set());
    }
  };

  const handleApply = async () => {
    const stocksToApply = Array.from(selectedStocks);
    if (stocksToApply.length === 0) {
      setError('Please select at least one stock');
      return;
    }

    setIsApplying(true);
    setError(null);
    setResults(null);
    setProgress({ current: 0, total: stocksToApply.length });

    try {
      const response = await fetch('/api/apply-indicator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indicatorId,
          stockIds: stocksToApply,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.message || data.error || 'Failed to apply indicator');
        setIsApplying(false);
        return;
      }

      // Transform results to use stock names for display
      const resultsMap: Record<string, ApplyResult> = {};
      for (const [stockId, result] of Object.entries(data.results || {})) {
        const dataset = datasets.find(d => d.id === stockId);
        const displayName = dataset?.name || stockId;
        resultsMap[displayName] = result as ApplyResult;
      }

      setResults(resultsMap);
      setProgress({ current: stocksToApply.length, total: stocksToApply.length });

      // Call onSuccess callback if there were successful applications
      if (onSuccess && data.results) {
        const hasSuccess = Object.values(data.results).some((r: any) => r.success);
        if (hasSuccess) {
          onSuccess();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsApplying(false);
    }
  };

  const successCount = results
    ? Object.values(results).filter(r => r.success).length
    : 0;
  const failureCount = results
    ? Object.values(results).filter(r => !r.success).length
    : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 dark:text-white">Apply Indicator to Stocks</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading stocks...</div>
        ) : (
          <>
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm font-medium dark:text-white">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => handleApplyToAllChange(e.target.checked)}
                  disabled={isApplying}
                />
                Apply to All Stocks ({datasets.length})
              </label>
            </div>

            <div className="mb-4 max-h-60 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded p-3 bg-white dark:bg-gray-800">
              <div className="text-sm font-medium mb-2 dark:text-white">Select Stocks:</div>
              {datasets.length === 0 ? (
                <div className="text-gray-500 dark:text-gray-400 text-sm">No stocks available</div>
              ) : (
                <div className="space-y-1">
                  {datasets.map((dataset) => (
                    <label
                      key={dataset.id}
                      className="flex items-center gap-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded dark:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStocks.has(dataset.id)}
                        onChange={() => handleToggleStock(dataset.id)}
                        disabled={isApplying}
                      />
                      <span>{dataset.name}</span>
                      <span className="text-gray-500 dark:text-gray-400">({dataset.rowCount} rows)</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {progress && (
              <div className="mb-4">
                <div className="text-sm font-medium mb-1 dark:text-white">
                  Progress: {progress.current} / {progress.total}
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${(progress.current / progress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {results && (
              <div className="mb-4 p-3 border border-gray-300 dark:border-gray-600 rounded">
                <div className="text-sm font-medium mb-2 dark:text-white">
                  Results: {successCount} succeeded, {failureCount} failed
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-sm dark:text-gray-200">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700">
                        <th className="border dark:border-gray-600 p-1 text-left">Stock</th>
                        <th className="border dark:border-gray-600 p-1 text-left">Status</th>
                        <th className="border dark:border-gray-600 p-1 text-left">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(results).map(([stock, result]) => (
                        <tr key={stock}>
                          <td className="border dark:border-gray-600 p-1">{stock}</td>
                          <td className="border dark:border-gray-600 p-1">
                            {result.success ? (
                              <span className="text-green-600 dark:text-green-400">✓ Success</span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400">✗ Failed</span>
                            )}
                          </td>
                          <td className="border dark:border-gray-600 p-1 text-xs">
                            {result.success ? (
                              `${result.rowsProcessed} rows`
                            ) : (
                              <div>
                                <div className="font-medium text-red-600 dark:text-red-400">{result.error}</div>
                                {result.details?.warnings && result.details.warnings.length > 0 && (
                                  <div className="mt-1 p-1 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-600 rounded">
                                    <div className="font-semibold text-yellow-800 dark:text-yellow-400 text-xs">⚠️ Warnings:</div>
                                    {result.details.warnings.map((warning: string, i: number) => (
                                      <div key={i} className="text-xs text-yellow-700 dark:text-yellow-400">• {warning}</div>
                                    ))}
                                  </div>
                                )}
                                {result.details?.hints && (
                                  <div className="mt-1 text-blue-600 dark:text-blue-400">
                                    {result.details.hints.map((hint: string, i: number) => (
                                      <div key={i}>💡 {hint}</div>
                                    ))}
                                  </div>
                                )}
                                {result.details?.code_line && (
                                  <div className="mt-1 text-gray-600 dark:text-gray-400 font-mono">
                                    Code: {result.details.code_line}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={isApplying}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                {results ? 'Close' : 'Cancel'}
              </button>
              {!results && (
                <button
                  onClick={handleApply}
                  disabled={isApplying || selectedStocks.size === 0}
                  className="px-4 py-2 text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {isApplying ? 'Applying...' : `Apply to ${selectedStocks.size} stock(s)`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
