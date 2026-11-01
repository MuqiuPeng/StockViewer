'use client';

import { useState, useCallback, useMemo } from 'react';
import { ImportableItem, ImportableDatasetColumn } from './types';

interface ImportPanelProps {
  baseColumns: string[];
  indicators: ImportableItem[];
  datasetColumns: ImportableDatasetColumn[];
  isLoading: boolean;
  onInsertColumn: (col: string) => void;
  onInsertIndicator: (item: ImportableItem) => void;
  onInsertDatasetColumn: (dsCol: ImportableDatasetColumn) => void;
  currentIndicatorId?: string;
}

export default function ImportPanel({
  baseColumns,
  indicators,
  datasetColumns,
  isLoading,
  onInsertColumn,
  onInsertIndicator,
  onInsertDatasetColumn,
  currentIndicatorId,
}: ImportPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());

  const toggleDatasetExpansion = useCallback((symbol: string) => {
    setExpandedDatasets((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }, []);

  const matchesSearch = useCallback((target: string, query: string): boolean => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const t = target.toLowerCase();

    if (q.includes(' | ')) {
      return q.split(' | ').some((term) => matchesSearch(target, term.trim()));
    }
    if (q.includes(' & ')) {
      return q.split(' & ').every((term) => matchesSearch(target, term.trim()));
    }
    return t.includes(q);
  }, []);

  // Group dataset columns by symbol
  const groupedDatasetColumns = useMemo(() => {
    const groups: Record<string, { name: string; columns: ImportableDatasetColumn[] }> = {};
    for (const col of datasetColumns) {
      if (!groups[col.datasetSymbol]) {
        groups[col.datasetSymbol] = { name: col.datasetName, columns: [] };
      }
      groups[col.datasetSymbol].columns.push(col);
    }
    return groups;
  }, [datasetColumns]);

  // Filter indicators: exclude current indicator being edited
  const filteredIndicators = useMemo(() => {
    return indicators
      .filter((item) => !currentIndicatorId || !item.id.startsWith(currentIndicatorId))
      .filter((item) => matchesSearch(item.displayName, searchQuery));
  }, [indicators, currentIndicatorId, searchQuery, matchesSearch]);

  return (
    <div className="w-64 flex-shrink-0 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 flex flex-col">
      {/* Panel Header */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="text-sm font-semibold dark:text-white">Import</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Insert columns or indicators</div>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
        />
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-4">Loading...</div>
        ) : (
          <>
            {/* Base Columns (OHLCV) */}
            <div className="text-xs text-gray-400 dark:text-gray-500 py-1 font-medium">Base Columns</div>
            {baseColumns
              .filter((col) => matchesSearch(col, searchQuery))
              .map((col) => (
                <div
                  key={col}
                  className="flex items-center justify-between p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-xs cursor-pointer"
                  onDoubleClick={() => onInsertColumn(col)}
                >
                  <span className="text-gray-600 dark:text-gray-300 font-mono">{col}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onInsertColumn(col); }}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    +
                  </button>
                </div>
              ))}

            {/* Indicators */}
            {filteredIndicators.length > 0 && (
              <>
                <div className="text-xs text-gray-400 dark:text-gray-500 py-1 mt-3 font-medium">Indicators</div>
                {filteredIndicators.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-1 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded text-xs cursor-pointer"
                    onDoubleClick={() => onInsertIndicator(item)}
                  >
                    <div className="flex-1 truncate">
                      <span className="dark:text-white">{item.displayName}</span>
                      {!item.isOwner && (
                        <span className="text-[10px] text-gray-400 ml-1">({item.ownerEmail})</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onInsertIndicator(item); }}
                      className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500 hover:bg-purple-600 text-white"
                    >
                      +
                    </button>
                  </div>
                ))}
              </>
            )}

            {indicators.length === 0 && (
              <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-2 mt-3">
                No indicators available
              </div>
            )}

            {/* Dataset Columns - collapsible by dataset */}
            {Object.keys(groupedDatasetColumns).length > 0 && (
              <>
                <div className="text-xs text-gray-400 dark:text-gray-500 py-1 mt-3 font-medium">Other Datasets</div>
                {Object.entries(groupedDatasetColumns)
                  .filter(
                    ([symbol, group]) =>
                      matchesSearch(symbol, searchQuery) ||
                      matchesSearch(group.name, searchQuery) ||
                      group.columns.some((col) => matchesSearch(col.column, searchQuery))
                  )
                  .map(([symbol, group]) => (
                    <div key={symbol} className="mb-1">
                      <div
                        className="flex items-center gap-1 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer text-xs"
                        onClick={() => toggleDatasetExpansion(symbol)}
                      >
                        <span className="text-gray-400 dark:text-gray-500 w-3">
                          {expandedDatasets.has(symbol) ? '\u25BC' : '\u25B6'}
                        </span>
                        <span className="dark:text-white font-medium">{symbol}</span>
                        <span className="text-gray-400 dark:text-gray-500 text-[10px] truncate">
                          {group.name !== symbol ? group.name : ''}
                        </span>
                      </div>
                      {expandedDatasets.has(symbol) && (
                        <div className="ml-4 border-l border-gray-200 dark:border-gray-600 pl-2">
                          {group.columns
                            .filter((dsCol) => matchesSearch(dsCol.column, searchQuery))
                            .map((dsCol) => (
                              <div
                                key={dsCol.displayName}
                                className="flex items-center justify-between p-1 hover:bg-green-50 dark:hover:bg-green-900/20 rounded text-xs cursor-pointer"
                                onDoubleClick={() => onInsertDatasetColumn(dsCol)}
                              >
                                <span className="dark:text-gray-300 font-mono text-[11px]">{dsCol.column}</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onInsertDatasetColumn(dsCol); }}
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-green-500 hover:bg-green-600 text-white"
                                >
                                  +
                                </button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
