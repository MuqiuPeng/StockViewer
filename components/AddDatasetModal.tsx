'use client';

import { useState } from 'react';
import { DATA_SOURCES, getDataSourceConfig, getDataSourceCategories } from '@/lib/data-sources';

interface AddDatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (datasetName: string) => void;
}

interface AddResult {
  symbol: string;
  success: boolean;
  message?: string;
}

interface SymbolListItem {
  code: string;
  name: string;
  type?: string;
  exchange?: string;
  status?: string;
  source?: string;
}

export default function AddDatasetModal({ isOpen, onClose, onSuccess }: AddDatasetModalProps) {
  const [symbol, setSymbol] = useState('');
  const [dataSource, setDataSource] = useState('stock_zh_a_hist');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AddResult[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  // Symbol browser state
  const [showSymbolBrowser, setShowSymbolBrowser] = useState(false);
  const [symbolList, setSymbolList] = useState<SymbolListItem[]>([]);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [symbolNameMap, setSymbolNameMap] = useState<Map<string, string>>(new Map()); // Map code -> name

  if (!isOpen) return null;

  // Get the current data source config
  const currentConfig = getDataSourceConfig(dataSource);

  // Map data source to listing API
  const getListingApiForDataSource = (dsId: string): string | null => {
    // A-share stocks
    if (dsId.startsWith('stock_zh_a_')) return '/api/stock-list?source=active';
    if (dsId.startsWith('stock_zh_b_')) return '/api/stock-list?source=active';

    // Hong Kong stocks
    if (dsId.includes('_hk_') && dsId.includes('stock')) return '/api/hk-stock-list';

    // US stocks
    if (dsId.includes('_us_') && dsId.includes('stock')) return '/api/us-stock-list';

    // Indices
    if (dsId === 'index_zh_a_hist' || dsId === 'stock_zh_index_daily' ||
        dsId === 'stock_zh_index_daily_tx' || dsId === 'stock_zh_index_daily_em') {
      return '/api/index-list?source=zh';
    }
    if (dsId === 'stock_hk_index_daily_sina' || dsId === 'stock_hk_index_daily_em') {
      return '/api/index-list?source=hk';
    }
    if (dsId === 'index_us_stock_sina') {
      return '/api/index-list?source=us';
    }
    if (dsId === 'index_global_hist_em' || dsId === 'index_global_hist_sina') {
      return '/api/index-list?source=global';
    }

    // Funds/ETFs
    if (dsId.includes('fund_etf')) return '/api/fund-list?type=etf';
    if (dsId.includes('fund_lof')) return '/api/fund-list?type=lof';

    // Futures
    if (dsId.includes('futures')) return '/api/futures-list';

    return null;
  };

  const canBrowseSymbols = (): boolean => {
    return getListingApiForDataSource(dataSource) !== null;
  };

  const handleBrowseSymbols = async () => {
    const apiUrl = getListingApiForDataSource(dataSource);
    if (!apiUrl) return;

    setIsLoadingSymbols(true);
    setError(null);
    setSymbolSearch('');
    setSelectedSymbols(new Set());

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch symbol list');
      }

      // Normalize different response formats
      let items: SymbolListItem[] = [];
      if (data.stocks) {
        items = data.stocks;
      } else if (data.indices) {
        items = data.indices;
      } else if (data.funds) {
        items = data.funds;
      } else if (data.futures) {
        items = data.futures;
      }

      // Sort by code/symbol
      items.sort((a, b) => a.code.localeCompare(b.code));

      // Build code -> name map
      const nameMap = new Map<string, string>();
      items.forEach(item => {
        nameMap.set(item.code, item.name);
      });
      setSymbolNameMap(nameMap);

      setSymbolList(items);
      setShowSymbolBrowser(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch symbols');
    } finally {
      setIsLoadingSymbols(false);
    }
  };

  const handleToggleSymbol = (code: string) => {
    const newSelected = new Set(selectedSymbols);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedSymbols(newSelected);
  };

  const handleAddSelectedSymbols = () => {
    if (selectedSymbols.size === 0) return;

    const selectedCodes = Array.from(selectedSymbols).join(', ');
    const currentSymbol = symbol.trim();

    if (currentSymbol) {
      // Append to existing symbols
      setSymbol(currentSymbol + ', ' + selectedCodes);
    } else {
      // Set as new symbols
      setSymbol(selectedCodes);
    }

    setShowSymbolBrowser(false);
    setSymbolSearch('');
    setSelectedSymbols(new Set());
  };

  const filteredSymbols = symbolSearch
    ? symbolList.filter(item =>
        item.code.toLowerCase().includes(symbolSearch.toLowerCase()) ||
        item.name.toLowerCase().includes(symbolSearch.toLowerCase())
      )
    : symbolList;

  const validateSymbol = (sym: string): boolean => {
    // Basic validation - just check if not empty
    // Specific format validation will happen on the server
    return sym.trim().length > 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResults([]);

    // Parse symbols (comma-separated)
    const symbols = symbol
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (symbols.length === 0) {
      setError('Please enter at least one symbol');
      return;
    }

    // Validate all symbols
    const invalidSymbols = symbols.filter(s => !validateSymbol(s));
    if (invalidSymbols.length > 0) {
      setError(`Invalid symbol(s): ${invalidSymbols.join(', ')}`);
      return;
    }

    setIsLoading(true);
    setProgress({ current: 0, total: symbols.length });

    const addResults: AddResult[] = [];

    // Add datasets sequentially
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      setProgress({ current: i, total: symbols.length });

      try {
        // Get name from symbolNameMap if available (from browse selection)
        const symbolName = symbolNameMap.get(sym);

        const response = await fetch('/api/add-dataset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ symbol: sym, dataSource, name: symbolName }),
        });

        const data = await response.json();

        if (!response.ok) {
          addResults.push({
            symbol: sym,
            success: false,
            message: data.message || 'Failed to add dataset',
          });
        } else {
          addResults.push({
            symbol: sym,
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
          symbol: sym,
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
      setSymbol('');
      setDataSource('stock_zh_a_hist');
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setSymbol('');
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
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4 dark:text-white">Add Dataset</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="data-source" className="block text-sm font-medium mb-2 dark:text-white">
              Data Source
            </label>
            <select
              id="data-source"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              {getDataSourceCategories().map((category) => (
                <optgroup key={category} label={category}>
                  {DATA_SOURCES.filter(ds => ds.category === category).map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {currentConfig && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {currentConfig.description}
              </p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="dataset-symbol" className="block text-sm font-medium mb-2 dark:text-white">
              Symbol(s)
            </label>
            <div className="flex gap-2">
              <input
                id="dataset-symbol"
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder={currentConfig?.exampleSymbol ? `e.g., ${currentConfig.exampleSymbol}` : 'Enter symbol'}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              {canBrowseSymbols() && (
                <button
                  type="button"
                  onClick={handleBrowseSymbols}
                  disabled={isLoading || isLoadingSymbols}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoadingSymbols ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading...
                    </>
                  ) : (
                    'Browse'
                  )}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {currentConfig?.symbolFormat || 'Enter symbol(s)'}. Separate multiple symbols with commas. All historical data will be fetched.
            </p>
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

          {results.length > 0 && (
            <div className="mb-4 p-3 border border-gray-300 dark:border-gray-600 rounded">
              <div className="text-sm font-medium mb-2 dark:text-white">
                Results: {results.filter(r => r.success).length} succeeded, {results.filter(r => !r.success).length} failed
              </div>
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-sm dark:text-gray-200">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th className="border dark:border-gray-600 p-1 text-left">Symbol</th>
                      <th className="border dark:border-gray-600 p-1 text-left">Status</th>
                      <th className="border dark:border-gray-600 p-1 text-left">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, idx) => (
                      <tr key={idx}>
                        <td className="border dark:border-gray-600 p-1 font-mono">{result.symbol}</td>
                        <td className="border dark:border-gray-600 p-1">
                          {result.success ? (
                            <span className="text-green-600 dark:text-green-400">✓ Success</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">✗ Failed</span>
                          )}
                        </td>
                        <td className="border dark:border-gray-600 p-1 text-xs">{result.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !symbol.trim()}
              className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isLoading ? 'Adding...' : (results.length > 0 ? 'Add More' : 'Add Dataset(s)')}
            </button>
          </div>
        </form>

        {/* Symbol Browser Popup */}
        {showSymbolBrowser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Overlay */}
            <div
              className="absolute inset-0 bg-black bg-opacity-50"
              onClick={() => {
                setShowSymbolBrowser(false);
                setSelectedSymbols(new Set());
                setSymbolSearch('');
              }}
            />

            {/* Browser Modal */}
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold dark:text-white">
                  Select Symbols {selectedSymbols.size > 0 && `(${selectedSymbols.size} selected)`}
                </h3>
                <button
                  onClick={() => {
                    setShowSymbolBrowser(false);
                    setSelectedSymbols(new Set());
                    setSymbolSearch('');
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>

              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  placeholder="Search by code or name..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Symbol List */}
              <div className="flex-1 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded">
                {filteredSymbols.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    No symbols found
                  </div>
                ) : (
                  <table className="w-full dark:text-gray-200">
                    <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 w-10">
                          <input
                            type="checkbox"
                            checked={filteredSymbols.length > 0 && filteredSymbols.every(item => selectedSymbols.has(item.code))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSymbols(new Set(filteredSymbols.map(item => item.code)));
                              } else {
                                setSelectedSymbols(new Set());
                              }
                            }}
                            className="cursor-pointer"
                          />
                        </th>
                        <th className="px-4 py-2 text-left text-sm font-medium">Code</th>
                        <th className="px-4 py-2 text-left text-sm font-medium">Name</th>
                        {filteredSymbols[0]?.type && (
                          <th className="px-4 py-2 text-left text-sm font-medium">Type</th>
                        )}
                        {filteredSymbols[0]?.exchange && (
                          <th className="px-4 py-2 text-left text-sm font-medium">Exchange</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSymbols.map((item, idx) => (
                        <tr
                          key={idx}
                          onClick={() => handleToggleSymbol(item.code)}
                          className="border-b dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selectedSymbols.has(item.code)}
                              onChange={() => handleToggleSymbol(item.code)}
                              className="cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="px-4 py-2 text-sm font-mono">{item.code}</td>
                          <td className="px-4 py-2 text-sm">{item.name}</td>
                          {item.type && (
                            <td className="px-4 py-2 text-sm">{item.type}</td>
                          )}
                          {item.exchange && (
                            <td className="px-4 py-2 text-sm">{item.exchange}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {filteredSymbols.length} symbol(s) available
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowSymbolBrowser(false);
                      setSelectedSymbols(new Set());
                      setSymbolSearch('');
                    }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddSelectedSymbols}
                    disabled={selectedSymbols.size === 0}
                    className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add Selected ({selectedSymbols.size})
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
