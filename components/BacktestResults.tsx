'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType } from 'lightweight-charts';

interface BacktestMetrics {
  totalReturn: number;
  totalReturnPct: number;
  finalValue: number;
  initialValue: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  tradeCount: number;
  wonTrades?: number;
  lostTrades?: number;
  longestWinStreak?: number;
  longestLossStreak?: number;
  avgSlippagePct?: number;
  totalSlippageCost?: number;
  sameDayTrades?: number;
  nextOpenTrades?: number;
}

interface EquityPoint {
  date: string;
  value: number;
  cash?: number;
  shares?: number;
  stock_value?: number;
  positions?: Record<string, number>;
}

interface TradeMarker {
  signal_date?: string;
  execution_date?: string;
  date: string;
  type: 'buy' | 'sell';
  amount?: number;
  price?: number;
  signal_price?: number;
  size?: number;
  value?: number;
  commission?: number;
  execution_mode?: 'close' | 'next_open';
}

interface DateRange {
  startDate?: string;
  endDate?: string;
  dataPoints?: number;
}

interface StrategyInfo {
  name?: string;
  parameters?: Record<string, any>;
  initialCash?: number;
  commission?: number;
  datasetName?: string;
}

interface StockResult {
  datasetName: string;
  metrics: BacktestMetrics;
  equityCurve?: EquityPoint[];
  tradeMarkers?: TradeMarker[];
  dataPoints: number;
}

interface GroupBacktestResult {
  type: 'group';
  groupName: string;
  aggregatedMetrics: {
    totalReturn: number;
    totalReturnPct: number;
    avgFinalValue: number;
    avgMaxDrawdownPct: number;
    avgSharpeRatio: number;
    avgSortinoRatio: number;
    avgWinRate: number;
    totalTrades: number;
    stockCount: number;
  };
  stockResults: StockResult[];
  errors?: Array<{ datasetName: string; error: string }>;
}

