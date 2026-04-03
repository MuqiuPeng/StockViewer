'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BASE_COLUMNS } from './placeholder-utils';
import type {
  ImportableItem,
  ImportableDatasetColumn,
  PickerItem,
  PickerState,
  DataSourcesConfig,
} from './types';

interface DataSourcePickerProps {
  container: HTMLDivElement | null;
  pickerState: PickerState;
  dataSources: DataSourcesConfig;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
}

interface GroupedDatasets {
  [symbol: string]: {
    name: string;
    columns: ImportableDatasetColumn[];
  };
}

export default function DataSourcePicker({
  container,
  pickerState,
  dataSources,
  onSelect,
  onClose,
}: DataSourcePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when picker opens
  useEffect(() => {
    if (pickerState.isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setExpandedDatasets(new Set());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [pickerState.isOpen]);

  // Group dataset columns by symbol
  const groupedDatasets = useMemo<GroupedDatasets>(() => {
    const groups: GroupedDatasets = {};
    for (const dsCol of dataSources.datasetColumns) {
      if (!groups[dsCol.datasetSymbol]) {
        groups[dsCol.datasetSymbol] = {
          name: dsCol.datasetName,
          columns: [],
        };
      }
      groups[dsCol.datasetSymbol].columns.push(dsCol);
    }
    return groups;
  }, [dataSources.datasetColumns]);

  // Search filter
  const matchesSearch = useCallback((target: string, query: string): boolean => {
    if (!query.trim()) return true;
    const targetLower = target.toLowerCase();
    const queryLower = query.toLowerCase();

    if (queryLower.includes(' | ')) {
      return queryLower.split(' | ').some(term => matchesSearch(target, term.trim()));
    }
    if (queryLower.includes(' & ')) {
      return queryLower.split(' & ').every(term => matchesSearch(target, term.trim()));
    }
    return targetLower.includes(queryLower.trim());
  }, []);

  // Build flat list of all visible items for keyboard navigation
  const visibleItems = useMemo<PickerItem[]>(() => {
    const items: PickerItem[] = [];

    // Base columns
    for (const col of BASE_COLUMNS) {
      if (matchesSearch(col, searchQuery)) {
        items.push({
          type: 'base',
          label: col,
          column: col,
        });
      }
    }

    // Indicators
    for (const ind of dataSources.indicators) {
      if (matchesSearch(ind.displayName, searchQuery)) {
        items.push({
          type: 'indicator',
          label: ind.displayName,
          detail: ind.isOwner ? undefined : ind.ownerEmail,
          indicatorName: ind.indicatorName,
          columnName: ind.columnName,
          isGroupColumn: ind.isGroupColumn,
          ownerEmail: ind.ownerEmail,
        });
      }
    }

    // Dataset symbols (headers) and their columns
    for (const [symbol, group] of Object.entries(groupedDatasets)) {
      const symbolMatches = matchesSearch(symbol, searchQuery) || matchesSearch(group.name, searchQuery);
      const hasMatchingColumns = group.columns.some(col => matchesSearch(col.column, searchQuery));

      if (symbolMatches || hasMatchingColumns) {
        // Only show individual columns for base columns (open/high/low/close/volume)
        const baseDatasetCols = group.columns.filter(col => BASE_COLUMNS.includes(col.column));
        for (const dsCol of baseDatasetCols) {
          if (matchesSearch(dsCol.column, searchQuery) || symbolMatches) {
            items.push({
              type: 'dataset',
              label: `${symbol}@${dsCol.column}`,
              detail: group.name !== symbol ? group.name : undefined,
              datasetSymbol: symbol,
              datasetColumn: dsCol.column,
              datasetName: group.name,
            });
          }
        }
      }
    }

    return items;
  }, [dataSources, groupedDatasets, searchQuery, matchesSearch]);

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= visibleItems.length) {
      setSelectedIndex(Math.max(0, visibleItems.length - 1));
    }
  }, [visibleItems.length, selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => Math.min(prev + 1, visibleItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (visibleItems[selectedIndex]) {
          onSelect(visibleItems[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else {
          setSelectedIndex(prev => Math.min(prev + 1, visibleItems.length - 1));
        }
        break;
    }
  }, [visibleItems, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const selectedEl = listEl.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!pickerState.isOpen || !container) return null;

  // Determine current section headers
  const baseItems = visibleItems.filter(i => i.type === 'base');
  const indicatorItems = visibleItems.filter(i => i.type === 'indicator');
  const datasetItems = visibleItems.filter(i => i.type === 'dataset');

  let globalIndex = 0;

  const content = (
    <div
      className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl w-64 max-h-72 flex flex-col overflow-hidden"
      style={{ zIndex: 1000 }}
      onMouseDown={(e) => e.preventDefault()} // Prevent editor blur
    >
      {/* Search input */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search data sources..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white outline-none focus:border-blue-500"
        />
      </div>

      {/* Items list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-1">
        {visibleItems.length === 0 && (
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
            No matching data sources
          </div>
        )}

        {/* Base columns section */}
        {baseItems.length > 0 && (
          <>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 px-2 py-1 font-medium uppercase tracking-wide">
              Base Columns
            </div>
            {baseItems.map((item) => {
              const idx = globalIndex++;
              return (
                <div
                  key={`base-${item.column}`}
                  data-index={idx}
                  className={`flex items-center px-2 py-1 rounded text-xs cursor-pointer ${
                    idx === selectedIndex
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => onSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="w-4 h-4 rounded mr-2 flex items-center justify-center text-[10px] bg-blue-500 text-white font-bold flex-shrink-0">
                    C
                  </span>
                  <span className="font-mono">{item.label}</span>
                </div>
              );
            })}
          </>
        )}

        {/* Indicators section */}
        {indicatorItems.length > 0 && (
          <>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 px-2 py-1 mt-1 font-medium uppercase tracking-wide">
              Indicators
            </div>
            {indicatorItems.map((item) => {
              const idx = globalIndex++;
              return (
                <div
                  key={`ind-${item.indicatorName}-${item.columnName}`}
                  data-index={idx}
                  className={`flex items-center px-2 py-1 rounded text-xs cursor-pointer ${
                    idx === selectedIndex
                      ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => onSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="w-4 h-4 rounded mr-2 flex items-center justify-center text-[10px] bg-purple-500 text-white font-bold flex-shrink-0">
                    I
                  </span>
                  <span className="font-mono flex-1 truncate">{item.label}</span>
                  {item.detail && (
                    <span className="text-[10px] text-gray-400 ml-1 truncate">{item.detail}</span>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Datasets section */}
        {datasetItems.length > 0 && (
          <>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 px-2 py-1 mt-1 font-medium uppercase tracking-wide">
              Datasets
            </div>
            {datasetItems.map((item) => {
              const idx = globalIndex++;
              return (
                <div
                  key={`ds-${item.datasetSymbol}-${item.datasetColumn}`}
                  data-index={idx}
                  className={`flex items-center px-2 py-1 rounded text-xs cursor-pointer ${
                    idx === selectedIndex
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                  onClick={() => onSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="w-4 h-4 rounded mr-2 flex items-center justify-center text-[10px] bg-green-500 text-white font-bold flex-shrink-0">
                    D
                  </span>
                  <span className="font-mono flex-1 truncate">{item.label}</span>
                  {item.detail && (
                    <span className="text-[10px] text-gray-400 ml-1 truncate">{item.detail}</span>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-2 py-1 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
        <span className="mr-2">↑↓ navigate</span>
        <span className="mr-2">↵ select</span>
        <span>esc close</span>
      </div>
    </div>
  );

  return createPortal(content, container);
}
