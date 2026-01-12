'use client';

import { useState, useEffect } from 'react';

interface ApplyIndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  indicatorId: string;
  onSuccess?: () => void;
}

interface DatasetInfo {
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
        setDatasets(data || []);
        // Auto-select all stocks (use filename, not name)
        const allDatasetFiles = (data || []).map((ds: DatasetInfo) => ds.filename);
        setApplyToAll(true);
        setSelectedStocks(new Set(allDatasetFiles));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStock = (datasetFilename: string) => {
    const newSelected = new Set(selectedStocks);
    if (newSelected.has(datasetFilename)) {
      newSelected.delete(datasetFilename);
    } else {
      newSelected.add(datasetFilename);
    }
    setSelectedStocks(newSelected);
  };

  const handleApplyToAllChange = (checked: boolean) => {
    setApplyToAll(checked);
    if (checked) {
      setSelectedStocks(new Set(datasets.map(ds => ds.filename)));
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
      const response = await fetch('/api/apply-indicator-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indicatorId,
          datasetNames: stocksToApply,
        }),
      });

      if (!response.ok) {
        setError('Failed to apply indicator');
        setIsApplying(false);
        return;
      }

      // Read the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const resultsMap: Record<string, ApplyResult> = {};

      if (!reader) {
        setError('Failed to read response stream');
        setIsApplying(false);
        return;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'total') {
                setProgress({ current: 0, total: data.total });
              } else if (data.type === 'progress') {
                setProgress({ current: data.current, total: data.total });
              } else if (data.type === 'result') {
                resultsMap[data.filename] = data.result;
                setResults({ ...resultsMap });
                setProgress({ current: data.current || Object.keys(resultsMap).length, total: data.total || stocksToApply.length });
              } else if (data.type === 'complete') {
                setResults(data.results);
                setProgress({ current: stocksToApply.length, total: stocksToApply.length });

                // Call onSuccess callback if there were successful applications
                if (onSuccess && data.results) {
                  const hasSuccess = Object.values(data.results).some((r: any) => r.success);
                  if (hasSuccess) {
                    onSuccess();
                  }
                }
              } else if (data.type === 'error') {
                setError(data.message || data.error || 'Failed to apply indicator');
              }
            } catch (parseErr) {
              console.error('Failed to parse SSE data:', parseErr);
            }
          }
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

      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Apply Indicator to Stocks</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-gray-600">Loading stocks...</div>
        ) : (
          <>
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => handleApplyToAllChange(e.target.checked)}
                  disabled={isApplying}
                />
                Apply to All Stocks ({datasets.length})
              </label>
            </div>

            <div className="mb-4 max-h-60 overflow-y-auto border border-gray-300 rounded p-3">
              <div className="text-sm font-medium mb-2">Select Stocks:</div>
              {datasets.length === 0 ? (
                <div className="text-gray-500 text-sm">No stocks available</div>
              ) : (
                <div className="space-y-1">
                  {datasets.map((dataset) => (
                    <label
                      key={dataset.filename}
                      className="flex items-center gap-2 text-sm hover:bg-gray-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStocks.has(dataset.filename)}
                        onChange={() => handleToggleStock(dataset.filename)}
                        disabled={isApplying}
                      />
                      <span>{dataset.name}</span>
                      <span className="text-gray-500">({dataset.rowCount} rows)</span>
                    </label>
                  ))}
                </div>
              )}
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

            {results && (
              <div className="mb-4 p-3 border border-gray-300 rounded">
                <div className="text-sm font-medium mb-2">
                  Results: {successCount} succeeded, {failureCount} failed
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-1 text-left">Stock</th>
                        <th className="border p-1 text-left">Status</th>
                        <th className="border p-1 text-left">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(results).map(([stock, result]) => (
                        <tr key={stock}>
                          <td className="border p-1">{stock}</td>
                          <td className="border p-1">
                            {result.success ? (
                              <span className="text-green-600">✓ Success</span>
                            ) : (
                              <span className="text-red-600">✗ Failed</span>
                            )}
                          </td>
                          <td className="border p-1 text-xs">
                            {result.success ? (
                              `${result.rowsProcessed} rows`
                            ) : (
                              <div>
                                <div className="font-medium text-red-600">{result.error}</div>
                                {result.details?.warnings && result.details.warnings.length > 0 && (
                                  <div className="mt-1 p-1 bg-yellow-50 border border-yellow-300 rounded">
                                    <div className="font-semibold text-yellow-800 text-xs">⚠️ Warnings:</div>
                                    {result.details.warnings.map((warning: string, i: number) => (
                                      <div key={i} className="text-xs text-yellow-700">• {warning}</div>
                                    ))}
                                  </div>
                                )}
                                {result.details?.hints && (
                                  <div className="mt-1 text-blue-600">
                                    {result.details.hints.map((hint: string, i: number) => (
                                      <div key={i}>💡 {hint}</div>
                                    ))}
                                  </div>
                                )}
                                {result.details?.code_line && (
                                  <div className="mt-1 text-gray-600 font-mono">
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
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
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
