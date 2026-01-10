'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType } from 'lightweight-charts';

interface CandleData {
  time: string; // YYYY-MM-DD format to avoid timezone issues
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndicatorData {
  time: string; // YYYY-MM-DD format to avoid timezone issues
  value: number | null;
}

interface ChartPanelProps {
  candles: CandleData[];
  indicators: Record<string, IndicatorData[]>;
  enabledIndicators1: Set<string>;
  enabledIndicators2: Set<string>;
  colorMap: Map<string, string>;
  onCrosshairMove?: (time: string | null) => void;
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
  enabledIndicators1,
  enabledIndicators2,
  colorMap,
  onCrosshairMove,
}: ChartPanelProps) {
  const candlestickContainerRef = useRef<HTMLDivElement>(null);
  const indicator1ContainerRef = useRef<HTMLDivElement>(null);
  const indicator2ContainerRef = useRef<HTMLDivElement>(null);
  const candlestickChartRef = useRef<IChartApi | null>(null);
  const indicator1ChartRef = useRef<IChartApi | null>(null);
  const indicator2ChartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indicator1SeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const indicator2SeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const syncUnsubscribe1Ref = useRef<(() => void) | null>(null);
  const syncUnsubscribe2Ref = useRef<(() => void) | null>(null);

  // Helper to update chart height based on container
  const updateChartHeight = (chart: IChartApi | null, container: HTMLDivElement | null) => {
    if (chart && container && container.clientHeight > 0) {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    }
  };

  // Initialize all three charts
  useEffect(() => {
    if (!candlestickContainerRef.current || !indicator1ContainerRef.current || !indicator2ContainerRef.current) return;

    // Create candlestick chart (top chart)
    const candlestickChart = createChart(candlestickContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: candlestickContainerRef.current.clientWidth,
      height: candlestickContainerRef.current.clientHeight || 350,
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

    // Create first indicator chart
    // Disable scroll and scale interactions - it will be driven by the main chart
    const indicator1Chart = createChart(indicator1ContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: indicator1ContainerRef.current.clientWidth,
      height: indicator1ContainerRef.current.clientHeight || 250,
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

    // Create second indicator chart
    const indicator2Chart = createChart(indicator2ContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: indicator2ContainerRef.current.clientWidth,
      height: indicator2ContainerRef.current.clientHeight || 250,
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

    // Disable mouse wheel and drag interactions on both indicator charts
    // Use capture phase to intercept events before TradingView handles them
    const indicator1Container = indicator1ContainerRef.current;
    const indicator2Container = indicator2ContainerRef.current;
    
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

    // Setup prevention for a container
    const setupContainerPrevention = (container: HTMLDivElement) => {
      container.addEventListener('wheel', preventWheel, wheelOptions);
      container.addEventListener('mousedown', preventDrag, mouseOptions);

      const setupCanvasPrevention = () => {
        const canvas = container.querySelector('canvas');
        if (canvas) {
          canvas.removeEventListener('wheel', preventWheel, wheelOptions);
          canvas.removeEventListener('mousedown', preventDrag, mouseOptions);
          canvas.addEventListener('wheel', preventWheel, wheelOptions);
          canvas.addEventListener('mousedown', preventDrag, mouseOptions);

          const chartDiv = canvas.parentElement;
          if (chartDiv && chartDiv !== container) {
            chartDiv.removeEventListener('wheel', preventWheel, wheelOptions);
            chartDiv.removeEventListener('mousedown', preventDrag, mouseOptions);
            chartDiv.addEventListener('wheel', preventWheel, wheelOptions);
            chartDiv.addEventListener('mousedown', preventDrag, mouseOptions);
          }
        }
      };

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              const element = node as Element;
              if (element.tagName === 'CANVAS' || element.querySelector('canvas')) {
                setupCanvasPrevention();
              }
            }
          });
        });
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
      });

      setupCanvasPrevention();
      const timeouts = [
        setTimeout(setupCanvasPrevention, 50),
        setTimeout(setupCanvasPrevention, 100),
        setTimeout(setupCanvasPrevention, 300),
        setTimeout(setupCanvasPrevention, 500),
      ];

      return {
        cleanup: () => {
          observer.disconnect();
          timeouts.forEach(clearTimeout);
          container.removeEventListener('wheel', preventWheel, wheelOptions);
          container.removeEventListener('mousedown', preventDrag, mouseOptions);
          const canvas = container.querySelector('canvas');
          if (canvas) {
            canvas.removeEventListener('wheel', preventWheel, wheelOptions);
            canvas.removeEventListener('mousedown', preventDrag, mouseOptions);
          }
          const chartDiv = container.querySelector('div');
          if (chartDiv && chartDiv !== container) {
            chartDiv.removeEventListener('wheel', preventWheel, wheelOptions);
            chartDiv.removeEventListener('mousedown', preventDrag, mouseOptions);
          }
        }
      };
    };

    // Setup prevention for both indicator containers
    const cleanup1 = setupContainerPrevention(indicator1Container);
    const cleanup2 = setupContainerPrevention(indicator2Container);

    candlestickChartRef.current = candlestickChart;
    indicator1ChartRef.current = indicator1Chart;
    indicator2ChartRef.current = indicator2Chart;

    // Apply common time scale options to all charts to ensure alignment
    candlestickChart.applyOptions({ timeScale: commonTimeScaleOptions });
    indicator1Chart.applyOptions({ timeScale: commonTimeScaleOptions });
    indicator2Chart.applyOptions({ timeScale: commonTimeScaleOptions });

    // Add candlestick series to the first chart
    const candlestickSeries = candlestickChart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Subscribe to crosshair move events on all charts
    // Synchronize crosshair across all three charts
    candlestickChart.subscribeCrosshairMove((param) => {
      if (onCrosshairMove) {
        onCrosshairMove(param.time as string | null);
      }

      // Sync crosshair to other charts
      if (param.time && param.point) {
        const candleSeries = candlestickSeriesRef.current;
        if (candleSeries) {
          // Get the price at this time point
          const candleData = param.seriesData.get(candleSeries);
          if (candleData && 'close' in candleData) {
            // Sync to indicator charts - use any series from those charts
            const indicator1Series = Array.from(indicator1SeriesRef.current.values())[0];
            const indicator2Series = Array.from(indicator2SeriesRef.current.values())[0];

            if (indicator1Series) {
              const indicator1Data = param.seriesData.get(indicator1Series);
              const price1 = indicator1Data && 'value' in indicator1Data ? indicator1Data.value : 0;
              indicator1Chart.setCrosshairPosition(price1, param.time, indicator1Series);
            }

            if (indicator2Series) {
              const indicator2Data = param.seriesData.get(indicator2Series);
              const price2 = indicator2Data && 'value' in indicator2Data ? indicator2Data.value : 0;
              indicator2Chart.setCrosshairPosition(price2, param.time, indicator2Series);
            }
          }
        }
      } else {
        // Clear crosshair on other charts
        indicator1Chart.clearCrosshairPosition();
        indicator2Chart.clearCrosshairPosition();
      }
    });

    indicator1Chart.subscribeCrosshairMove((param) => {
      if (onCrosshairMove) {
        onCrosshairMove(param.time as string | null);
      }

      // Sync crosshair to other charts
      if (param.time && param.point) {
        const candleSeries = candlestickSeriesRef.current;
        const indicator2Series = Array.from(indicator2SeriesRef.current.values())[0];

        if (candleSeries) {
          const candleData = param.seriesData.get(candleSeries);
          const price = candleData && 'close' in candleData ? candleData.close : 0;
          candlestickChart.setCrosshairPosition(price, param.time, candleSeries);
        }

        if (indicator2Series) {
          const indicator2Data = param.seriesData.get(indicator2Series);
          const price2 = indicator2Data && 'value' in indicator2Data ? indicator2Data.value : 0;
          indicator2Chart.setCrosshairPosition(price2, param.time, indicator2Series);
        }
      } else {
        candlestickChart.clearCrosshairPosition();
        indicator2Chart.clearCrosshairPosition();
      }
    });

    indicator2Chart.subscribeCrosshairMove((param) => {
      if (onCrosshairMove) {
        onCrosshairMove(param.time as string | null);
      }

      // Sync crosshair to other charts
      if (param.time && param.point) {
        const candleSeries = candlestickSeriesRef.current;
        const indicator1Series = Array.from(indicator1SeriesRef.current.values())[0];

        if (candleSeries) {
          const candleData = param.seriesData.get(candleSeries);
          const price = candleData && 'close' in candleData ? candleData.close : 0;
          candlestickChart.setCrosshairPosition(price, param.time, candleSeries);
        }

        if (indicator1Series) {
          const indicator1Data = param.seriesData.get(indicator1Series);
          const price1 = indicator1Data && 'value' in indicator1Data ? indicator1Data.value : 0;
          indicator1Chart.setCrosshairPosition(price1, param.time, indicator1Series);
        }
      } else {
        candlestickChart.clearCrosshairPosition();
        indicator1Chart.clearCrosshairPosition();
      }
    });

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

    // Use ResizeObserver to watch container sizes
    const resizeObserver = new ResizeObserver(() => {
      updateChartHeight(candlestickChartRef.current, candlestickContainerRef.current);
      if (enabledIndicators1.size > 0) {
        updateChartHeight(indicator1ChartRef.current, indicator1ContainerRef.current);
      }
      if (enabledIndicators2.size > 0) {
        updateChartHeight(indicator2ChartRef.current, indicator2ContainerRef.current);
      }
    });

    // Observe all containers
    if (candlestickContainerRef.current) {
      resizeObserver.observe(candlestickContainerRef.current);
    }
    if (indicator1ContainerRef.current) {
      resizeObserver.observe(indicator1ContainerRef.current);
    }
    if (indicator2ContainerRef.current) {
      resizeObserver.observe(indicator2ContainerRef.current);
    }

    // Also handle window resize for width changes
    const handleResize = () => {
      updateChartHeight(candlestickChartRef.current, candlestickContainerRef.current);
      if (enabledIndicators1.size > 0) {
        updateChartHeight(indicator1ChartRef.current, indicator1ContainerRef.current);
      }
      if (enabledIndicators2.size > 0) {
        updateChartHeight(indicator2ChartRef.current, indicator2ContainerRef.current);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (syncUnsubscribe1Ref.current) {
        syncUnsubscribe1Ref.current();
        syncUnsubscribe1Ref.current = null;
      }
      if (syncUnsubscribe2Ref.current) {
        syncUnsubscribe2Ref.current();
        syncUnsubscribe2Ref.current = null;
      }
      // Clean up indicator chart interaction prevention
      cleanup1.cleanup();
      cleanup2.cleanup();

      candlestickChart.remove();
      indicator1Chart.remove();
      indicator2Chart.remove();
    };
  }, []);

  // Update candlestick data
  // Critical order: setData -> fitContent -> setup sync -> immediate align
  useEffect(() => {
    const candlestickChart = candlestickChartRef.current;
    const indicator1Chart = indicator1ChartRef.current;
    const indicator2Chart = indicator2ChartRef.current;

    if (!candlestickChart || !indicator1Chart || !indicator2Chart) return;

    if (candlestickSeriesRef.current && candles.length > 0) {
      // Step 1: Set data for main chart
      candlestickSeriesRef.current.setData(candles as any);

      // Step 2: Fit content on main chart only
      candlestickChart.timeScale().fitContent();

      // Step 3: Set up one-way sync if not already set up
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

      if (!syncUnsubscribe1Ref.current) {
        syncUnsubscribe1Ref.current = syncTimeScaleOneWay(candlestickChart, indicator1Chart);
      }
      if (!syncUnsubscribe2Ref.current) {
        syncUnsubscribe2Ref.current = syncTimeScaleOneWay(candlestickChart, indicator2Chart);
      }

      // Step 4: Immediately align both indicator charts
      requestAnimationFrame(() => {
        try {
          const logicalRange = candlestickChart.timeScale().getVisibleLogicalRange();
          if (logicalRange) {
            indicator1Chart.timeScale().setVisibleLogicalRange(logicalRange);
            indicator2Chart.timeScale().setVisibleLogicalRange(logicalRange);
          }
        } catch (error) {
          console.warn('Failed to immediately align indicator charts:', error);
        }
      });
    }
  }, [candles]);

  // Update indicator series for Chart 1
  useEffect(() => {
    if (!indicator1ChartRef.current) return;

    const currentSeries = indicator1SeriesRef.current;
    const chart = indicator1ChartRef.current;

    // Remove disabled indicators
    const indicatorsToRemove: string[] = [];
    for (const [indicator, series] of currentSeries.entries()) {
      if (!enabledIndicators1.has(indicator)) {
        try {
          chart.removeSeries(series);
          indicatorsToRemove.push(indicator);
        } catch (error) {
          console.warn(`Failed to remove series for indicator ${indicator}:`, error);
          indicatorsToRemove.push(indicator);
        }
      }
    }
    indicatorsToRemove.forEach(indicator => {
      currentSeries.delete(indicator);
    });

    // Add new enabled indicators
    for (const indicator of enabledIndicators1) {
      if (!currentSeries.has(indicator) && indicators[indicator]) {
        const color = colorMap.get(indicator) || getIndicatorColor(0);

        // Use scientific notation for indicator charts
        const priceFormat = {
          type: 'custom' as const,
          formatter: (price: number) => {
            // Use scientific notation for all values
            if (price === 0) return '0';
            const absPrice = Math.abs(price);
            if (absPrice >= 1 || absPrice < 0.0001) {
              return price.toExponential(2);
            }
            // For values between 0.0001 and 1, use regular notation with appropriate precision
            return price.toFixed(4);
          },
          minMove: 0.0001,
        };

        const lineSeries = chart.addLineSeries({
          color: color,
          lineWidth: 2,
          priceFormat: priceFormat,
        });
        currentSeries.set(indicator, lineSeries);

        const data = indicators[indicator].filter(d => d.value !== null).map(d => ({
          time: d.time as any,
          value: d.value as number,
        }));
        lineSeries.setData(data);
      }
    }

    // Update data and colors for existing series to match the shared color map
    for (const [indicator, series] of currentSeries.entries()) {
      if (indicators[indicator]) {
        const data = indicators[indicator].filter(d => d.value !== null).map(d => ({
          time: d.time as any,
          value: d.value as number,
        }));
        series.setData(data);
        // Update color to match the shared color map
        const newColor = colorMap.get(indicator);
        if (newColor) {
          series.applyOptions({ color: newColor });
        }
      }
    }

    // Align with main chart
    const candlestickChart = candlestickChartRef.current;
    if (candles.length > 0 && candlestickChart) {
      requestAnimationFrame(() => {
        try {
          const logicalRange = candlestickChart.timeScale().getVisibleLogicalRange();
          if (logicalRange) {
            chart.timeScale().setVisibleLogicalRange(logicalRange);
          }
        } catch (error) {
          console.warn('Failed to sync time range from candlestick to indicator1:', error);
        }
      });
    }
  }, [enabledIndicators1, indicators, candles.length, colorMap]);

  // Update indicator series for Chart 2
  useEffect(() => {
    if (!indicator2ChartRef.current) return;

    const currentSeries = indicator2SeriesRef.current;
    const chart = indicator2ChartRef.current;

    // Color map is already built in Chart 1 effect, just use it

    // Remove disabled indicators
    const indicatorsToRemove: string[] = [];
    for (const [indicator, series] of currentSeries.entries()) {
      if (!enabledIndicators2.has(indicator)) {
        try {
          chart.removeSeries(series);
          indicatorsToRemove.push(indicator);
        } catch (error) {
          console.warn(`Failed to remove series for indicator ${indicator}:`, error);
          indicatorsToRemove.push(indicator);
        }
      }
    }
    indicatorsToRemove.forEach(indicator => {
      currentSeries.delete(indicator);
    });

    // Add new enabled indicators
    for (const indicator of enabledIndicators2) {
      if (!currentSeries.has(indicator) && indicators[indicator]) {
        const color = colorMap.get(indicator) || getIndicatorColor(0);

        // Use scientific notation for indicator charts
        const priceFormat = {
          type: 'custom' as const,
          formatter: (price: number) => {
            // Use scientific notation for all values
            if (price === 0) return '0';
            const absPrice = Math.abs(price);
            if (absPrice >= 1 || absPrice < 0.0001) {
              return price.toExponential(2);
            }
            // For values between 0.0001 and 1, use regular notation with appropriate precision
            return price.toFixed(4);
          },
          minMove: 0.0001,
        };

        const lineSeries = chart.addLineSeries({
          color: color,
          lineWidth: 2,
          priceFormat: priceFormat,
        });
        currentSeries.set(indicator, lineSeries);

        const data = indicators[indicator].filter(d => d.value !== null).map(d => ({
          time: d.time as any,
          value: d.value as number,
        }));
        lineSeries.setData(data);
      }
    }

    // Update data and colors for existing series to match the shared color map
    for (const [indicator, series] of currentSeries.entries()) {
      if (indicators[indicator]) {
        const data = indicators[indicator].filter(d => d.value !== null).map(d => ({
          time: d.time as any,
          value: d.value as number,
        }));
        series.setData(data);
        // Update color to match the shared color map
        const newColor = colorMap.get(indicator);
        if (newColor) {
          series.applyOptions({ color: newColor });
        }
      }
    }

    // Align with main chart
    const candlestickChart = candlestickChartRef.current;
    if (candles.length > 0 && candlestickChart) {
      requestAnimationFrame(() => {
        try {
          const logicalRange = candlestickChart.timeScale().getVisibleLogicalRange();
          if (logicalRange) {
            chart.timeScale().setVisibleLogicalRange(logicalRange);
          }
        } catch (error) {
          console.warn('Failed to sync time range from candlestick to indicator2:', error);
        }
      });
    }
  }, [enabledIndicators2, indicators, candles.length, colorMap]);

  // Effect to ensure charts maintain same width for alignment
  // Only sync once after mount/data updates, not repeatedly
  useEffect(() => {
    const syncWidths = () => {
      const candlestickContainer = candlestickContainerRef.current;
      const indicator1Container = indicator1ContainerRef.current;
      const indicator2Container = indicator2ContainerRef.current;
      const candlestickChart = candlestickChartRef.current;
      const indicator1Chart = indicator1ChartRef.current;
      const indicator2Chart = indicator2ChartRef.current;

      if (!candlestickContainer || !indicator1Container || !indicator2Container ||
          !candlestickChart || !indicator1Chart || !indicator2Chart) {
        return;
      }

      const width = Math.min(
        candlestickContainer.clientWidth,
        indicator1Container.clientWidth,
        indicator2Container.clientWidth
      );
      if (width > 0) {
        candlestickChart.applyOptions({ width });
        indicator1Chart.applyOptions({ width });
        indicator2Chart.applyOptions({ width });
      }
    };

    // Sync widths once after mount/data updates, not repeatedly
    const timeoutId = setTimeout(syncWidths, 50);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [candles.length, enabledIndicators1.size, enabledIndicators2.size]);

  // Update chart heights when indicator visibility changes
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      updateChartHeight(candlestickChartRef.current, candlestickContainerRef.current);
      if (enabledIndicators1.size > 0) {
        updateChartHeight(indicator1ChartRef.current, indicator1ContainerRef.current);
      }
      if (enabledIndicators2.size > 0) {
        updateChartHeight(indicator2ChartRef.current, indicator2ContainerRef.current);
      }
    });
  }, [enabledIndicators1.size, enabledIndicators2.size]);

  // Calculate flex ratios based on visible charts
  const hasIndicators1 = enabledIndicators1.size > 0;
  const hasIndicators2 = enabledIndicators2.size > 0;
  
  let candlestickFlex = '1';
  let indicator1Flex = '0';
  let indicator2Flex = '0';
  
  if (hasIndicators1 && hasIndicators2) {
    // All three charts: candlestick gets more space
    candlestickFlex = '2';
    indicator1Flex = '1';
    indicator2Flex = '1';
  } else if (hasIndicators1 || hasIndicators2) {
    // Two charts: split evenly
    candlestickFlex = '1';
    if (hasIndicators1) indicator1Flex = '1';
    if (hasIndicators2) indicator2Flex = '1';
  } else {
    // Only candlestick
    candlestickFlex = '1';
  }

  return (
    <div
      className="chart-panel flex flex-col h-full min-h-0"
      style={{ gap: '4px', overscrollBehavior: 'contain', touchAction: 'pan-y pinch-zoom' }}
      onWheel={(e) => {
        // Prevent horizontal scroll from triggering browser navigation
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="candlestick-chart-container min-h-0"
        style={{ flex: candlestickFlex, display: 'flex' }}
      >
        <div
          ref={candlestickContainerRef}
          className="w-full h-full"
          style={{ position: 'relative', overscrollBehavior: 'contain' }}
        />
      </div>
      <div
        className="indicator-chart-container min-h-0"
        style={{
          flex: indicator1Flex,
          display: hasIndicators1 ? 'flex' : 'none'
        }}
      >
        <div
          ref={indicator1ContainerRef}
          className="w-full h-full indicator-chart-disabled"
          style={{ position: 'relative', overscrollBehavior: 'contain' }}
        />
      </div>
      <div
        className="indicator-chart-container min-h-0"
        style={{
          flex: indicator2Flex,
          display: hasIndicators2 ? 'flex' : 'none'
        }}
      >
        <div
          ref={indicator2ContainerRef}
          className="w-full h-full indicator-chart-disabled"
          style={{ position: 'relative', overscrollBehavior: 'contain' }}
        />
      </div>
    </div>
  );
}
