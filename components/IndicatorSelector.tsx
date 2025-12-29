'use client';

import { useState, useMemo } from 'react';

interface IndicatorSelectorProps {
  indicators: string[];
  enabledIndicators: Set<string>;
  onToggle: (indicator: string) => void;
}

export default function IndicatorSelector({
  indicators,
  enabledIndicators,
  onToggle,
}: IndicatorSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredIndicators = useMemo(() => {
    if (!searchTerm.trim()) {
      return indicators;
    }
    const term = searchTerm.toLowerCase();
    return indicators.filter(ind => ind.toLowerCase().includes(term));
  }, [indicators, searchTerm]);

  if (indicators.length === 0) {
    return (
      <div className="indicator-selector">
        <p className="text-sm text-gray-500">No indicators available</p>
      </div>
    );
  }

  return (
    <div className="indicator-selector">
      <div className="mb-2">
        <input
          type="text"
          placeholder="Search indicators..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
        />
      </div>
      <div className="indicator-list border border-gray-200 rounded p-2 max-h-64 overflow-y-auto">
        {filteredIndicators.length === 0 ? (
          <p className="text-sm text-gray-500">No indicators match your search</p>
        ) : (
          filteredIndicators.map((indicator) => (
            <label key={indicator} className="flex items-center mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledIndicators.has(indicator)}
                onChange={() => onToggle(indicator)}
                className="mr-2"
              />
              <span className="text-sm">{indicator}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

