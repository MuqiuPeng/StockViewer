'use client';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndicatorData {
  time: number;
  value: number | null;
}

interface DataPanelProps {
  candles: CandleData[];
  indicators: Record<string, IndicatorData[]>;
  crosshairTime: number | null;
  colorMap: Map<string, string>;
  enabledIndicators1: Set<string>;
  enabledIndicators2: Set<string>;
  baseIndicators: string[];
  definedIndicators: string[];
  indicatorGroups: Set<string>;
}

export default function DataPanel({
  candles,
  indicators,
  crosshairTime,
  colorMap,
  enabledIndicators1,
  enabledIndicators2,
  baseIndicators,
  definedIndicators,
  indicatorGroups,
}: DataPanelProps) {
  if (!crosshairTime) {
    return (
      <div className="data-panel p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-500 h-full flex items-center justify-center">
        Hover over the chart to see data values
      </div>
    );
  }

  // Find the candle data at the crosshair time
  // Use findIndex with exact match first, then fallback to closest match
  let candleIndex = candles.findIndex(c => c.time === crosshairTime);
  
  // If no exact match, find the closest time (within 1 day tolerance)
  if (candleIndex === -1) {
    const tolerance = 86400; // 1 day in seconds
    let closestIndex = -1;
    let closestDiff = Infinity;
    
    candles.forEach((candle, idx) => {
      const diff = Math.abs(candle.time - crosshairTime);
      if (diff < closestDiff && diff <= tolerance) {
        closestDiff = diff;
        closestIndex = idx;
      }
    });
    
    candleIndex = closestIndex;
  }
  
  if (candleIndex === -1) {
    return (
      <div className="data-panel p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-500 h-full flex items-center justify-center">
        No data available for selected time
      </div>
    );
  }

  const candle = candles[candleIndex];
  const date = new Date(candle.time * 1000);

  // Get all indicator values at this time
  // Only include basic indicators and defined indicators (exclude deleted ones)
  const allowedIndicators = new Set([...baseIndicators, ...definedIndicators]);
  const candleTime = candles[candleIndex].time;
  const indicatorValues: Array<{ name: string; value: number | null; color: string }> = [];
  for (const [indicatorName, indicatorData] of Object.entries(indicators)) {
    // Check if this indicator should be shown
    let isAllowed = allowedIndicators.has(indicatorName);

    // For group indicators, check if the column matches a group pattern
    if (!isAllowed && indicatorName.includes(':')) {
      const groupName = indicatorName.split(':')[0];
      if (indicatorGroups.has(groupName)) {
        isAllowed = true;
      }
    }

    // Skip indicators that are not in the allowed list (deleted indicators)
    if (!isAllowed) {
      continue;
    }
    // Try exact match first, then closest match
    let indicatorPoint = indicatorData.find(d => d.time === candleTime);
    if (!indicatorPoint && indicatorData.length > 0) {
      // Find closest match
      const tolerance = 86400; // 1 day
      let closest: IndicatorData | null = null;
      let closestDiff = Infinity;
      
      indicatorData.forEach(d => {
        const diff = Math.abs(d.time - candleTime);
        if (diff < closestDiff && diff <= tolerance) {
          closestDiff = diff;
          closest = d;
        }
      });
      
      indicatorPoint = closest || undefined;
    }
    
    if (indicatorPoint !== undefined) {
      indicatorValues.push({
        name: indicatorName,
        value: indicatorPoint.value,
        color: colorMap.get(indicatorName) || '#999999',
      });
    }
  }

  // Group indicators by chart
  const indicators1 = indicatorValues.filter(ind => enabledIndicators1.has(ind.name));
  const indicators2 = indicatorValues.filter(ind => enabledIndicators2.has(ind.name));
  const allEnabled = new Set([...enabledIndicators1, ...enabledIndicators2]);
  const unselectedIndicators = indicatorValues.filter(ind => !allEnabled.has(ind.name));

  // Sort each group alphabetically
  indicators1.sort((a, b) => a.name.localeCompare(b.name));
  indicators2.sort((a, b) => a.name.localeCompare(b.name));
  unselectedIndicators.sort((a, b) => a.name.localeCompare(b.name));

  const formatNumber = (value: number | null): string => {
    if (value === null) return 'N/A';
    if (value >= 1000000000) {
      return (value / 1000000000).toFixed(2) + 'B';
    } else if (value >= 1000000) {
      return (value / 1000000).toFixed(2) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(2) + 'K';
    }
    return value.toFixed(4);
  };

  return (
    <div className="data-panel p-3 bg-gray-50 border border-gray-200 rounded h-full flex flex-col">
      <div className="text-xs font-semibold text-gray-600 mb-2">
        {date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          weekday: 'short'
        })}
      </div>
      
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <div className="text-xs text-gray-500">Open</div>
          <div className="text-sm font-medium">{candle.open.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">High</div>
          <div className="text-sm font-medium text-green-600">{candle.high.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Low</div>
          <div className="text-sm font-medium text-red-600">{candle.low.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Close</div>
          <div className="text-sm font-medium">{candle.close.toFixed(2)}</div>
        </div>
      </div>

      {indicatorValues.length > 0 && (
        <div className="border-t border-gray-300 pt-2 mt-2 flex-1 flex flex-col min-h-0">
          <div className="text-xs font-semibold text-gray-600 mb-2">Indicators</div>
          <div className="space-y-1 flex-1 overflow-y-auto min-h-0">
            {/* Sub-graph 1 indicators */}
            {indicators1.length > 0 && (
              <div className="mb-2">
                <div className="text-xs text-gray-500 mb-1">Indicator Chart 1</div>
                {indicators1.map((ind) => (
                  <div
                    key={ind.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: ind.color }}
                      />
                      <span className="text-gray-700 font-medium">{ind.name}</span>
                    </div>
                    <span className="font-medium text-gray-900">
                      {ind.value !== null ? formatNumber(ind.value) : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Separator between sub-graph 1 and 2 */}
            {indicators1.length > 0 && indicators2.length > 0 && (
              <div className="border-t-2 border-gray-300 my-2"></div>
            )}

            {/* Sub-graph 2 indicators */}
            {indicators2.length > 0 && (
              <div className="mb-2">
                <div className="text-xs text-gray-500 mb-1">Indicator Chart 2</div>
                {indicators2.map((ind) => (
                  <div
                    key={ind.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: ind.color }}
                      />
                      <span className="text-gray-700 font-medium">{ind.name}</span>
                    </div>
                    <span className="font-medium text-gray-900">
                      {ind.value !== null ? formatNumber(ind.value) : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Separator between enabled and unselected */}
            {(indicators1.length > 0 || indicators2.length > 0) && unselectedIndicators.length > 0 && (
              <div className="border-t-2 border-gray-300 my-2"></div>
            )}

            {/* Unselected indicators */}
            {unselectedIndicators.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Not Selected</div>
                {unselectedIndicators.map((ind) => (
                  <div
                    key={ind.name}
                    className="flex items-center justify-between text-xs opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: ind.color }}
                      />
                      <span className="text-gray-500">{ind.name}</span>
                    </div>
                    <span className="text-gray-600">
                      {ind.value !== null ? formatNumber(ind.value) : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