interface PortfolioBacktestResult {
  type: 'portfolio';
  symbols: string[];
  metrics: BacktestMetrics;
  equityCurve: Array<{ date: string; value: number; cash?: number; shares?: number; positions?: Record<string, number> }>;
  tradeMarkers: TradeMarker[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  positionSnapshots?: Array<{
    date: string;
    positions: Record<string, { shares: number; value: number; percentOfPortfolio: number }>;
    cash: number;
    totalValue: number;
  }>;
  perSymbolMetrics?: Array<{
    symbol: string;
    totalReturn: number;
    totalReturnPct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    tradeCount: number;
    contributionToPortfolio: number;
    winRate: number;
  }>;
  perSymbolEquityCurves?: Record<string, Array<{ date: string; value: number; shares: number }>>;
  constraints?: any;
}

interface BacktestResultsProps {
  metrics?: BacktestMetrics;
  equityCurve?: EquityPoint[];
  tradeMarkers?: TradeMarker[];
  candles?: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  dateRange?: DateRange;
  strategyInfo?: StrategyInfo;
  groupResult?: GroupBacktestResult;
  portfolioResult?: PortfolioBacktestResult;
}

// Portfolio Backtest Results Component
function PortfolioBacktestResults({
  portfolioResult,
  strategyInfo,
}: {
  portfolioResult: PortfolioBacktestResult;
  strategyInfo?: StrategyInfo;
}) {
  const equityChartRef = useRef<HTMLDivElement>(null);
  const equityChartApiRef = useRef<IChartApi | null>(null);
  const equitySeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const drawdownChartRef = useRef<HTMLDivElement>(null);
  const drawdownChartApiRef = useRef<IChartApi | null>(null);
  const priceChartRef = useRef<HTMLDivElement>(null);
  const priceChartApiRef = useRef<IChartApi | null>(null);
  const priceChartContainerRef = useRef<HTMLDivElement>(null);
  const chartInitializedRef = useRef(false);
  const drawdownChartInitializedRef = useRef(false);
  const priceChartInitializedRef = useRef(false);

  // Stacked area chart refs for portfolio composition
  const stackedChartRef = useRef<HTMLDivElement>(null);
  const stackedChartApiRef = useRef<IChartApi | null>(null);
  const stackedChartInitializedRef = useRef(false);

  const [selectedTab, setSelectedTab] = useState<'metrics' | 'trades' | 'charts' | 'stocks'>('metrics');
  const [tradeSortField, setTradeSortField] = useState<'date' | 'size' | 'value'>('date');
  const [tradeSortDirection, setTradeSortDirection] = useState<'asc' | 'desc'>('asc');
  const [tradeFilter, setTradeFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string>(portfolioResult.symbols[0] || '');
  const [stockCandles, setStockCandles] = useState<Array<{ time: number; open: number; high: number; low: number; close: number }>>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(false);
  const [tradesPerPage, setTradesPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Hover state for nearest trade info
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [nearestLeftTrade, setNearestLeftTrade] = useState<any>(null);
  const [nearestRightTrade, setNearestRightTrade] = useState<any>(null);

  // Stock names mapping: code -> name
  const [stockNames, setStockNames] = useState<Record<string, string>>({});

  // Calculate drawdown data
  const drawdownData = useMemo(() => {
    const data: Array<{ date: string; drawdown: number; drawdownPct: number }> = [];
    let peak = portfolioResult.equityCurve[0]?.value || 0;

    portfolioResult.equityCurve.forEach(point => {
      if (point.value > peak) peak = point.value;
      const drawdown = peak - point.value;
      const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
      data.push({
        date: point.date,
        drawdown,
        drawdownPct: -drawdownPct,
      });
    });
    return data;
  }, [portfolioResult.equityCurve]);

  // Filter trade markers for selected stock
  const stockTradeMarkers = useMemo(() => {
    return portfolioResult.tradeMarkers.filter(trade => (trade as any).symbol === selectedStockSymbol);
  }, [portfolioResult.tradeMarkers, selectedStockSymbol]);

  // Filter candles by backtest date range
  const filteredStockCandles = useMemo(() => {
    if (!stockCandles.length || !portfolioResult.dateRange) return stockCandles;

    const startTime = new Date(portfolioResult.dateRange.startDate).getTime() / 1000;
    const endTime = new Date(portfolioResult.dateRange.endDate).getTime() / 1000;

    const filtered = stockCandles.filter(candle => candle.time >= startTime && candle.time <= endTime);

    console.log('Filtering candles:', {
      total: stockCandles.length,
      filtered: filtered.length,
      dateRange: portfolioResult.dateRange,
      startTime: new Date(startTime * 1000).toISOString(),
      endTime: new Date(endTime * 1000).toISOString(),
    });

    return filtered;
  }, [stockCandles, portfolioResult.dateRange]);

  // Load stock names from dataset metadata
  useEffect(() => {
    const loadStockNames = async () => {
      try {
        const response = await fetch('/api/datasets');
        if (!response.ok) return;

        const datasets = await response.json();
        const namesMap: Record<string, string> = {};

        datasets.forEach((dataset: any) => {
          // Extract stock code from filename (e.g., "000001" from "000001_stock_zh_a_hist.csv")
          const filenameWithoutExt = dataset.filename.replace(/\.csv$/i, '');
          const stockCode = filenameWithoutExt.split('_')[0];

          // Map code to name
          if (dataset.name) {
            namesMap[stockCode] = dataset.name;
          }
          // Also map by symbol if available
          if (dataset.symbol) {
            namesMap[dataset.symbol] = dataset.name;
          }
        });

        setStockNames(namesMap);
      } catch (error) {
        console.error('Failed to load stock names:', error);
      }
    };

    loadStockNames();
  }, []);

  // Helper function to get stock display name
  const getStockDisplayName = (symbol: string) => {
    const name = stockNames[symbol];
    return name ? `${name} (${symbol})` : symbol;
  };

  // Load candlestick data for selected stock
  useEffect(() => {
    if (!selectedStockSymbol || selectedTab !== 'charts') {
      setIsLoadingCandles(false);
      return;
    }

    const loadStockData = async () => {
      setIsLoadingCandles(true);
      setStockCandles([]); // Clear previous data

      try {
        console.log('Loading data for symbol:', selectedStockSymbol);

        // Find dataset metadata
        const metadataRes = await fetch('/api/datasets');
        if (!metadataRes.ok) {
          console.error('Failed to fetch datasets metadata:', metadataRes.statusText);
          setIsLoadingCandles(false);
          return;
        }

        const allDatasets = await metadataRes.json();
        console.log('All datasets:', allDatasets.map((d: any) => d.filename));
        console.log('Looking for symbol:', selectedStockSymbol);

        // Try to find dataset by stock code
        // The symbol is now just the stock code (e.g., "000001"), not the full filename
        let dataset = allDatasets.find((d: any) => {
          // Extract stock code from filename for comparison
          const filenameWithoutExt = d.filename.replace(/\.csv$/i, '');
          const stockCodeFromFilename = filenameWithoutExt.split('_')[0];

          // Match by stock code
          const stockCodeMatch = stockCodeFromFilename === selectedStockSymbol;

          // Also check if it's the full filename (backward compatibility)
          const exactFilenameMatch = d.filename === selectedStockSymbol;
          const symbolMatch = d.symbol === selectedStockSymbol;

          return stockCodeMatch || exactFilenameMatch || symbolMatch;
        });

        if (!dataset) {
          console.error('Dataset not found for symbol:', selectedStockSymbol);
          console.error('Available datasets:', allDatasets.map((d: any) => ({ filename: d.filename, symbol: d.symbol })));
          setIsLoadingCandles(false);
          return;
        }

        console.log('Found dataset:', dataset.filename);

        // Load the dataset using the correct API endpoint
        const dataRes = await fetch(`/api/dataset/${encodeURIComponent(dataset.filename)}`);
        if (!dataRes.ok) {
          console.error('Failed to load dataset:', dataRes.statusText);
          setIsLoadingCandles(false);
          return;
        }

        const data = await dataRes.json();
        console.log('API response type:', typeof data);
        console.log('API response keys:', Object.keys(data));

        // The API returns a DatasetData object with { meta, candles, indicators }
        // Extract the candles array
        let candles;

        if (data.candles && Array.isArray(data.candles)) {
          // Data is already in candle format with time (seconds)
          console.log('Using pre-formatted candles:', data.candles.length);
          candles = data.candles;
        } else if (Array.isArray(data)) {
          // Fallback: if data is already an array
          console.log('Converting raw data array:', data.length);
          candles = data.map((row: any) => ({
            time: new Date(row.date).getTime() / 1000,
            open: parseFloat(row.open),
            high: parseFloat(row.high),
            low: parseFloat(row.low),
            close: parseFloat(row.close),
          })).sort((a: any, b: any) => a.time - b.time);
        } else {
          console.error('Unexpected data format:', data);
          setIsLoadingCandles(false);
          return;
        }

        console.log('Final candles count:', candles.length);
        setStockCandles(candles);
        setIsLoadingCandles(false);
      } catch (error) {
        console.error('Failed to load stock data:', error);
        setIsLoadingCandles(false);
      }
    };

    loadStockData();
  }, [selectedStockSymbol, selectedTab]);

  // Initialize equity curve chart
  useEffect(() => {
    if (!equityChartRef.current || selectedTab !== 'metrics') {
      // Reset initialization flag when tab is not active
      if (selectedTab !== 'metrics') {
        chartInitializedRef.current = false;
      }
      return;
    }

    // Clean up old chart if it exists
    if (equityChartApiRef.current) {
      try {
        if (!(equityChartApiRef.current as any)._disposed) {
          equityChartApiRef.current.remove();
        }
      } catch (error) {
        console.warn('Chart cleanup warning:', error);
      }
      equityChartApiRef.current = null;
      equitySeriesRef.current = null;
      chartInitializedRef.current = false;
    }

    // Create new chart
    const chart = createChart(equityChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: equityChartRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
    });

    const series = chart.addLineSeries({
      color: '#2196F3',
      lineWidth: 2,
      title: 'Portfolio Value',
    });

    const chartData = portfolioResult.equityCurve.map((point) => ({
      time: new Date(point.date).getTime() / 1000 as any,
      value: point.value,
    }));

    series.setData(chartData);
    chart.timeScale().fitContent();

    equityChartApiRef.current = chart;
    equitySeriesRef.current = series;
    chartInitializedRef.current = true;

    const handleResize = () => {
      if (equityChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: equityChartRef.current.clientWidth });
        } catch (error) {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't remove chart here - let it persist for tab switching
    };
  }, [portfolioResult.equityCurve, selectedTab]);

  // Initialize drawdown chart
  useEffect(() => {
    if (!drawdownChartRef.current || selectedTab !== 'charts') {
      // Reset initialization flag when tab is not active
      if (selectedTab !== 'charts') {
        drawdownChartInitializedRef.current = false;
      }
      return;
    }

    // Clean up old chart if it exists
    if (drawdownChartApiRef.current) {
      try {
        if (!(drawdownChartApiRef.current as any)._disposed) {
          drawdownChartApiRef.current.remove();
        }
      } catch (error) {
        console.warn('Drawdown chart cleanup warning:', error);
      }
      drawdownChartApiRef.current = null;
      drawdownChartInitializedRef.current = false;
    }

    // Create new chart
    const chart = createChart(drawdownChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: drawdownChartRef.current.clientWidth,
      height: 300,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
      },
    });

    const areaSeries = chart.addAreaSeries({
      lineColor: '#ef5350',
      topColor: 'rgba(239, 83, 80, 0.4)',
      bottomColor: 'rgba(239, 83, 80, 0.0)',
      lineWidth: 2,
      priceFormat: {
        type: 'percent',
      },
    });

    const drawdownChartData = drawdownData.map(point => ({
      time: new Date(point.date).getTime() / 1000 as any,
      value: point.drawdownPct,
    }));
    areaSeries.setData(drawdownChartData);

    chart.timeScale().fitContent();
    drawdownChartApiRef.current = chart;
    drawdownChartInitializedRef.current = true;

    const handleResize = () => {
      if (drawdownChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: drawdownChartRef.current.clientWidth });
        } catch (error) {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't remove chart here - let it persist for tab switching
    };
  }, [drawdownData, selectedTab]);

  // Initialize price chart with buy/sell markers
  useEffect(() => {
    if (!priceChartContainerRef.current || !priceChartRef.current || selectedTab !== 'charts' || filteredStockCandles.length === 0) {
      // Reset initialization flag when tab is not active
      if (selectedTab !== 'charts') {
        priceChartInitializedRef.current = false;
      }
      return;
    }

    // Clean up old chart if it exists
    if (priceChartApiRef.current) {
      try {
        if (!(priceChartApiRef.current as any)._disposed) {
          priceChartApiRef.current.remove();
        }
      } catch (error) {
        console.warn('Price chart cleanup warning:', error);
      }
      priceChartApiRef.current = null;
      priceChartInitializedRef.current = false;
    }

    // Create new chart
    const chart = createChart(priceChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: priceChartRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    candlestickSeries.setData(filteredStockCandles as any);

    // Add buy/sell markers - show only B/S on chart
    const markers = stockTradeMarkers.map(trade => {
      const tradeTime = new Date(trade.execution_date || trade.date).getTime() / 1000;
      return {
        time: tradeTime,
        position: trade.type === 'buy' ? 'belowBar' : 'aboveBar',
        color: trade.type === 'buy' ? '#26a69a' : '#ef5350',
        shape: trade.type === 'buy' ? 'arrowUp' : 'arrowDown',
        text: trade.type === 'buy' ? 'B' : 'S',
      } as any;
    });

    candlestickSeries.setMarkers(markers);

    // Add custom tooltip for detailed trade information
    const container = priceChartContainerRef.current;
    const toolTipWidth = 200;
    const toolTipHeight = 100;
    const toolTipMargin = 15;

    // Create tooltip element
    const toolTip = document.createElement('div');
    toolTip.className = 'price-chart-tooltip';
    toolTip.style.width = toolTipWidth + 'px';
    toolTip.style.minHeight = toolTipHeight + 'px';
    toolTip.style.position = 'absolute';
    toolTip.style.display = 'none';
    toolTip.style.padding = '8px';
    toolTip.style.boxSizing = 'border-box';
    toolTip.style.fontSize = '12px';
    toolTip.style.textAlign = 'left';
    toolTip.style.zIndex = '1000';
    toolTip.style.pointerEvents = 'none';
    toolTip.style.border = '1px solid #2962FF';
    toolTip.style.borderRadius = '4px';
    toolTip.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    toolTip.style.background = 'rgba(255, 255, 255, 0.95)';
    toolTip.style.color = 'black';
    toolTip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    container.appendChild(toolTip);

    // Update tooltip and track hover for nearest trades
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        toolTip.style.display = 'none';
        setHoveredTime(null);
        setNearestLeftTrade(null);
        setNearestRightTrade(null);
        return;
      }

      const currentTime = param.time as number;
      setHoveredTime(currentTime);

      // Find nearest left and right trades
      let leftTrade = null;
      let rightTrade = null;
      let leftDistance = Infinity;
      let rightDistance = Infinity;

      stockTradeMarkers.forEach(trade => {
        const tradeTime = new Date(trade.execution_date || trade.date).getTime() / 1000;
        const distance = tradeTime - currentTime;

        if (distance <= 0 && Math.abs(distance) < leftDistance) {
          leftDistance = Math.abs(distance);
          leftTrade = trade;
        }
        if (distance > 0 && distance < rightDistance) {
          rightDistance = distance;
          rightTrade = trade;
        }
      });

      setNearestLeftTrade(leftTrade);
      setNearestRightTrade(rightTrade);

      // Find if there's a trade at this exact time for tooltip
      const trade = stockTradeMarkers.find(t => {
        const tradeTime = new Date(t.execution_date || t.date).getTime() / 1000;
        return tradeTime === param.time;
      });

      if (trade) {
        toolTip.style.display = 'block';

        // Position tooltip
        const y = param.point.y;
        const left = param.point.x + toolTipMargin;

        if (left + toolTipWidth > container.clientWidth) {
          toolTip.style.left = (param.point.x - toolTipWidth - toolTipMargin) + 'px';
        } else {
          toolTip.style.left = left + 'px';
        }

        if (y - toolTipHeight - toolTipMargin < 0) {
          toolTip.style.top = (y + toolTipMargin) + 'px';
        } else {
          toolTip.style.top = (y - toolTipHeight - toolTipMargin) + 'px';
        }

        const typeText = trade.type === 'buy' ? 'BUY' : 'SELL';
        const typeColor = trade.type === 'buy' ? '#26a69a' : '#ef5350';

        toolTip.innerHTML = `
          <div style="color: ${typeColor}; font-weight: bold; font-size: 14px; margin-bottom: 6px;">${typeText}</div>
          <div style="margin-bottom: 2px;"><strong>Date:</strong> ${trade.execution_date || trade.date}</div>
          <div style="margin-bottom: 2px;"><strong>Price:</strong> ¥${trade.price?.toFixed(2)}</div>
          <div style="margin-bottom: 2px;"><strong>Size:</strong> ${trade.size}</div>
          <div><strong>Value:</strong> ¥${trade.value?.toFixed(2)}</div>
        `;
      } else {
        toolTip.style.display = 'none';
      }
    });

    chart.timeScale().fitContent();

    priceChartApiRef.current = chart;
    priceChartInitializedRef.current = true;

    const handleResize = () => {
      if (priceChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: priceChartRef.current.clientWidth });
        } catch (error) {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Clean up tooltip
      if (toolTip && toolTip.parentNode) {
        toolTip.parentNode.removeChild(toolTip);
      }
    };
  }, [filteredStockCandles, stockTradeMarkers, selectedTab]);

  // Colors for stacked areas - bright solid colors
  const areaColors = [
    { line: '#a78bfa', top: '#a78bfa', bottom: '#a78bfa' }, // Bright Purple
    { line: '#60a5fa', top: '#60a5fa', bottom: '#60a5fa' }, // Bright Blue
    { line: '#34d399', top: '#34d399', bottom: '#34d399' }, // Bright Green
    { line: '#fbbf24', top: '#fbbf24', bottom: '#fbbf24' }, // Bright Yellow/Orange
    { line: '#f87171', top: '#f87171', bottom: '#f87171' }, // Bright Red
    { line: '#22d3ee', top: '#22d3ee', bottom: '#22d3ee' }, // Bright Cyan
    { line: '#f472b6', top: '#f472b6', bottom: '#f472b6' }, // Bright Pink
    { line: '#2dd4bf', top: '#2dd4bf', bottom: '#2dd4bf' }, // Bright Teal
  ];
  const cashColor = { line: '#d1d5db', top: '#d1d5db', bottom: '#d1d5db' }; // Light Gray for cash

  // Initialize stacked area chart for portfolio composition
  useEffect(() => {
    if (!stackedChartRef.current || !portfolioResult.perSymbolEquityCurves || !portfolioResult.equityCurve || selectedTab !== 'metrics') {
      // Reset initialization flag when tab is not active
      if (selectedTab !== 'metrics') {
        stackedChartInitializedRef.current = false;
      }
      return;
    }

    if (stackedChartInitializedRef.current) {
      return;
    }

    // Clean up old chart if it exists
    if (stackedChartApiRef.current) {
      try {
        if (!(stackedChartApiRef.current as any)._disposed) {
          stackedChartApiRef.current.remove();
        }
      } catch (error) {
        console.warn('Stacked chart cleanup warning:', error);
      }
      stackedChartApiRef.current = null;
      stackedChartInitializedRef.current = false;
    }

    // Create new chart
    const chart = createChart(stackedChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: stackedChartRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
        scaleMargins: {
          top: 0.1,
          bottom: 0,
        },
        autoScale: true,
        mode: 0, // Normal price scale mode
      },
      localization: {
        priceFormatter: (price: number) => {
          if (price === 0) return '0';
          return price.toExponential(2);
        },
      },
    });

    // Prepare stacked data
    // We need to create cumulative layers: cash, cash+stock1, cash+stock1+stock2, etc.
    const symbols = portfolioResult.symbols || [];
    const dates = portfolioResult.equityCurve.map(p => p.date);

    // Build a map of date -> { cash, stockValues }
    const dateMap = new Map<string, { cash: number; stockValues: Record<string, number>; total: number }>();

    portfolioResult.equityCurve.forEach((point, idx) => {
      const stockValues: Record<string, number> = {};
      symbols.forEach(symbol => {
        const symbolCurve = portfolioResult.perSymbolEquityCurves![symbol];
        if (symbolCurve && symbolCurve[idx]) {
          stockValues[symbol] = symbolCurve[idx].value;
        } else {
          stockValues[symbol] = 0;
        }
      });

      dateMap.set(point.date, {
        cash: point.cash || 0,
        stockValues,
        total: point.value,
      });
    });

    // Create layers from top to bottom: total, total-stock1, total-stock1-stock2, ..., cash
    const layers: Array<{ label: string; color: typeof areaColors[0]; data: Array<{ time: any; value: number }> }> = [];

    // Layer 0: Total portfolio value (top line) - colored with first stock's color
    layers.push({
      label: symbols[0] || 'Stock 1',
      color: areaColors[0],
      data: dates.map(date => {
        const point = dateMap.get(date)!;
        return {
          time: new Date(date).getTime() / 1000 as any,
          value: point.total,
        };
      }),
    });

    // Layer 1...N-1: Subtract stocks one by one from total
    for (let i = 1; i < symbols.length; i++) {
      const layerData = dates.map(date => {
        const point = dateMap.get(date)!;
        // Start from total and subtract all stocks from 0 to i-1
        let value = point.total;
        for (let j = 0; j < i; j++) {
          value -= point.stockValues[symbols[j]] || 0;
        }
        return {
          time: new Date(date).getTime() / 1000 as any,
          value: value,
        };
      });

      layers.push({
        label: symbols[i],
        color: areaColors[i % areaColors.length],
        data: layerData,
      });
    }

    // Last layer: Cash only (bottom line)
    layers.push({
      label: 'Cash',
      color: cashColor,
      data: dates.map(date => {
        const point = dateMap.get(date)!;
        return {
          time: new Date(date).getTime() / 1000 as any,
          value: point.cash,
        };
      }),
    });

    // Add area series in FORWARD order (total first, cash last)
    // Since all areas extend down to 0, lower values need to render on top to be visible
    // This creates the stacked effect where gaps between lines show each component
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const areaSeries = chart.addAreaSeries({
        lineColor: layer.color.line,
        topColor: layer.color.top,
        bottomColor: layer.color.bottom,
        lineWidth: 2,
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });
      areaSeries.setData(layer.data);
    }

    chart.timeScale().fitContent();

    // Ensure the chart always shows 0 at the bottom
    // Add a hidden baseline series at 0 to force the chart to include 0
    const baselineSeries = chart.addLineSeries({
      color: 'transparent',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    baselineSeries.setData(dates.map(date => ({
      time: new Date(date).getTime() / 1000 as any,
      value: 0,
    })));

    stackedChartApiRef.current = chart;
    stackedChartInitializedRef.current = true;

    const handleResize = () => {
      if (stackedChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: stackedChartRef.current.clientWidth });
        } catch (error) {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [portfolioResult.perSymbolEquityCurves, portfolioResult.equityCurve, portfolioResult.symbols, selectedTab]);

  const formatNumber = (value: number, decimals: number = 2): string => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(decimals) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(decimals) + 'K';
    }
    return value.toFixed(decimals);
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Filtered and sorted trades
  const processedTrades = useMemo(() => {
    let filtered = portfolioResult.tradeMarkers.filter(trade => {
      if (tradeFilter !== 'all' && trade.type !== tradeFilter) return false;
      if (symbolFilter && !(trade as any).symbol?.includes(symbolFilter)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (tradeSortField) {
        case 'date':
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
          break;
        case 'size':
          aVal = a.size || 0;
          bVal = b.size || 0;
          break;
        case 'value':
          aVal = a.value || 0;
          bVal = b.value || 0;
          break;
        default:
          return 0;
      }

      if (tradeSortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [portfolioResult.tradeMarkers, tradeFilter, symbolFilter, tradeSortField, tradeSortDirection]);

  // Paginated trades
  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * tradesPerPage;
    const end = start + tradesPerPage;
    return processedTrades.slice(start, end);
  }, [processedTrades, currentPage, tradesPerPage]);

  const totalPages = Math.ceil(processedTrades.length / tradesPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [tradeFilter, symbolFilter, tradeSortField, tradeSortDirection]);

  return (
    <div>
      {/* Header Section */}
      {strategyInfo && (
        <div className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg border border-blue-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-medium">Strategy:</span>{' '}
              <span className="font-semibold">{strategyInfo.name || 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-600 font-medium">Portfolio:</span>{' '}
              <span className="font-semibold text-gray-800">
                {portfolioResult.symbols.length} stocks with shared capital
              </span>
            </div>
            {strategyInfo.parameters && Object.keys(strategyInfo.parameters).length > 0 && (
              <div>
                <span className="text-gray-600 font-medium">Parameters:</span>{' '}
                <span className="text-gray-800">
                  {Object.entries(strategyInfo.parameters).map(([key, val]) => `${key}=${val}`).join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="relative group bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Initial Capital</div>
          <div className="text-2xl font-bold text-blue-900">
            RMB {formatNumber(portfolioResult.metrics.initialValue)}
          </div>
        </div>
        <div className="relative group bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Final Value</div>
          <div className="text-2xl font-bold text-purple-900">
            RMB {formatNumber(portfolioResult.metrics.finalValue)}
          </div>
        </div>
        <div className={`relative group p-4 rounded-lg border cursor-help bg-gradient-to-br ${
          portfolioResult.metrics.totalReturnPct >= 0
            ? 'from-green-50 to-green-100 border-green-200'
            : 'from-red-50 to-red-100 border-red-200'
        }`}>
          <div className="text-xs text-gray-600 mb-1">Total Return</div>
          <div className={`text-2xl font-bold ${
            portfolioResult.metrics.totalReturnPct >= 0 ? 'text-green-700' : 'text-red-700'
          }`}>
            {formatPercent(portfolioResult.metrics.totalReturnPct)}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            RMB {formatNumber(Math.abs(portfolioResult.metrics.totalReturn))}
          </div>
        </div>
        <div className="relative group bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Total Trades</div>
          <div className="text-2xl font-bold text-orange-900">
            {portfolioResult.metrics.tradeCount}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {portfolioResult.metrics.wonTrades || 0}W / {portfolioResult.metrics.lostTrades || 0}L
          </div>
        </div>
        <div className="relative group bg-gradient-to-br from-teal-50 to-teal-100 p-4 rounded-lg border border-teal-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Stocks</div>
          <div className="text-2xl font-bold text-teal-900">
            {portfolioResult.symbols.length}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Portfolio
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex justify-between items-center mb-4 border-b">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedTab('metrics')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'metrics'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Performance Metrics
          </button>
          <button
            onClick={() => setSelectedTab('trades')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'trades'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Trade List ({portfolioResult.tradeMarkers.length})
          </button>
          <button
            onClick={() => setSelectedTab('charts')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'charts'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Charts
          </button>
          <button
            onClick={() => setSelectedTab('stocks')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'stocks'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Per-Stock Analysis
          </button>
        </div>
      </div>

      {/* Performance Metrics Tab */}
      {selectedTab === 'metrics' && (
        <div>
          {/* Total Equity Curve */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="text-green-600">📈</span> Total Portfolio Equity Curve
            </h3>
            <div className="bg-white p-4 rounded-lg border shadow-sm">
              <div ref={equityChartRef} />
            </div>
          </div>

          {/* Stacked Area Chart - Portfolio Composition */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="text-blue-600">📊</span> Portfolio Composition Over Time
            </h3>
            <div className="bg-white p-4 rounded-lg border shadow-sm">
              <div ref={stackedChartRef} />

              {/* Legend Panel - Below Chart */}
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm font-semibold mb-3 text-gray-700">Legend (Top to Bottom)</div>
                <div className="flex flex-wrap gap-4">
                  {/* Stocks (from top to bottom) */}
                  {(portfolioResult.symbols || []).map((symbol, idx) => (
                    <div key={symbol} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: areaColors[idx % areaColors.length].line }}></div>
                      <span className="text-sm text-gray-700">{symbol}</span>
                    </div>
                  ))}
                  {/* Cash (bottom) */}
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: cashColor.line }}></div>
                    <span className="text-sm text-gray-700">Cash</span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  Each colored area shows the value of that component. The gap between two lines represents one component's value.
                </div>
              </div>
            </div>
          </div>

          {/* Risk Metrics */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-600 mb-1">Max Drawdown</div>
              <div className="text-2xl font-bold text-red-600">
                {formatPercent(portfolioResult.metrics.maxDrawdownPct)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                RMB {formatNumber(portfolioResult.metrics.maxDrawdown)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-600 mb-1">Sharpe Ratio</div>
              <div className="text-2xl font-bold text-gray-800">
                {portfolioResult.metrics.sharpeRatio.toFixed(2)}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-sm text-gray-600 mb-1">Sortino Ratio</div>
              <div className="text-2xl font-bold text-gray-800">
                {portfolioResult.metrics.sortinoRatio.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Trading Performance */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Trading Performance</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded border">
                <div className="text-xs text-gray-500 mb-1">Win Rate</div>
                <div className="text-xl font-semibold">{(portfolioResult.metrics.winRate * 100).toFixed(1)}%</div>
              </div>
              <div className="bg-gray-50 p-4 rounded border">
                <div className="text-xs text-gray-500 mb-1">Profit Factor</div>
                <div className="text-xl font-semibold">{portfolioResult.metrics.profitFactor.toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded border">
                <div className="text-xs text-gray-500 mb-1">Avg Win</div>
                <div className="text-xl font-semibold text-green-600">¥{portfolioResult.metrics.avgWin.toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded border">
                <div className="text-xs text-gray-500 mb-1">Avg Loss</div>
                <div className="text-xl font-semibold text-red-600">¥{portfolioResult.metrics.avgLoss.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trade List Tab */}
      {selectedTab === 'trades' && (
        <div>
          {/* Filters */}
          <div className="mb-4 flex gap-4">
            <div>
              <label className="text-sm text-gray-600 mr-2">Type:</label>
              <select
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value as any)}
                className="border rounded px-3 py-1"
              >
                <option value="all">All</option>
                <option value="buy">Buy Only</option>
                <option value="sell">Sell Only</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 mr-2">Symbol:</label>
              <input
                type="text"
                placeholder="Filter by symbol..."
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                className="border rounded px-3 py-1"
              />
            </div>
          </div>

          {/* Trade Table */}
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th
                      className="text-left py-3 px-4 font-semibold text-sm cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        if (tradeSortField === 'date') {
                          setTradeSortDirection(tradeSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setTradeSortField('date');
                          setTradeSortDirection('asc');
                        }
                      }}
                    >
                      Date {tradeSortField === 'date' && (tradeSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Symbol</th>
                    <th className="text-left py-3 px-4 font-semibold text-sm">Type</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Price</th>
                    <th
                      className="text-right py-3 px-4 font-semibold text-sm cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        if (tradeSortField === 'size') {
                          setTradeSortDirection(tradeSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setTradeSortField('size');
                          setTradeSortDirection('desc');
                        }
                      }}
                    >
                      Size {tradeSortField === 'size' && (tradeSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-right py-3 px-4 font-semibold text-sm cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        if (tradeSortField === 'value') {
                          setTradeSortDirection(tradeSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setTradeSortField('value');
                          setTradeSortDirection('desc');
                        }
                      }}
                    >
                      Value {tradeSortField === 'value' && (tradeSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-sm">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTrades.map((trade, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm font-mono">{trade.execution_date || trade.date}</td>
                      <td className="py-3 px-4 font-medium">{(trade as any).symbol || 'N/A'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                          trade.type === 'buy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {trade.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono">¥{trade.price?.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono">{trade.size?.toFixed(0)}</td>
                      <td className="py-3 px-4 text-right font-mono">¥{trade.value?.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono text-gray-500">¥{trade.commission?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                Showing {processedTrades.length === 0 ? 0 : (currentPage - 1) * tradesPerPage + 1} to{' '}
                {Math.min(currentPage * tradesPerPage, processedTrades.length)} of {processedTrades.length} trades
              </span>
              <select
                value={tradesPerPage}
                onChange={(e) => {
                  setTradesPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm">
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Charts Tab */}
      {selectedTab === 'charts' && (
        <div className="space-y-6">
          {/* Stock Selector */}
          <div className="bg-white p-4 rounded-lg border">
            <label className="text-sm font-medium text-gray-700 mr-3">Select Stock:</label>
            <select
              value={selectedStockSymbol}
              onChange={(e) => setSelectedStockSymbol(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            >
              {portfolioResult.symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {getStockDisplayName(symbol)}
                </option>
              ))}
            </select>
            <span className="ml-3 text-sm text-gray-500">
              {stockTradeMarkers.length} trades for this stock
            </span>
          </div>

          {/* Price Chart with Buy/Sell Markers */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="text-blue-600">📊</span> {getStockDisplayName(selectedStockSymbol)} - Price Chart with Buy/Sell Signals
            </h3>
            <div className="bg-white p-4 rounded-lg border shadow-sm">
              {isLoadingCandles ? (
                <div className="text-center py-12 text-gray-500">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
                  <p className="text-sm">Loading chart data for {getStockDisplayName(selectedStockSymbol)}...</p>
                  <p className="text-xs mt-2 text-gray-400">Check browser console for details if this takes too long</p>
                </div>
              ) : filteredStockCandles.length > 0 ? (
                <>
                  <div ref={priceChartContainerRef} style={{ position: 'relative' }}>
                    <div ref={priceChartRef} />
                  </div>

                  {/* Trade Detail Panels */}
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    {/* Nearest Left Trade */}
                    <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                      <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                        Previous Trade
                      </h4>
                      {nearestLeftTrade ? (
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Type:</span>
                            <span className={`font-medium ${nearestLeftTrade.type === 'buy' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                              {nearestLeftTrade.type === 'buy' ? 'Buy' : 'Sell'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Date:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {nearestLeftTrade.execution_date || nearestLeftTrade.date}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Price:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              ¥{nearestLeftTrade.price?.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Size:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {nearestLeftTrade.size}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Value:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              ¥{nearestLeftTrade.value?.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Execution:</span>
                            <span className="font-medium text-gray-900 dark:text-white text-xs">
                              {nearestLeftTrade.execution_mode === 'close' ? 'Same Day Close' : 'Next Open'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 dark:text-gray-500 italic">
                          No previous trade
                        </div>
                      )}
                    </div>

                    {/* Nearest Right Trade */}
                    <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                      <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                        Next Trade
                      </h4>
                      {nearestRightTrade ? (
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Type:</span>
                            <span className={`font-medium ${nearestRightTrade.type === 'buy' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                              {nearestRightTrade.type === 'buy' ? 'Buy' : 'Sell'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Date:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {nearestRightTrade.execution_date || nearestRightTrade.date}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Price:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              ¥{nearestRightTrade.price?.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Size:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {nearestRightTrade.size}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Value:</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              ¥{nearestRightTrade.value?.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Execution:</span>
                            <span className="font-medium text-gray-900 dark:text-white text-xs">
                              {nearestRightTrade.execution_mode === 'close' ? 'Same Day Close' : 'Next Open'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 dark:text-gray-500 italic">
                          No next trade
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : stockCandles.length > 0 && filteredStockCandles.length === 0 ? (
                <div className="text-center py-12 text-yellow-50 border border-yellow-200 rounded">
                  <p className="text-sm text-yellow-800 font-medium">No data available in the selected date range</p>
                  <p className="text-xs mt-2 text-yellow-600">The backtest date range may not overlap with available stock data</p>
                </div>
              ) : (
                <div className="text-center py-12 text-red-50 border border-red-200 rounded">
                  <p className="text-sm text-red-800 font-medium">Unable to load chart data for {getStockDisplayName(selectedStockSymbol)}</p>
                  <p className="text-xs mt-2 text-red-600">Please check the browser console for error details</p>
                </div>
              )}
            </div>
          </div>

          {/* Portfolio Drawdown */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="text-red-600">📉</span> Portfolio Drawdown
            </h3>
            <div className="bg-white p-4 rounded-lg border shadow-sm">
              <div ref={drawdownChartRef} />
            </div>
          </div>
        </div>
      )}

      {/* Per-Stock Analysis Tab */}
      {selectedTab === 'stocks' && portfolioResult.perSymbolMetrics && portfolioResult.perSymbolMetrics.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Symbol</th>
                  <th className="text-right py-3 px-4 font-semibold">Return</th>
                  <th className="text-right py-3 px-4 font-semibold">Return %</th>
                  <th className="text-right py-3 px-4 font-semibold">Sharpe</th>
                  <th className="text-right py-3 px-4 font-semibold">Max DD %</th>
                  <th className="text-right py-3 px-4 font-semibold">Trades</th>
                  <th className="text-right py-3 px-4 font-semibold">Win Rate</th>
                  <th className="text-right py-3 px-4 font-semibold">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {portfolioResult.perSymbolMetrics.map((stock) => (
                  <tr key={stock.symbol} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{stock.symbol}</td>
                    <td className={`text-right py-3 px-4 font-mono ${stock.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ¥{stock.totalReturn.toFixed(2)}
                    </td>
                    <td className={`text-right py-3 px-4 font-mono ${stock.totalReturnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(stock.totalReturnPct)}
                    </td>
                    <td className="text-right py-3 px-4 font-mono">{stock.sharpeRatio.toFixed(2)}</td>
                    <td className="text-right py-3 px-4 font-mono text-red-600">{formatPercent(stock.maxDrawdownPct)}</td>
                    <td className="text-right py-3 px-4">{stock.tradeCount}</td>
                    <td className="text-right py-3 px-4 font-mono">{(stock.winRate * 100).toFixed(1)}%</td>
                    <td className={`text-right py-3 px-4 font-mono ${stock.contributionToPortfolio >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ¥{stock.contributionToPortfolio.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Group Backtest Results Component
function GroupBacktestResults({
  groupResult,
  dateRange,
  strategyInfo,
}: {
  groupResult: GroupBacktestResult;
  dateRange?: DateRange;
  strategyInfo?: StrategyInfo;
}) {
  const [sortField, setSortField] = useState<'name' | 'return' | 'trades'>('return');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set());
  const [stockCandles, setStockCandles] = useState<Record<string, any>>({});

  const formatNumber = (value: number, decimals: number = 2): string => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(decimals) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(decimals) + 'K';
    }
    return value.toFixed(decimals);
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const toggleExpanded = async (datasetName: string) => {
    const newExpanded = new Set(expandedStocks);
    if (newExpanded.has(datasetName)) {
      newExpanded.delete(datasetName);
    } else {
      newExpanded.add(datasetName);
      // Load candles if not already loaded
      if (!stockCandles[datasetName]) {
        try {
          let apiName = datasetName.replace(/\.csv$/i, '');
          const response = await fetch(`/api/dataset/${encodeURIComponent(apiName)}`);
          const data = await response.json();
          if (!data.error) {
            setStockCandles(prev => ({ ...prev, [datasetName]: data }));
          }
        } catch (err) {
          console.error('Failed to load candles for', datasetName, err);
        }
      }
    }
    setExpandedStocks(newExpanded);
  };

  const sortedStocks = [...groupResult.stockResults].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    if (sortField === 'name') {
      return multiplier * a.datasetName.localeCompare(b.datasetName);
    } else if (sortField === 'return') {
      return multiplier * (a.metrics.totalReturnPct - b.metrics.totalReturnPct);
    } else {
      return multiplier * (a.metrics.tradeCount - b.metrics.tradeCount);
    }
  });

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2">Group Backtest Results</h2>
        <div className="text-gray-600">
          <span className="font-medium">{groupResult.groupName}</span>
          {strategyInfo?.name && <span> • Strategy: {strategyInfo.name}</span>}
          {dateRange?.startDate && dateRange?.endDate && (
            <span> • {dateRange.startDate} to {dateRange.endDate}</span>
          )}
        </div>
      </div>

      {/* Aggregated Metrics */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-4">Aggregated Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
            <div className="text-sm text-gray-600 mb-1">Stocks</div>
            <div className="text-3xl font-bold text-blue-900">
              {groupResult.aggregatedMetrics.stockCount}
            </div>
          </div>

          <div className={`bg-gradient-to-br p-4 rounded-lg border ${
            groupResult.aggregatedMetrics.totalReturnPct >= 0
              ? 'from-green-50 to-green-100 border-green-200'
              : 'from-red-50 to-red-100 border-red-200'
          }`}>
            <div className="text-sm text-gray-600 mb-1">Avg Return</div>
            <div className={`text-3xl font-bold ${
              groupResult.aggregatedMetrics.totalReturnPct >= 0 ? 'text-green-700' : 'text-red-700'
            }`}>
              {formatPercent(groupResult.aggregatedMetrics.totalReturnPct)}
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
            <div className="text-sm text-gray-600 mb-1">Avg Win Rate</div>
            <div className="text-3xl font-bold text-yellow-900">
              {groupResult.aggregatedMetrics.avgWinRate.toFixed(1)}%
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
            <div className="text-sm text-gray-600 mb-1">Total Trades</div>
            <div className="text-3xl font-bold text-purple-900">
              {groupResult.aggregatedMetrics.totalTrades}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border">
            <div className="text-sm text-gray-600 mb-1">Avg Sharpe</div>
            <div className="text-2xl font-bold">
              {groupResult.aggregatedMetrics.avgSharpeRatio.toFixed(3)}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border">
            <div className="text-sm text-gray-600 mb-1">Avg Sortino</div>
            <div className="text-2xl font-bold">
              {groupResult.aggregatedMetrics.avgSortinoRatio.toFixed(3)}
            </div>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200">
            <div className="text-sm text-gray-600 mb-1">Avg Max DD</div>
            <div className="text-2xl font-bold text-red-600">
              {formatPercent(groupResult.aggregatedMetrics.avgMaxDrawdownPct)}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border">
            <div className="text-sm text-gray-600 mb-1">Avg Final Value</div>
            <div className="text-2xl font-bold">
              RMB {formatNumber(groupResult.aggregatedMetrics.avgFinalValue)}
            </div>
          </div>
        </div>
      </div>

      {/* Individual Stock Results */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-4">Individual Stock Results</h3>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-3 text-left font-semibold w-12">Details</th>
                <th
                  className="border p-3 text-left font-semibold cursor-pointer hover:bg-gray-200"
                  onClick={() => {
                    if (sortField === 'name') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('name');
                      setSortDirection('asc');
                    }
                  }}
                >
                  Stock {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="border p-3 text-right font-semibold cursor-pointer hover:bg-gray-200"
                  onClick={() => {
                    if (sortField === 'return') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('return');
                      setSortDirection('desc');
                    }
                  }}
                >
                  Return % {sortField === 'return' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="border p-3 text-right font-semibold">Final Value</th>
                <th className="border p-3 text-right font-semibold">Max DD %</th>
                <th className="border p-3 text-right font-semibold">Sharpe</th>
                <th className="border p-3 text-right font-semibold">Win Rate</th>
                <th
                  className="border p-3 text-right font-semibold cursor-pointer hover:bg-gray-200"
                  onClick={() => {
                    if (sortField === 'trades') {
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('trades');
                      setSortDirection('desc');
                    }
                  }}
                >
                  Trades {sortField === 'trades' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStocks.map((stock, idx) => (
                <>
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="border p-3">
                      <button
                        onClick={() => toggleExpanded(stock.datasetName)}
                        className="px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                        title={expandedStocks.has(stock.datasetName) ? "Hide details" : "Show details"}
                      >
                        {expandedStocks.has(stock.datasetName) ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="border p-3 font-medium">
                      {stock.datasetName.replace(/\.csv$/i, '')}
                    </td>
                    <td className={`border p-3 text-right font-mono font-semibold ${
                      stock.metrics.totalReturnPct >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatPercent(stock.metrics.totalReturnPct)}
                    </td>
                    <td className="border p-3 text-right font-mono">
                      RMB {formatNumber(stock.metrics.finalValue)}
                    </td>
                    <td className="border p-3 text-right font-mono text-red-600">
                      {formatPercent(stock.metrics.maxDrawdownPct)}
                    </td>
                    <td className="border p-3 text-right font-mono">
                      {stock.metrics.sharpeRatio.toFixed(2)}
                    </td>
                    <td className="border p-3 text-right font-mono">
                      {stock.metrics.winRate.toFixed(1)}%
                    </td>
                    <td className="border p-3 text-right">
                      {stock.metrics.tradeCount}
                    </td>
                  </tr>
                  {expandedStocks.has(stock.datasetName) && (
                    <tr key={`${idx}-expanded`}>
                      <td colSpan={8} className="border p-0">
                        <div className="bg-gray-50 p-6">
                          {stockCandles[stock.datasetName] ? (
                            <BacktestResults
                              metrics={stock.metrics}
                              equityCurve={stock.equityCurve || []}
                              tradeMarkers={stock.tradeMarkers || []}
                              candles={stockCandles[stock.datasetName].candles}
                              dateRange={dateRange}
                              strategyInfo={{
                                ...strategyInfo,
                                datasetName: stock.datasetName,
                              }}
                            />
                          ) : (
                            <div className="text-center py-8">
                              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                              <p className="mt-2 text-gray-600">Loading chart data...</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Errors */}
      {groupResult.errors && groupResult.errors.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-4 text-red-600">Errors</h3>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            {groupResult.errors.map((error, idx) => (
              <div key={idx} className="mb-2 last:mb-0">
                <span className="font-medium">{error.datasetName}:</span> {error.error}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BacktestResults({
  metrics,
  equityCurve,
  tradeMarkers,
  candles,
  dateRange,
  strategyInfo,
  groupResult,
  portfolioResult,
}: BacktestResultsProps) {
  // If portfolioResult is provided, render portfolio backtest UI
  if (portfolioResult) {
    return <PortfolioBacktestResults portfolioResult={portfolioResult} strategyInfo={strategyInfo} />;
  }

  // If groupResult is provided, render group backtest UI
  if (groupResult) {
    return <GroupBacktestResults groupResult={groupResult} dateRange={dateRange} strategyInfo={strategyInfo} />;
  }

  // Otherwise, render single stock backtest UI
  if (!metrics || !equityCurve || !tradeMarkers || !candles) {
    return null;
  }
  const equityChartRef = useRef<HTMLDivElement>(null);
  const equityChartApiRef = useRef<IChartApi | null>(null);
  const equitySeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const stackedChartRef = useRef<HTMLDivElement>(null);
  const stackedChartApiRef = useRef<IChartApi | null>(null);
  const priceChartRef = useRef<HTMLDivElement>(null);
  const priceChartApiRef = useRef<IChartApi | null>(null);
  const drawdownChartRef = useRef<HTMLDivElement>(null);
  const drawdownChartApiRef = useRef<IChartApi | null>(null);

  const [selectedTab, setSelectedTab] = useState<'metrics' | 'trades' | 'charts' | 'analysis'>('metrics');
  const [tradeSortField, setTradeSortField] = useState<'date' | 'size' | 'value'>('date');
  const [tradeSortDirection, setTradeSortDirection] = useState<'asc' | 'desc'>('asc');
  const [tradeFilter, setTradeFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const [tradesPerPage, setTradesPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [nearestLeftTrade, setNearestLeftTrade] = useState<any>(null);
  const [nearestRightTrade, setNearestRightTrade] = useState<any>(null);

  const chartInitializedRef = useRef(false);
  const stackedChartInitializedRef = useRef(false);
  const priceChartInitializedRef = useRef(false);
  const drawdownChartInitializedRef = useRef(false);

  // Calculate Buy & Hold comparison
  const buyHoldMetrics = useMemo(() => {
    if (candles.length < 2) return null;
    const firstPrice = candles[0].open;
    const lastPrice = candles[candles.length - 1].close;
    const buyHoldReturn = lastPrice - firstPrice;
    const buyHoldReturnPct = (buyHoldReturn / firstPrice) * 100;
    const outperformance = metrics.totalReturnPct - buyHoldReturnPct;
    return { buyHoldReturn, buyHoldReturnPct, outperformance };
  }, [candles, metrics.totalReturnPct]);

  // Calculate Drawdown data
  const drawdownData = useMemo(() => {
    const data: Array<{ date: string; drawdown: number; drawdownPct: number }> = [];
    let peak = equityCurve[0]?.value || 0;

    equityCurve.forEach(point => {
      if (point.value > peak) peak = point.value;
      const drawdown = peak - point.value;
      const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
      data.push({
        date: point.date,
        drawdown,
        drawdownPct: -drawdownPct, // Negative for chart display
      });
    });
    return data;
  }, [equityCurve]);

  // Calculate Monthly Performance
  const monthlyPerformance = useMemo(() => {
    const monthlyData: Record<string, { returns: number[]; trades: number; wins: number }> = {};

    equityCurve.forEach((point, idx) => {
      if (idx === 0) return;
      const date = new Date(point.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { returns: [], trades: 0, wins: 0 };
      }

      const prevValue = equityCurve[idx - 1].value;
      const returnPct = ((point.value - prevValue) / prevValue) * 100;
      monthlyData[monthKey].returns.push(returnPct);
    });

    tradeMarkers.forEach(trade => {
      const date = new Date(trade.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].trades++;
      }
    });

    return Object.entries(monthlyData).map(([month, data]) => ({
      month,
      year: month.split('-')[0],
      return: data.returns.reduce((sum, r) => sum + r, 0),
      trades: data.trades,
      avgReturn: data.returns.length > 0 ? data.returns.reduce((sum, r) => sum + r, 0) / data.returns.length : 0,
    })).sort((a, b) => a.month.localeCompare(b.month));
  }, [equityCurve, tradeMarkers]);

  // Get available years and set default selected year
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(monthlyPerformance.map(m => m.year))).sort();
    return years;
  }, [monthlyPerformance]);

  // Set default selected year on mount or when years change
  useEffect(() => {
    if (availableYears.length > 0 && !selectedYear) {
      setSelectedYear(availableYears[availableYears.length - 1]); // Default to most recent year
    }
  }, [availableYears, selectedYear]);

  // Filter monthly performance by selected year
  const filteredMonthlyPerformance = useMemo(() => {
    if (!selectedYear) return monthlyPerformance;
    return monthlyPerformance.filter(m => m.year === selectedYear);
  }, [monthlyPerformance, selectedYear]);

  // Calculate Advanced Metrics
  const advancedMetrics = useMemo(() => {
    const expectancy = (metrics.avgWin * (metrics.winRate / 100)) - (Math.abs(metrics.avgLoss) * ((100 - metrics.winRate) / 100));
    const recoveryFactor = metrics.maxDrawdown > 0 ? metrics.totalReturn / metrics.maxDrawdown : 0;
    const payoffRatio = Math.abs(metrics.avgLoss) > 0 ? metrics.avgWin / Math.abs(metrics.avgLoss) : 0;

    // Calculate consecutive wins/losses
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    const sortedTrades = [...tradeMarkers].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sortedTrades.length - 1; i += 2) {
      if (i + 1 >= sortedTrades.length) break;
      const buyTrade = sortedTrades[i];
      const sellTrade = sortedTrades[i + 1];
      if (buyTrade.type === 'buy' && sellTrade.type === 'sell') {
        const pnl = (sellTrade.price || 0) - (buyTrade.price || 0);
        if (pnl > 0) {
          currentWinStreak++;
          currentLossStreak = 0;
          maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
        } else {
          currentLossStreak++;
          currentWinStreak = 0;
          maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
        }
      }
    }

    // Calculate average holding period
    let totalHoldingDays = 0;
    let completedTrades = 0;
    for (let i = 0; i < sortedTrades.length - 1; i += 2) {
      if (i + 1 >= sortedTrades.length) break;
      const buyTrade = sortedTrades[i];
      const sellTrade = sortedTrades[i + 1];
      if (buyTrade.type === 'buy' && sellTrade.type === 'sell') {
        const buyDate = new Date(buyTrade.date);
        const sellDate = new Date(sellTrade.date);
        const holdingDays = (sellDate.getTime() - buyDate.getTime()) / (1000 * 60 * 60 * 24);
        totalHoldingDays += holdingDays;
        completedTrades++;
      }
    }
    const avgHoldingPeriod = completedTrades > 0 ? totalHoldingDays / completedTrades : 0;

    return {
      expectancy,
      recoveryFactor,
      payoffRatio,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      avgHoldingPeriod,
    };
  }, [metrics, tradeMarkers]);

  // Calculate Returns Distribution
  const returnsDistribution = useMemo(() => {
    const returns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prevValue = equityCurve[i - 1].value;
      const currValue = equityCurve[i].value;
      const returnPct = ((currValue - prevValue) / prevValue) * 100;
      returns.push(returnPct);
    }

    // Create histogram bins
    const bins = 20;
    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const binSize = (max - min) / bins;
    const histogram = Array(bins).fill(0);

    returns.forEach(ret => {
      const binIndex = Math.min(Math.floor((ret - min) / binSize), bins - 1);
      histogram[binIndex]++;
    });

    return {
      returns,
      histogram: histogram.map((count, idx) => ({
        bin: min + (idx * binSize),
        count,
      })),
      mean: returns.reduce((sum, r) => sum + r, 0) / returns.length,
      stdDev: Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - (returns.reduce((s, x) => s + x, 0) / returns.length), 2), 0) / returns.length),
    };
  }, [equityCurve]);

  // Performance Warnings
  const warnings = useMemo(() => {
    const warns: string[] = [];

    if (metrics.tradeCount < 10) {
      warns.push(`Low sample size (${metrics.tradeCount} trades) - results may not be statistically significant`);
    }
    if (metrics.maxDrawdownPct > 30) {
      warns.push(`High drawdown (${metrics.maxDrawdownPct.toFixed(1)}%) - consider improving risk management`);
    }
    if (metrics.sharpeRatio < 1) {
      warns.push(`Low Sharpe Ratio (${metrics.sharpeRatio.toFixed(2)}) - poor risk-adjusted returns`);
    }
    if (metrics.winRate < 40) {
      warns.push(`Low win rate (${metrics.winRate.toFixed(1)}%) - strategy may be too aggressive`);
    }
    if (advancedMetrics.payoffRatio < 1.5 && metrics.winRate < 50) {
      warns.push(`Low payoff ratio (${advancedMetrics.payoffRatio.toFixed(2)}) with low win rate - unsustainable strategy`);
    }

    return warns;
  }, [metrics, advancedMetrics]);

  // Filtered and sorted trades
  const processedTrades = useMemo(() => {
    let filtered = tradeMarkers.filter(trade => {
      if (tradeFilter === 'all') return true;
      return trade.type === tradeFilter;
    });

    filtered.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (tradeSortField) {
        case 'date':
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
          break;
        case 'size':
          aVal = a.size || 0;
          bVal = b.size || 0;
          break;
        case 'value':
          aVal = a.value || 0;
          bVal = b.value || 0;
          break;
        default:
          return 0;
      }

      if (tradeSortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [tradeMarkers, tradeFilter, tradeSortField, tradeSortDirection]);

  // Paginated trades
  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * tradesPerPage;
    const end = start + tradesPerPage;
    return processedTrades.slice(start, end);
  }, [processedTrades, currentPage, tradesPerPage]);

  const totalPages = Math.ceil(processedTrades.length / tradesPerPage);

  // Initialize equity curve chart
  useEffect(() => {
    if (!equityChartRef.current) return;
    
    // Only initialize once, but allow re-initialization if chart was disposed
    if (chartInitializedRef.current && equityChartApiRef.current && !(equityChartApiRef.current as any)._disposed) {
      return;
    }

    // Clean up existing chart if any
    if (equityChartApiRef.current) {
      try {
        // Check if chart is still valid before removing
        if (equityChartApiRef.current && !(equityChartApiRef.current as any)._disposed) {
          equityChartApiRef.current.remove();
        }
      } catch (error) {
        // Chart might already be disposed, ignore error
        console.warn('Chart cleanup warning:', error);
      }
      equityChartApiRef.current = null;
      equitySeriesRef.current = null;
    }

    const chart = createChart(equityChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: equityChartRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
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
    });

    // Scientific notation formatter for y-axis
    const scientificFormatter = (price: number) => {
      if (price === 0) return '0';
      const absPrice = Math.abs(price);
      if (absPrice >= 1 || absPrice < 0.0001) {
        return price.toExponential(2);
      }
      // For values between 0.0001 and 1, use regular notation with appropriate precision
      return price.toFixed(4);
    };

    const series = chart.addLineSeries({
      color: '#2196F3',
      lineWidth: 2,
      title: 'Equity Curve',
      priceFormat: {
        type: 'custom',
        formatter: scientificFormatter,
        minMove: 0.0001,
      },
    });

    // Convert equity curve to chart format
    const chartData = equityCurve.map((point) => ({
      time: new Date(point.date).getTime() / 1000 as any,
      value: point.value,
    }));

    series.setData(chartData);
    chart.timeScale().fitContent();

    equityChartApiRef.current = chart;
    equitySeriesRef.current = series;
    chartInitializedRef.current = true;

    // Handle resize
    const handleResize = () => {
      if (equityChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: equityChartRef.current.clientWidth });
        } catch (error) {
          // Chart might be disposed, ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't remove chart on cleanup - keep it alive for tab switching
    };
  }, [equityCurve]);

  // Update chart data when equity curve changes (but don't recreate chart)
  useEffect(() => {
    if (equitySeriesRef.current && equityCurve.length > 0) {
      const chartData = equityCurve.map((point) => ({
        time: new Date(point.date).getTime() / 1000 as any,
        value: point.value,
      }));
      equitySeriesRef.current.setData(chartData);
      if (equityChartApiRef.current && !(equityChartApiRef.current as any)._disposed) {
        try {
          equityChartApiRef.current.timeScale().fitContent();
        } catch (error) {
          // Ignore errors
        }
      }
    }
  }, [equityCurve]);

  // Initialize stacked area chart for portfolio composition
  useEffect(() => {
    if (!stackedChartRef.current || !equityCurve || equityCurve.length === 0 || selectedTab !== 'metrics') {
      if (selectedTab !== 'metrics') {
        stackedChartInitializedRef.current = false;
      }
      return;
    }

    if (stackedChartInitializedRef.current) {
      return;
    }

    // Clean up old chart if it exists
    if (stackedChartApiRef.current) {
      try {
        if (!(stackedChartApiRef.current as any)._disposed) {
          stackedChartApiRef.current.remove();
        }
      } catch (error) {
        console.warn('Stacked chart cleanup warning:', error);
      }
      stackedChartApiRef.current = null;
      stackedChartInitializedRef.current = false;
    }

    // Create new chart
    const chart = createChart(stackedChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: stackedChartRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
        scaleMargins: {
          top: 0.1,
          bottom: 0,
        },
        autoScale: true,
        mode: 0,
      },
      localization: {
        priceFormatter: (price: number) => {
          if (price === 0) return '0';
          return price.toExponential(2);
        },
      },
    });

    const dates = equityCurve.map(p => p.date);

    // Colors for stacked areas
    const stockColor = { line: '#60a5fa', top: '#60a5fa', bottom: '#60a5fa' }; // Bright Blue for stock
    const cashColor = { line: '#d1d5db', top: '#d1d5db', bottom: '#d1d5db' }; // Light Gray for cash

    // Create layers: total (top), cash (bottom)
    const layers = [];

    // Layer 0: Total equity value (top line)
    layers.push({
      label: 'Stock',
      color: stockColor,
      data: equityCurve.map(point => ({
        time: new Date(point.date).getTime() / 1000 as any,
        value: point.value,
      })),
    });

    // Layer 1: Cash only (bottom line)
    layers.push({
      label: 'Cash',
      color: cashColor,
      data: equityCurve.map(point => ({
        time: new Date(point.date).getTime() / 1000 as any,
        value: point.cash || 0,
      })),
    });

    // Add area series in forward order (total first, cash last)
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const areaSeries = chart.addAreaSeries({
        lineColor: layer.color.line,
        topColor: layer.color.top,
        bottomColor: layer.color.bottom,
        lineWidth: 2,
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });
      areaSeries.setData(layer.data);
    }

    chart.timeScale().fitContent();

    // Ensure the chart always shows 0 at the bottom
    const baselineSeries = chart.addLineSeries({
      color: 'transparent',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    baselineSeries.setData(dates.map(date => ({
      time: new Date(date).getTime() / 1000 as any,
      value: 0,
    })));

    stackedChartApiRef.current = chart;
    stackedChartInitializedRef.current = true;

    const handleResize = () => {
      if (stackedChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: stackedChartRef.current.clientWidth });
        } catch (error) {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [equityCurve, selectedTab]);

  // Update chart when tab changes to metrics (to ensure it's visible and properly sized)
  useEffect(() => {
    if (selectedTab === 'metrics' && equityChartApiRef.current && equityChartRef.current) {
      // Force chart to resize and redraw when switching back to metrics tab
      // Use double requestAnimationFrame to ensure DOM is fully updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (equityChartRef.current && equityChartApiRef.current) {
            try {
              const chart = equityChartApiRef.current;
              if (!(chart as any)._disposed) {
                const width = equityChartRef.current.clientWidth;
                if (width > 0) {
                  chart.applyOptions({ width });
                  chart.timeScale().fitContent();
                }
              }
            } catch (error) {
              // Chart might be disposed, try to reinitialize
              console.warn('Chart resize warning, reinitializing:', error);
              chartInitializedRef.current = false;
              // Trigger re-initialization by clearing refs
              equityChartApiRef.current = null;
              equitySeriesRef.current = null;
            }
          }
        });
      });
    }
  }, [selectedTab]);

  // Initialize Price Chart with Trade Markers - always initialize, persist across tabs
  useEffect(() => {
    if (!priceChartRef.current) return;

    if (priceChartInitializedRef.current && priceChartApiRef.current && !(priceChartApiRef.current as any)._disposed) {
      return;
    }

    // Clean up existing chart
    if (priceChartApiRef.current) {
      try {
        if (!(priceChartApiRef.current as any)._disposed) {
          priceChartApiRef.current.remove();
        }
      } catch (error) {
        console.warn('Price chart cleanup warning:', error);
      }
      priceChartApiRef.current = null;
    }

    const chart = createChart(priceChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: priceChartRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Set candlestick data
    const candleData = candles.map(candle => ({
      time: candle.time as any,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    candlestickSeries.setData(candleData);

    // Add trade markers
    const markers = tradeMarkers.map(trade => {
      const tradeTime = new Date(trade.date).getTime() / 1000;
      return {
        time: tradeTime as any,
        position: trade.type === 'buy' ? 'belowBar' : 'aboveBar',
        color: trade.type === 'buy' ? '#2196F3' : '#f44336',
        shape: trade.type === 'buy' ? 'arrowUp' : 'arrowDown',
        text: trade.type === 'buy' ? 'B' : 'S',
      } as any;
    });
    candlestickSeries.setMarkers(markers);

    chart.timeScale().fitContent();
    priceChartApiRef.current = chart;
    priceChartInitializedRef.current = true;

    // Add crosshair move listener to track hover and find nearest trades
    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const hoveredTimestamp = param.time as number;
        setHoveredTime(hoveredTimestamp);

        // Find nearest left and right trades
        const sortedTrades = [...tradeMarkers].sort((a, b) => {
          const timeA = new Date(a.date).getTime() / 1000;
          const timeB = new Date(b.date).getTime() / 1000;
          return timeA - timeB;
        });

        // Find nearest left trade (trade before or at hover time)
        let leftTrade = null;
        for (let i = sortedTrades.length - 1; i >= 0; i--) {
          const tradeTime = new Date(sortedTrades[i].date).getTime() / 1000;
          if (tradeTime <= hoveredTimestamp) {
            leftTrade = sortedTrades[i];
            break;
          }
        }

        // Find nearest right trade (trade after hover time)
        let rightTrade = null;
        for (let i = 0; i < sortedTrades.length; i++) {
          const tradeTime = new Date(sortedTrades[i].date).getTime() / 1000;
          if (tradeTime > hoveredTimestamp) {
            rightTrade = sortedTrades[i];
            break;
          }
        }

        setNearestLeftTrade(leftTrade);
        setNearestRightTrade(rightTrade);
      } else {
        // Mouse left the chart
        setHoveredTime(null);
      }
    });

    const handleResize = () => {
      if (priceChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: priceChartRef.current.clientWidth });
        } catch (error) {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't remove chart on cleanup - keep it alive for tab switching
    };
  }, [candles, tradeMarkers]);

  // Update price chart when tab changes to charts (to ensure it's visible and properly sized)
  useEffect(() => {
    if (selectedTab === 'charts' && priceChartApiRef.current && priceChartRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (priceChartRef.current && priceChartApiRef.current) {
            try {
              const chart = priceChartApiRef.current;
              if (!(chart as any)._disposed) {
                const width = priceChartRef.current.clientWidth;
                if (width > 0) {
                  chart.applyOptions({ width });
                  chart.timeScale().fitContent();
                }
              }
            } catch (error) {
              console.warn('Price chart resize warning:', error);
              priceChartInitializedRef.current = false;
              priceChartApiRef.current = null;
            }
          }
        });
      });
    }
  }, [selectedTab]);

  // Initialize Drawdown Chart - always initialize, persist across tabs
  useEffect(() => {
    if (!drawdownChartRef.current) return;

    if (drawdownChartInitializedRef.current && drawdownChartApiRef.current && !(drawdownChartApiRef.current as any)._disposed) {
      return;
    }

    // Clean up existing chart
    if (drawdownChartApiRef.current) {
      try {
        if (!(drawdownChartApiRef.current as any)._disposed) {
          drawdownChartApiRef.current.remove();
        }
      } catch (error) {
        console.warn('Drawdown chart cleanup warning:', error);
      }
      drawdownChartApiRef.current = null;
    }

    const chart = createChart(drawdownChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: drawdownChartRef.current.clientWidth,
      height: 300,
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#d1d4dc',
      },
    });

    const areaSeries = chart.addAreaSeries({
      lineColor: '#ef5350',
      topColor: 'rgba(239, 83, 80, 0.4)',
      bottomColor: 'rgba(239, 83, 80, 0.0)',
      lineWidth: 2,
      priceFormat: {
        type: 'percent',
      },
    });

    // Set drawdown data
    const drawdownChartData = drawdownData.map(point => ({
      time: new Date(point.date).getTime() / 1000 as any,
      value: point.drawdownPct,
    }));
    areaSeries.setData(drawdownChartData);

    chart.timeScale().fitContent();
    drawdownChartApiRef.current = chart;
    drawdownChartInitializedRef.current = true;

    const handleResize = () => {
      if (drawdownChartRef.current && chart && !(chart as any)._disposed) {
        try {
          chart.applyOptions({ width: drawdownChartRef.current.clientWidth });
        } catch (error) {
          // Ignore
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Don't remove chart on cleanup - keep it alive for tab switching
    };
  }, [drawdownData]);

  // Update drawdown chart when tab changes to charts (to ensure it's visible and properly sized)
  useEffect(() => {
    if (selectedTab === 'charts' && drawdownChartApiRef.current && drawdownChartRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (drawdownChartRef.current && drawdownChartApiRef.current) {
            try {
              const chart = drawdownChartApiRef.current;
              if (!(chart as any)._disposed) {
                const width = drawdownChartRef.current.clientWidth;
                if (width > 0) {
                  chart.applyOptions({ width });
                  chart.timeScale().fitContent();
                }
              }
            } catch (error) {
              console.warn('Drawdown chart resize warning:', error);
              drawdownChartInitializedRef.current = false;
              drawdownChartApiRef.current = null;
            }
          }
        });
      });
    }
  }, [selectedTab]);

  const formatNumber = (value: number, decimals: number = 2): string => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(decimals) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(decimals) + 'K';
    }
    return value.toFixed(decimals);
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const handleExportJSON = () => {
    const exportData = {
      exportDate: new Date().toISOString(),
      strategyInfo,
      dateRange,
      metrics,
      advancedMetrics,
      buyHoldComparison: buyHoldMetrics,
      equityCurve,
      drawdownData,
      trades: tradeMarkers,
      monthlyPerformance,
      returnsDistribution: {
        mean: returnsDistribution.mean,
        stdDev: returnsDistribution.stdDev,
        histogram: returnsDistribution.histogram,
      },
      warnings,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const strategyName = strategyInfo?.name || 'strategy';
    a.download = `${strategyName}-backtest-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    // Create CSV header
    let csv = 'Backtest Results Export\n\n';

    // Strategy Info
    if (strategyInfo) {
      csv += 'Strategy Information\n';
      csv += 'Field,Value\n';
      csv += `Strategy Name,${strategyInfo.name || 'N/A'}\n`;
      csv += `Initial Cash,${strategyInfo.initialCash || 'N/A'}\n`;
      csv += `Commission,${strategyInfo.commission || 'N/A'}\n`;
      if (strategyInfo.parameters) {
        csv += `Parameters,${JSON.stringify(strategyInfo.parameters)}\n`;
      }
      csv += '\n';
    }

    // Date Range
    if (dateRange) {
      csv += 'Date Range\n';
      csv += `Start Date,${dateRange.startDate || 'N/A'}\n`;
      csv += `End Date,${dateRange.endDate || 'N/A'}\n`;
      csv += `Data Points,${dateRange.dataPoints || 'N/A'}\n`;
      csv += '\n';
    }

    // Buy & Hold Comparison
    if (buyHoldMetrics) {
      csv += 'Buy & Hold Comparison\n';
      csv += 'Metric,Value\n';
      csv += `Strategy Return,${metrics.totalReturnPct.toFixed(2)}%\n`;
      csv += `Buy & Hold Return,${buyHoldMetrics.buyHoldReturnPct.toFixed(2)}%\n`;
      csv += `Outperformance,${buyHoldMetrics.outperformance.toFixed(2)}%\n`;
      csv += '\n';
    }

    // Summary metrics
    csv += 'Performance Metrics\n';
    csv += 'Metric,Value\n';
    csv += `Initial Capital,${metrics.initialValue}\n`;
    csv += `Final Value,${metrics.finalValue}\n`;
    csv += `Total Return,${metrics.totalReturn}\n`;
    csv += `Total Return %,${metrics.totalReturnPct}%\n`;
    csv += `Max Drawdown,${metrics.maxDrawdown}\n`;
    csv += `Max Drawdown %,${metrics.maxDrawdownPct}%\n`;
    csv += `Sharpe Ratio,${metrics.sharpeRatio}\n`;
    csv += `Sortino Ratio,${metrics.sortinoRatio}\n`;
    csv += `Calmar Ratio,${metrics.calmarRatio}\n`;
    csv += `Win Rate,${metrics.winRate}%\n`;
    csv += `Profit Factor,${metrics.profitFactor}\n`;
    csv += `Total Trades,${metrics.tradeCount}\n`;
    csv += `Winning Trades,${metrics.wonTrades || 0}\n`;
    csv += `Losing Trades,${metrics.lostTrades || 0}\n`;
    csv += `Average Win,${metrics.avgWin}\n`;
    csv += `Average Loss,${metrics.avgLoss}\n`;
    csv += '\n';

    // Advanced Metrics
    csv += 'Advanced Metrics\n';
    csv += 'Metric,Value\n';
    csv += `Expectancy,${advancedMetrics.expectancy.toFixed(2)}\n`;
    csv += `Recovery Factor,${advancedMetrics.recoveryFactor.toFixed(2)}\n`;
    csv += `Payoff Ratio,${advancedMetrics.payoffRatio.toFixed(2)}\n`;
    csv += `Max Consecutive Wins,${advancedMetrics.maxConsecutiveWins}\n`;
    csv += `Max Consecutive Losses,${advancedMetrics.maxConsecutiveLosses}\n`;
    csv += `Avg Holding Period (days),${advancedMetrics.avgHoldingPeriod.toFixed(1)}\n`;
    csv += '\n';

    // Warnings
    if (warnings.length > 0) {
      csv += 'Performance Warnings\n';
      warnings.forEach(warn => {
        csv += `"${warn}"\n`;
      });
      csv += '\n';
    }

    // Monthly Performance
    csv += 'Monthly Performance\n';
    csv += 'Month,Return %,Trades,Avg Daily Return %\n';
    monthlyPerformance.forEach(month => {
      csv += `${month.month},${month.return.toFixed(2)},${month.trades},${month.avgReturn.toFixed(3)}\n`;
    });
    csv += '\n';

    // Add trades table
    csv += 'Trade History\n';
    csv += 'Date,Type,Price,Size,Value,Commission\n';
    tradeMarkers.forEach(trade => {
      csv += `${trade.date},${trade.type},${trade.price || ''},${trade.size || ''},${trade.value || ''},${trade.commission || ''}\n`;
    });
    csv += '\n';

    // Add equity curve
    csv += 'Equity Curve\n';
    csv += 'Date,Portfolio Value\n';
    equityCurve.forEach(point => {
      csv += `${point.date},${point.value}\n`;
    });
    csv += '\n';

    // Add drawdown data
    csv += 'Drawdown Data\n';
    csv += 'Date,Drawdown,Drawdown %\n';
    drawdownData.forEach(point => {
      csv += `${point.date},${point.drawdown.toFixed(2)},${point.drawdownPct.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const strategyName = strategyInfo?.name || 'strategy';
    a.download = `${strategyName}-backtest-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Strategy Info */}
      {strategyInfo && (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-medium">Strategy:</span>{' '}
              <span className="font-semibold">{strategyInfo.name || 'N/A'}</span>
              {warnings.length > 0 && (
                <div className="relative group">
                  <span className="text-yellow-600 font-bold text-lg cursor-help">⚠️</span>
                  {/* Tooltip */}
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50">
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-lg p-3 min-w-[300px] max-w-[500px]">
                      <div className="font-semibold text-yellow-800 mb-2">Performance Warnings</div>
                      <ul className="space-y-1">
                        {warnings.map((warn, idx) => (
                          <li key={idx} className="text-sm text-yellow-700">• {warn}</li>
                        ))}
                      </ul>
                      {/* Arrow */}
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-yellow-300"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {strategyInfo.datasetName && (
              <div>
                <span className="text-gray-600 font-medium">Dataset:</span>{' '}
                <span className="font-semibold text-gray-800">
                  {strategyInfo.datasetName.replace(/\.csv$/i, '')}
                </span>
              </div>
            )}
            {strategyInfo.parameters && Object.keys(strategyInfo.parameters).length > 0 && (
              <div>
                <span className="text-gray-600 font-medium">Parameters:</span>{' '}
                <span className="text-gray-800">
                  {Object.entries(strategyInfo.parameters).map(([key, val]) => `${key}=${val}`).join(', ')}
                </span>
              </div>
            )}
            {metrics && (metrics.sameDayTrades !== undefined || metrics.nextOpenTrades !== undefined) && (
              <div>
                <span className="text-gray-600 font-medium">Execution:</span>{' '}
                <span className="font-semibold">
                  {metrics.sameDayTrades || 0} same-day,{' '}
                  {metrics.nextOpenTrades || 0} next-day
                </span>
              </div>
            )}
            {metrics?.avgSlippagePct !== undefined && (
              <div>
                <span className="text-gray-600 font-medium">Avg Slippage:</span>{' '}
                <span className={`font-semibold ${metrics.avgSlippagePct >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {metrics.avgSlippagePct >= 0 ? '+' : ''}{metrics.avgSlippagePct.toFixed(3)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Section */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="relative group bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Initial Capital</div>
          <div className="text-2xl font-bold text-blue-900">
            RMB {formatNumber(metrics.initialValue)}
          </div>
          {/* Tooltip */}
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
            <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
              <div className="font-semibold mb-1">Initial Capital</div>
              <div>Starting cash available for trading at the beginning of the backtest period.</div>
              {/* Arrow */}
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        <div className="relative group bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Final Value</div>
          <div className="text-2xl font-bold text-purple-900">
            RMB {formatNumber(metrics.finalValue)}
          </div>
          {/* Tooltip */}
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
            <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
              <div className="font-semibold mb-1">Final Value</div>
              <div>Total portfolio value (cash + stock holdings) at the end of the backtest period.</div>
              {/* Arrow */}
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        <div className={`relative group p-4 rounded-lg border cursor-help bg-gradient-to-br ${
          metrics.totalReturnPct >= 0
            ? 'from-green-50 to-green-100 border-green-200'
            : 'from-red-50 to-red-100 border-red-200'
        }`}>
          <div className="text-xs text-gray-600 mb-1">Total Return</div>
          <div className={`text-2xl font-bold ${
            metrics.totalReturnPct >= 0 ? 'text-green-700' : 'text-red-700'
          }`}>
            {formatPercent(metrics.totalReturnPct)}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            RMB {formatNumber(Math.abs(metrics.totalReturn))}
          </div>
          {/* Tooltip */}
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
            <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
              <div className="font-semibold mb-1">Total Return</div>
              <div className="mb-1">Calculation: (Final Value - Initial Capital) / Initial Capital × 100%</div>
              <div>Measures the overall profit or loss as a percentage of your starting capital.</div>
              {/* Arrow */}
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        <div className="relative group bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200 cursor-help">
          <div className="text-xs text-gray-600 mb-1">Total Trades</div>
          <div className="text-2xl font-bold text-orange-900">
            {metrics.tradeCount}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {metrics.wonTrades || 0}W / {metrics.lostTrades || 0}L
          </div>
          {/* Tooltip */}
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
            <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
              <div className="font-semibold mb-1">Total Trades</div>
              <div>Number of completed buy-sell pairs (round trips). A winning trade has sell price {'>'} buy price, losing trade has sell price ≤ buy price.</div>
              {/* Arrow */}
              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
        {buyHoldMetrics && (
          <div className={`relative group p-4 rounded-lg border cursor-help bg-gradient-to-br ${
            buyHoldMetrics.outperformance >= 0
              ? 'from-teal-50 to-teal-100 border-teal-200'
              : 'from-rose-50 to-rose-100 border-rose-200'
          }`}>
            <div className="text-xs text-gray-600 mb-1">vs Buy & Hold</div>
            <div className={`text-2xl font-bold ${
              buyHoldMetrics.outperformance >= 0 ? 'text-teal-700' : 'text-rose-700'
            }`}>
              {formatPercent(buyHoldMetrics.outperformance)}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              B&H: {formatPercent(buyHoldMetrics.buyHoldReturnPct)}
            </div>
            {/* Tooltip */}
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
              <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                <div className="font-semibold mb-1">vs Buy & Hold</div>
                <div className="mb-1">Calculation: Strategy Return % - Buy & Hold Return %</div>
                <div>Compares your strategy's performance against simply buying and holding the stock. Positive = outperformed buy & hold.</div>
                {/* Arrow */}
                <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs and Export Buttons */}
      <div className="flex justify-between items-center mb-4 border-b">
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedTab('metrics')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'metrics'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Performance Metrics
          </button>
          <button
            onClick={() => setSelectedTab('trades')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'trades'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Trade List ({tradeMarkers.length})
          </button>
          <button
            onClick={() => setSelectedTab('charts')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'charts'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Charts
          </button>
          <button
            onClick={() => setSelectedTab('analysis')}
            className={`px-6 py-3 font-medium transition-colors ${
              selectedTab === 'analysis'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Analysis
          </button>
        </div>

        <div className="flex gap-2 pb-2">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
            title="Export as CSV"
          >
            Export CSV
          </button>
          <button
            onClick={handleExportJSON}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            title="Export as JSON"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Always render chart container to keep it alive, but conditionally show content */}
      <div className={selectedTab === 'metrics' ? 'space-y-4' : 'hidden'}>
        {/* Total Equity Curve Chart */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="text-green-600">📈</span> Total Equity Curve
          </h3>
          <div
            className="w-full"
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y pinch-zoom' }}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
              }
            }}
          >
            <div ref={equityChartRef} className="border rounded bg-white w-full" style={{ height: '400px', minHeight: '400px', overscrollBehavior: 'contain' }} />
          </div>
        </div>

        {/* Portfolio Composition Stacked Area Chart */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="text-blue-600">📊</span> Portfolio Composition Over Time
          </h3>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div ref={stackedChartRef} />

            {/* Legend Panel - Below Chart */}
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm font-semibold mb-3 text-gray-700">Legend (Top to Bottom)</div>
              <div className="flex flex-wrap gap-4">
                {/* Stock */}
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#60a5fa' }}></div>
                  <span className="text-sm text-gray-700">Stock Value</span>
                </div>
                {/* Cash */}
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#d1d5db' }}></div>
                  <span className="text-sm text-gray-700">Cash</span>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Each colored area shows the value of that component. The gap between the top line and cash line represents the stock value.
              </div>
            </div>
          </div>
        </div>

        {selectedTab === 'metrics' && (
          <>

          {/* Performance Metrics Grid */}
          <div className="space-y-6">
            {/* Risk-Adjusted Returns */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Risk-Adjusted Performance</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="relative group bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Max Drawdown</div>
                  <div className="text-2xl font-bold text-red-600">
                    {formatPercent(metrics.maxDrawdownPct)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    RMB {formatNumber(metrics.maxDrawdown)}
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Maximum Drawdown</div>
                      <div className="mb-1">Peak-to-trough decline during the backtest period.</div>
                      <div>Measures the largest loss from a portfolio peak. Lower is better. Shows worst-case scenario risk.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Sharpe Ratio</div>
                  <div className="text-2xl font-bold">
                    {metrics.sharpeRatio.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Annualized</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Sharpe Ratio</div>
                      <div className="mb-1">Calculation: (Mean Return × √252) / Std Dev of Returns</div>
                      <div>Risk-adjusted return metric. Higher is better. &gt;1 is good, &gt;2 is very good, &gt;3 is excellent.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Sortino Ratio</div>
                  <div className="text-2xl font-bold">
                    {metrics.sortinoRatio.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Downside Risk</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Sortino Ratio</div>
                      <div className="mb-1">Calculation: (Mean Return × √252) / Downside Deviation</div>
                      <div>Like Sharpe but only penalizes downside volatility. Better for asymmetric returns. Higher is better.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Calmar Ratio</div>
                  <div className="text-2xl font-bold">
                    {metrics.calmarRatio.toFixed(3)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Return/Drawdown</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Calmar Ratio</div>
                      <div className="mb-1">Calculation: Annual Return / Max Drawdown %</div>
                      <div>Return per unit of drawdown risk. Higher is better. &gt;3 is good, &gt;5 is excellent.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Profit Factor</div>
                  <div className="text-2xl font-bold">
                    {metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Wins/Losses</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Profit Factor</div>
                      <div className="mb-1">Calculation: Total Winning P&L / Total Losing P&L</div>
                      <div>Gross profit divided by gross loss. &gt;1.5 is good, &gt;2 is very good. &lt;1 means losing strategy.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Trade Statistics */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Trade Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Total Trades</div>
                  <div className="text-2xl font-bold">
                    {metrics.tradeCount}
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Total Trades</div>
                      <div>Number of completed round-trip trades (buy-sell pairs). Not individual buy or sell orders.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Winning Trades</div>
                  <div className="text-2xl font-bold text-green-600">
                    {metrics.wonTrades || 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {metrics.tradeCount > 0 ? ((metrics.wonTrades || 0) / metrics.tradeCount * 100).toFixed(1) : 0}%
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Winning Trades</div>
                      <div>Number of profitable trades where sell price {'>'} buy price. Percentage shows proportion of total trades.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Losing Trades</div>
                  <div className="text-2xl font-bold text-red-600">
                    {metrics.lostTrades || 0}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {metrics.tradeCount > 0 ? ((metrics.lostTrades || 0) / metrics.tradeCount * 100).toFixed(1) : 0}%
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Losing Trades</div>
                      <div>Number of unprofitable trades where sell price ≤ buy price. Percentage shows proportion of total trades.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Win Rate</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {metrics.winRate.toFixed(1)}%
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Win Rate</div>
                      <div className="mb-1">Calculation: Winning Trades / Total Trades × 100%</div>
                      <div>Percentage of profitable trades. &gt;50% is good, but profitability also depends on win/loss size ratio.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Avg Win</div>
                  <div className="text-2xl font-bold text-green-600">
                    RMB {formatNumber(metrics.avgWin)}
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Average Win</div>
                      <div className="mb-1">Calculation: Total Profit from Wins / Number of Wins</div>
                      <div>Average profit per winning trade. Compare with Avg Loss for risk/reward ratio.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Avg Loss</div>
                  <div className="text-2xl font-bold text-red-600">
                    RMB {formatNumber(Math.abs(metrics.avgLoss))}
                  </div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Average Loss</div>
                      <div className="mb-1">Calculation: Total Loss from Losses / Number of Losses</div>
                      <div>Average loss per losing trade. Ideally should be smaller than Avg Win for positive expectancy.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Execution & Slippage */}
            {(metrics.avgSlippagePct !== undefined || metrics.sameDayTrades !== undefined) && (
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Execution & Slippage</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                    <div className="text-sm text-gray-600 mb-1">Same-Day Trades</div>
                    <div className="text-2xl font-bold">{metrics.sameDayTrades || 0}</div>
                    <div className="text-xs text-gray-500 mt-1">Execute at close</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                      <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                        <div className="font-semibold mb-1">Same-Day Trades</div>
                        <div>Trades executed at the close price on the same day as the signal. Immediate execution with no overnight gap.</div>
                        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>

                  <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                    <div className="text-sm text-gray-600 mb-1">Next-Day Trades</div>
                    <div className="text-2xl font-bold">{metrics.nextOpenTrades || 0}</div>
                    <div className="text-xs text-gray-500 mt-1">Execute at open</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                      <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                        <div className="font-semibold mb-1">Next-Day Trades</div>
                        <div>Trades executed at the open price the day after the signal. More realistic execution with overnight gap risk.</div>
                        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>

                  <div className="relative group bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200 cursor-help">
                    <div className="text-sm text-gray-600 mb-1">Avg Slippage</div>
                    <div className={`text-2xl font-bold ${(metrics.avgSlippagePct ?? 0) >= 0 ? 'text-orange-700' : 'text-green-700'}`}>
                      {(metrics.avgSlippagePct ?? 0) >= 0 ? '+' : ''}{metrics.avgSlippagePct?.toFixed(3) ?? '0.000'}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Price difference</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                      <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                        <div className="font-semibold mb-1">Average Slippage</div>
                        <div className="mb-1">Calculation: Avg((Execution Price - Signal Price) / Signal Price × 100%)</div>
                        <div>Price difference between signal and execution. Positive = worse fill, negative = better fill. For next-day trades only.</div>
                        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>

                  <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                    <div className="text-sm text-gray-600 mb-1">Slippage Cost</div>
                    <div className="text-2xl font-bold">
                      RMB {formatNumber(metrics.totalSlippageCost || 0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Total impact</div>
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                      <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                        <div className="font-semibold mb-1">Slippage Cost</div>
                        <div className="mb-1">Calculation: Sum(|Execution Price - Signal Price| × Shares)</div>
                        <div>Total monetary impact of price slippage across all trades. Lower is better.</div>
                        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Metrics */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Advanced Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Expectancy</div>
                  <div className="text-2xl font-bold">
                    RMB {formatNumber(advancedMetrics.expectancy)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Per Trade</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Expectancy</div>
                      <div className="mb-1">Calculation: (Avg Win × Win Rate) - (Avg Loss × Loss Rate)</div>
                      <div>Average profit/loss per trade. Positive means profitable long-term. Higher is better.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Recovery Factor</div>
                  <div className="text-2xl font-bold">
                    {advancedMetrics.recoveryFactor.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Profit/Drawdown</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Recovery Factor</div>
                      <div className="mb-1">Calculation: Net Profit / Max Drawdown</div>
                      <div>How many times profit exceeds max drawdown. &gt;2 is good. Shows how quickly losses are recovered.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Payoff Ratio</div>
                  <div className="text-2xl font-bold">
                    {advancedMetrics.payoffRatio.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Win/Loss Size</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-72">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Payoff Ratio</div>
                      <div className="mb-1">Calculation: Avg Win / Avg Loss</div>
                      <div>Size of average win vs average loss. &gt;2 is good. Can be profitable even with low win rate if this is high.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Max Win Streak</div>
                  <div className="text-2xl font-bold text-green-600">
                    {advancedMetrics.maxConsecutiveWins}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Consecutive</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Max Win Streak</div>
                      <div>Maximum number of consecutive winning trades in a row. Shows best performance streak.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200 cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Max Loss Streak</div>
                  <div className="text-2xl font-bold text-red-600">
                    {advancedMetrics.maxConsecutiveLosses}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Consecutive</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Max Loss Streak</div>
                      <div>Maximum number of consecutive losing trades in a row. Shows worst performance streak. Important for risk management.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>

                <div className="relative group bg-gray-50 p-4 rounded-lg border cursor-help">
                  <div className="text-sm text-gray-600 mb-1">Avg Holding</div>
                  <div className="text-2xl font-bold">
                    {advancedMetrics.avgHoldingPeriod.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Days</div>
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
                    <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
                      <div className="font-semibold mb-1">Average Holding Period</div>
                      <div className="mb-1">Calculation: Avg(Days between Buy and Sell)</div>
                      <div>Average number of days positions are held. Shows if strategy is short-term or long-term.</div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </>
        )}
      </div>

      {selectedTab === 'trades' && (
        <div>
          {/* Trade Filters and Controls */}
          <div className="mb-4 flex items-center gap-4 p-4 bg-gray-50 border rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Filter:</label>
              <select
                value={tradeFilter}
                onChange={(e) => { setTradeFilter(e.target.value as any); setCurrentPage(1); }}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="all">All Trades</option>
                <option value="buy">Buy Only</option>
                <option value="sell">Sell Only</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Per Page:</label>
              <select
                value={tradesPerPage}
                onChange={(e) => { setTradesPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div className="ml-auto text-sm text-gray-600">
              Showing {processedTrades.length} trades (Page {currentPage} of {totalPages || 1})
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th
                    className="border p-3 text-left font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => {
                      if (tradeSortField === 'date') {
                        setTradeSortDirection(tradeSortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setTradeSortField('date');
                        setTradeSortDirection('asc');
                      }
                    }}
                  >
                    Signal Date {tradeSortField === 'date' && (tradeSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="border p-3 text-left font-semibold">Exec Date</th>
                  <th className="border p-3 text-left font-semibold">Type</th>
                  <th className="border p-3 text-right font-semibold">Signal Price</th>
                  <th className="border p-3 text-right font-semibold">Exec Price</th>
                  <th className="border p-3 text-right font-semibold">Slippage %</th>
                  <th
                    className="border p-3 text-right font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => {
                      if (tradeSortField === 'size') {
                        setTradeSortDirection(tradeSortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setTradeSortField('size');
                        setTradeSortDirection('desc');
                      }
                    }}
                  >
                    Size {tradeSortField === 'size' && (tradeSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="border p-3 text-right font-semibold cursor-pointer hover:bg-gray-200"
                    onClick={() => {
                      if (tradeSortField === 'value') {
                        setTradeSortDirection(tradeSortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        setTradeSortField('value');
                        setTradeSortDirection('desc');
                      }
                    }}
                  >
                    Value {tradeSortField === 'value' && (tradeSortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="border p-3 text-right font-semibold">Commission</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrades.map((trade, idx) => {
                  const slippage = trade.signal_price && trade.price
                    ? ((trade.price - trade.signal_price) / trade.signal_price * 100)
                    : null;

                  return (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="border p-3">{trade.signal_date || trade.date}</td>
                      <td className="border p-3">
                        {trade.execution_date || trade.date}
                        {trade.execution_mode === 'next_open' && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            Next Day
                          </span>
                        )}
                      </td>
                      <td className="border p-3">
                        <span
                          className={`px-3 py-1 rounded text-sm font-medium ${
                            trade.type === 'buy'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {trade.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="border p-3 text-right font-mono">
                        {trade.signal_price !== undefined && trade.signal_price > 0
                          ? trade.signal_price.toFixed(2)
                          : '-'}
                      </td>
                      <td className="border p-3 text-right font-mono">
                        {trade.price !== undefined && trade.price > 0
                          ? trade.price.toFixed(2)
                          : 'N/A'}
                      </td>
                      <td className={`border p-3 text-right font-mono ${
                        slippage !== null ? (slippage >= 0 ? 'text-red-600' : 'text-green-600') : ''
                      }`}>
                        {slippage !== null ? `${slippage >= 0 ? '+' : ''}${slippage.toFixed(2)}%` : '-'}
                      </td>
                      <td className="border p-3 text-right font-mono">
                        {trade.size !== undefined ? trade.size.toLocaleString() : (trade.amount ? formatNumber(trade.amount) : 'N/A')}
                      </td>
                      <td className="border p-3 text-right font-mono">
                        {trade.value !== undefined && trade.value > 0
                          ? formatNumber(trade.value)
                          : 'N/A'}
                      </td>
                      <td className="border p-3 text-right font-mono text-gray-500">
                        {trade.commission !== undefined && trade.commission > 0
                          ? formatNumber(trade.commission)
                          : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-2 border rounded ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Charts Tab - always render containers but conditionally show them */}
      <div className={selectedTab === 'charts' ? 'space-y-6' : 'hidden'}>
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Price Chart with Trade Markers</h3>
          <div
            className="border rounded-lg bg-white overflow-hidden"
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y pinch-zoom' }}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
              }
            }}
          >
            <div ref={priceChartRef} style={{ width: '100%', height: '400px', overscrollBehavior: 'contain' }} />
          </div>
          <div className="mt-2 text-sm text-gray-600 flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 bg-blue-500"></span>
              <span>Buy (B)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 bg-red-500"></span>
              <span>Sell (S)</span>
            </div>
          </div>

          {/* Trade Detail Panels */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            {/* Left Trade Panel */}
            <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
              <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                Previous Trade
              </h4>
              {nearestLeftTrade ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Type:</span>
                    <span className={`font-medium ${nearestLeftTrade.type === 'buy' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                      {nearestLeftTrade.type === 'buy' ? 'Buy' : 'Sell'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Date:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {new Date(nearestLeftTrade.date).toLocaleDateString()}
                    </span>
                  </div>
                  {nearestLeftTrade.price && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Price:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        ¥{nearestLeftTrade.price.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {nearestLeftTrade.size && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Size:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {nearestLeftTrade.size}
                      </span>
                    </div>
                  )}
                  {nearestLeftTrade.value && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Value:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        ¥{nearestLeftTrade.value.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {nearestLeftTrade.execution_mode && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Execution:</span>
                      <span className="font-medium text-gray-900 dark:text-white text-xs">
                        {nearestLeftTrade.execution_mode === 'close' ? 'Same Day Close' : 'Next Open'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400 dark:text-gray-500 italic">
                  No previous trade
                </div>
              )}
            </div>

            {/* Right Trade Panel */}
            <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
              <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                Next Trade
              </h4>
              {nearestRightTrade ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Type:</span>
                    <span className={`font-medium ${nearestRightTrade.type === 'buy' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                      {nearestRightTrade.type === 'buy' ? 'Buy' : 'Sell'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Date:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {new Date(nearestRightTrade.date).toLocaleDateString()}
                    </span>
                  </div>
                  {nearestRightTrade.price && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Price:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        ¥{nearestRightTrade.price.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {nearestRightTrade.size && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Size:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {nearestRightTrade.size}
                      </span>
                    </div>
                  )}
                  {nearestRightTrade.value && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Value:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        ¥{nearestRightTrade.value.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {nearestRightTrade.execution_mode && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Execution:</span>
                      <span className="font-medium text-gray-900 dark:text-white text-xs">
                        {nearestRightTrade.execution_mode === 'close' ? 'Same Day Close' : 'Next Open'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-400 dark:text-gray-500 italic">
                  No next trade
                </div>
              )}
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Drawdown Chart</h3>
          <div
            className="border rounded-lg bg-white overflow-hidden"
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y pinch-zoom' }}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault();
              }
            }}
          >
            <div ref={drawdownChartRef} style={{ width: '100%', height: '300px', overscrollBehavior: 'contain' }} />
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Shows the percentage decline from the peak equity value over time
          </div>
        </div>
      </div>

      {/* Analysis Tab */}
      {selectedTab === 'analysis' && (
        <div className="space-y-6">
          {/* Year Selection */}
          {availableYears.length > 0 && (
            <div className="mb-4 p-4 bg-gray-50 border rounded-lg">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700">Select Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                {availableYears.length > 1 && (
                  <div className="ml-auto text-sm text-gray-600">
                    Showing {filteredMonthlyPerformance.length} months for {selectedYear}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Monthly Performance */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">
              Monthly Performance {selectedYear && `(${selectedYear})`}
            </h3>
            {filteredMonthlyPerformance.length > 0 ? (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-3 text-left font-semibold">Month</th>
                      <th className="border p-3 text-right font-semibold">Return %</th>
                      <th className="border p-3 text-right font-semibold">Trades</th>
                      <th className="border p-3 text-right font-semibold">Avg Daily Return %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMonthlyPerformance.map((month, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border p-3">{month.month}</td>
                        <td className={`border p-3 text-right font-mono font-semibold ${
                          month.return >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatPercent(month.return)}
                        </td>
                        <td className="border p-3 text-right">{month.trades}</td>
                        <td className={`border p-3 text-right font-mono ${
                          month.avgReturn >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {month.avgReturn.toFixed(3)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 border rounded-lg bg-gray-50">
                No data available for the selected year
              </div>
            )}
          </div>

          {/* Returns Distribution */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Returns Distribution</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600 mb-1">Mean Daily Return</div>
                <div className={`text-2xl font-bold ${
                  returnsDistribution.mean >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {returnsDistribution.mean.toFixed(3)}%
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600 mb-1">Std Deviation</div>
                <div className="text-2xl font-bold">
                  {returnsDistribution.stdDev.toFixed(3)}%
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600 mb-1">Sample Size</div>
                <div className="text-2xl font-bold">
                  {returnsDistribution.returns.length}
                </div>
                <div className="text-xs text-gray-500 mt-1">Days</div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 border rounded-lg text-center text-gray-600">
              Returns distribution histogram will be displayed here
              <div className="mt-2 text-sm">(Visualization in progress)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

