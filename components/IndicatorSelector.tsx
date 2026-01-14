'use client';

import { useState, useMemo } from 'react';

interface IndicatorSelectorProps {
  indicators: string[];
  enabledIndicators: Set<string>;
  onToggle: (indicator: string) => void;
  title?: string;
  defaultCollapsed?: boolean;
  colorMap?: Map<string, string>;
}

export default function IndicatorSelector({
  indicators,
  enabledIndicators,
  onToggle,
  title = 'Indicators',
  defaultCollapsed = false,
  colorMap,
}: IndicatorSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const filteredIndicators = useMemo(() => {
    if (!searchTerm.trim()) {
      return indicators;
    }
    const term = searchTerm.toLowerCase();
    return indicators.filter(ind => ind.toLowerCase().includes(term));
  }, [indicators, searchTerm]);

  // Get enabled indicators with their colors from the provided colorMap
  const enabledWithColors = useMemo(() => {
    const enabled = Array.from(enabledIndicators).sort();
    return enabled.map((ind) => ({
      name: ind,
      color: colorMap?.get(ind) || '#999999', // Fallback color if not in map
    }));
  }, [enabledIndicators, colorMap]);

  const enabledCount = enabledIndicators.size;

  if (indicators.length === 0) {
    return (
      <div className="indicator-selector">
        <p className="text-sm text-gray-500 dark:text-gray-400">No indicators available</p>
      </div>
    );
  }

  return (
    <div
      className="indicator-selector border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800"
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
    >
      {/* Collapsible Header */}
      <div
        className="p-3 bg-gray-50 dark:bg-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold dark:text-white">{title}</span>
          <svg
            className={`w-5 h-5 transform transition-transform flex-shrink-0 dark:text-gray-300 ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {isCollapsed && enabledCount > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {enabledWithColors.map(({ name, color }) => (
              <div
                key={name}
                className="flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-800 rounded text-xs border border-gray-200 dark:border-gray-600"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate dark:text-white">{name}</span>
              </div>
            ))}
          </div>
        )}
        {isCollapsed && enabledCount === 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">No indicators selected</div>
        )}
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-3">
          <div className="mb-2">
            <input
              type="text"
              placeholder="Search indicators..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="indicator-list border border-gray-200 dark:border-gray-600 rounded p-2 max-h-64 overflow-y-auto bg-white dark:bg-gray-800">
            {filteredIndicators.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No indicators match your search</p>
            ) : (
              filteredIndicators.map((indicator) => (
                <label key={indicator} className="flex items-center mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledIndicators.has(indicator)}
                    onChange={() => onToggle(indicator)}
                    className="mr-2"
                  />
                  <span className="text-sm dark:text-white">{indicator}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

