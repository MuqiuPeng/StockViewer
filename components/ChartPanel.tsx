'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType } from 'lightweight-charts';

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

interface ChartPanelProps {
  candles: CandleData[];
  indicators: Record<string, IndicatorData[]>;
  enabledIndicators: Set<string>;
}

// Predefined color palette for indicators
const INDICATOR_COLORS = [
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#4CAF50', // Green
  '#9C27B0', // Purple
  '#F44336', // Red
  '#00BCD4', // Cyan
  '#FFEB3B', // Yellow
  '#795548', // Brown
  '#607D8B', // Blue Grey
  '#E91E63', // Pink
];

function getIndicatorColor(index: number): string {
  return INDICATOR_COLORS[index % INDICATOR_COLORS.length];
}

// Common time scale options for both charts to ensure alignment
const commonTimeScaleOptions = {
  timeVisible: true,
  secondsVisible: false,
  rightOffset: 5,
  barSpacing: 8,
  lockVisibleTimeRangeOnResize: true,
  borderColor: '#d1d4dc',
};

export default function ChartPanel({
  candles,
  indicators,
  enabledIndicators,
}: ChartPanelProps) {
  const candlestickContainerRef = useRef<HTMLDivElement>(null);
  const indicatorContainerRef = useRef<HTMLDivElement>(null);
  const candlestickChartRef = useRef<IChartApi | null>(null);
  const indicatorChartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const indicatorColorMapRef = useRef<Map<string, string>>(new Map());
  const syncUnsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize both charts
  useEffect(() => {
    if (!candlestickContainerRef.current || !indicatorContainerRef.current) return;

    // Create candlestick chart (top chart)
    const candlestickChart = createChart(candlestickContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: candlestickContainerRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: commonTimeScaleOptions,
      rightPriceScale: {
        borderColor: '#d1d4dc',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        entireTextOnly: true,
        minimumWidth: 80,
        autoScale: true,
      },
      leftPriceScale: {
        visible: false,
      },
    });

    // Create indicator chart (bottom chart)
    // Disable scroll and scale interactions - it will be driven by the main chart
    const indicatorChart = createChart(indicatorContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: indicatorContainerRef.current.clientWidth,
      height: 300,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: commonTimeScaleOptions,
      rightPriceScale: {
        borderColor: '#d1d4dc',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        entireTextOnly: true,
        minimumWidth: 80,
        autoScale: true,
      },
      leftPriceScale: {
        visible: false,
      },
    });

    // Disable mouse wheel and drag interactions on indicator chart
    // Use capture phase to intercept events before TradingView handles them
    const indicatorContainer = indicatorContainerRef.current;
    
    const preventWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    };

    const preventDrag = (e: MouseEvent) => {
      // Prevent drag but allow single clicks for crosshair
      if (e.button === 0) { // Left mouse button
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };

    // Use capture phase to catch events before TradingView
    const wheelOptions = { passive: false, capture: true } as const;
    const mouseOptions = { passive: false, capture: true } as const;
    
    // Add to container
    indicatorContainer.addEventListener('wheel', preventWheel, wheelOptions);
    indicatorContainer.addEventListener('mousedown', preventDrag, mouseOptions);

    // Setup prevention on canvas and chart elements
    const setupCanvasPrevention = () => {
      const canvas = indicatorContainer.querySelector('canvas');
      if (canvas) {
        // Remove existing listeners if any, then add new ones
        canvas.removeEventListener('wheel', preventWheel, wheelOptions);
        canvas.removeEventListener('mousedown', preventDrag, mouseOptions);
        canvas.addEventListener('wheel', preventWheel, wheelOptions);
        canvas.addEventListener('mousedown', preventDrag, mouseOptions);
        
        // Also prevent on the parent div that TradingView creates
        const chartDiv = canvas.parentElement;
        if (chartDiv && chartDiv !== indicatorContainer) {
          chartDiv.removeEventListener('wheel', preventWheel, wheelOptions);
          chartDiv.removeEventListener('mousedown', preventDrag, mouseOptions);
          chartDiv.addEventListener('wheel', preventWheel, wheelOptions);
          chartDiv.addEventListener('mousedown', preventDrag, mouseOptions);
        }
      }
    };

    // Use MutationObserver to catch canvas creation
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            const element = node as Element;
            if (element.tagName === 'CANVAS' || element.querySelector('canvas')) {
              setupCanvasPrevention();
            }
          }
        });
      });
    });

    observer.observe(indicatorContainer, {
      childList: true,
      subtree: true,
    });

    // Also try immediately and with delays
    setupCanvasPrevention();
    const timeouts = [
      setTimeout(setupCanvasPrevention, 50),
      setTimeout(setupCanvasPrevention, 100),
      setTimeout(setupCanvasPrevention, 300),
      setTimeout(setupCanvasPrevention, 500),
    ];

    // Store cleanup functions
    const cleanupFunctions: Array<() => void> = [
      () => {
        observer.disconnect();
        timeouts.forEach(clearTimeout);
      },
      () => indicatorContainer.removeEventListener('wheel', preventWheel, wheelOptions),
      () => indicatorContainer.removeEventListener('mousedown', preventDrag, mouseOptions),
    ];

    candlestickChartRef.current = candlestickChart;
    indicatorChartRef.current = indicatorChart;

    // Apply common time scale options to both charts to ensure alignment
    candlestickChart.applyOptions({ timeScale: commonTimeScaleOptions });
    indicatorChart.applyOptions({ timeScale: commonTimeScaleOptions });

    // Add candlestick series to the first chart
    const candlestickSeries = candlestickChart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // One-way sync: only candlestick chart drives indicator chart
    // This avoids circular sync issues
    const syncTimeScaleOneWay = (source: IChartApi, target: IChartApi) => {
      const onSource = () => {
        try {
          const range = source.timeScale().getVisibleLogicalRange();
          if (range) {
            target.timeScale().setVisibleLogicalRange(range);
          }
        } catch (error) {
          console.warn('Failed to sync time range:', error);
        }
      };
      source.timeScale().subscribeVisibleLogicalRangeChange(onSource);
      return () => source.timeScale().unsubscribeVisibleLogicalRangeChange(onSource);
    };

    // Set up one-way sync from candlestick chart to indicator chart
    // Note: We'll set up the sync after data is loaded (in the data update effect)
    // This ensures proper order: setData -> fitContent -> sync -> immediate align

    // Handle resize
    const handleResize = () => {
      if (candlestickContainerRef.current && candlestickChartRef.current) {
        candlestickChartRef.current.applyOptions({
          width: candlestickContainerRef.current.clientWidth,
        });
      }
      if (indicatorContainerRef.current && indicatorChartRef.current) {
        indicatorChartRef.current.applyOptions({
          width: indicatorContainerRef.current.clientWidth,
        });
      }
      // Price scale widths are now fixed via minimumWidth, no need to sync
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (syncUnsubscribeRef.current) {
        syncUnsubscribeRef.current();
        syncUnsubscribeRef.current = null;
      }
      // Clean up indicator chart interaction prevention
      cleanupFunctions.forEach(cleanup => cleanup());
      
      // Clean up canvas event listeners
      const canvas = indicatorContainer.querySelector('canvas');
      if (canvas) {
        canvas.removeEventListener('wheel', preventWheel, wheelOptions);
        canvas.removeEventListener('mousedown', preventDrag, mouseOptions);
      }
      const chartDiv = indicatorContainer.querySelector('div');
      if (chartDiv && chartDiv !== indicatorContainer) {
        chartDiv.removeEventListener('wheel', preventWheel, wheelOptions);
        chartDiv.removeEventListener('mousedown', preventDrag, mouseOptions);
      }
      candlestickChart.remove();
      indicatorChart.remove();
    };
  }, []);

  // Update candlestick data
  // Critical order: setData -> fitContent -> setup sync -> immediate align
  useEffect(() => {
    const candlestickChart = candlestickChartRef.current;
    const indicatorChart = indicatorChartRef.current;
    
    if (!candlestickChart || !indicatorChart) return;
    
    if (candlestickSeriesRef.current && candles.length > 0) {
      // Step 1: Set data for main chart
      candlestickSeriesRef.current.setData(candles as any);
      
      // Step 2: Fit content on main chart only
      candlestickChart.timeScale().fitContent();
      
      // Step 3: Set up one-way sync if not already set up
      if (!syncUnsubscribeRef.current) {
        const syncTimeScaleOneWay = (source: IChartApi, target: IChartApi) => {
          const onSource = () => {
            try {
              const range = source.timeScale().getVisibleLogicalRange();
              if (range) {
                target.timeScale().setVisibleLogicalRange(range);
              }
            } catch (error) {
              console.warn('Failed to sync time range:', error);
            }
          };
          source.timeScale().subscribeVisibleLogicalRangeChange(onSource);
          return () => source.timeScale().unsubscribeVisibleLogicalRangeChange(onSource);
        };
        
        syncUnsubscribeRef.current = syncTimeScaleOneWay(candlestickChart, indicatorChart);
      }
      
      // Step 4: Immediately align the indicator chart
      requestAnimationFrame(() => {
        try {
          const logicalRange = candlestickChart.timeScale().getVisibleLogicalRange();
          if (logicalRange) {
            indicatorChart.timeScale().setVisibleLogicalRange(logicalRange);
          }
        } catch (error) {
          console.warn('Failed to immediately align indicator chart:', error);
        }
      });
    }
  }, [candles]);

  // Update indicator series
  // Step 1: Set data for indicator lines
  useEffect(() => {
    if (!indicatorChartRef.current) return;

    const currentSeries = indicatorSeriesRef.current;
    const chart = indicatorChartRef.current;

    // Remove disabled indicators
    const indicatorsToRemove: string[] = [];
    for (const [indicator, series] of currentSeries.entries()) {
      if (!enabledIndicators.has(indicator)) {
        try {
          chart.removeSeries(series);
          indicatorsToRemove.push(indicator);
        } catch (error) {
          console.warn(`Failed to remove series for indicator ${indicator}:`, error);
          indicatorsToRemove.push(indicator);
        }
      }
    }
    // Remove from map after iteration
    indicatorsToRemove.forEach(indicator => {
      currentSeries.delete(indicator);
    });

    // Add new enabled indicators
    for (const indicator of enabledIndicators) {
      if (!currentSeries.has(indicator) && indicators[indicator]) {
        // Get or assign a color for this indicator
        if (!indicatorColorMapRef.current.has(indicator)) {
          const colorIndex = indicatorColorMapRef.current.size;
          indicatorColorMapRef.current.set(indicator, getIndicatorColor(colorIndex));
        }
        const color = indicatorColorMapRef.current.get(indicator)!;
        
        // Use compact formatter for volume to keep price scale width consistent
        const isVolume = indicator.toLowerCase().includes('volume');
        const priceFormat = isVolume
          ? {
              type: 'custom' as const,
              formatter: (price: number) => {
                // Format large numbers with K/M/B or 万/亿 notation
                if (price >= 100000000) {
                  return (price / 100000000).toFixed(2) + '亿';
                } else if (price >= 10000) {
                  return (price / 10000).toFixed(2) + '万';
                } else if (price >= 1000) {
                  return (price / 1000).toFixed(2) + 'K';
                }
                return price.toFixed(0);
              },
              minMove: 1,
            }
          : {
              type: 'price' as const,
              precision: 4,
              minMove: 0.0001,
            };

        const lineSeries = chart.addLineSeries({
          color: color,
          lineWidth: 2,
          priceFormat: priceFormat,
        });
        currentSeries.set(indicator, lineSeries);

        // Set data (filter out null values)
        const data = indicators[indicator].filter(d => d.value !== null).map(d => ({
          time: d.time as any,
          value: d.value as number,
        }));
        lineSeries.setData(data);
      }
    }

    // Update data for existing series
    for (const [indicator, series] of currentSeries.entries()) {
      if (indicators[indicator]) {
        const data = indicators[indicator].filter(d => d.value !== null).map(d => ({
          time: d.time as any,
          value: d.value as number,
        }));
        series.setData(data);
      }
    }

    // After setting indicator data, align with main chart
    // The one-way sync will handle future updates, but we need to align immediately
    const candlestickChart = candlestickChartRef.current;
    if (candles.length > 0 && candlestickChart) {
      requestAnimationFrame(() => {
        try {
          const logicalRange = candlestickChart.timeScale().getVisibleLogicalRange();
          if (logicalRange) {
            chart.timeScale().setVisibleLogicalRange(logicalRange);
          }
        } catch (error) {
          console.warn('Failed to sync time range from candlestick to indicator:', error);
        }
      });
    }
  }, [enabledIndicators, indicators, candles.length]);

  // Effect to ensure charts maintain same width for alignment
  // Only sync once after mount/data updates, not repeatedly
  useEffect(() => {
    const syncWidths = () => {
      const candlestickContainer = candlestickContainerRef.current;
      const indicatorContainer = indicatorContainerRef.current;
      const candlestickChart = candlestickChartRef.current;
      const indicatorChart = indicatorChartRef.current;
      
      if (!candlestickContainer || !indicatorContainer || !candlestickChart || !indicatorChart) {
        return;
      }

      const width = Math.min(candlestickContainer.clientWidth, indicatorContainer.clientWidth);
      if (width > 0) {
        candlestickChart.applyOptions({ width });
        indicatorChart.applyOptions({ width });
      }
    };

    // Sync widths once after mount/data updates, not repeatedly
    const timeoutId = setTimeout(syncWidths, 50);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [candles.length, enabledIndicators.size]);

  return (
    <div className="chart-panel flex flex-col gap-2">
      <div className="candlestick-chart-container">
        <h3 className="text-sm font-semibold mb-1">K线图 (OHLC)</h3>
        <div 
          ref={candlestickContainerRef} 
          className="w-full" 
          style={{ height: '400px', position: 'relative' }} 
        />
      </div>
      <div className="indicator-chart-container">
        <h3 className="text-sm font-semibold mb-1">指标图</h3>
        <div 
          ref={indicatorContainerRef} 
          className="w-full indicator-chart-disabled" 
          style={{ height: '300px', position: 'relative' }} 
        />
      </div>
    </div>
  );
}
