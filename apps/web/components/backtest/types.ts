// Shared types for backtest components

export interface BacktestMetrics {
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

export interface EquityPoint {
  date: string;
  value: number;
  cash?: number;
  shares?: number;
  stock_value?: number;
  positions?: Record<string, number>;
  stock_values?: Record<string, number>;
}

export interface TradeMarker {
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
  symbol?: string;
}

export interface DateRange {
  startDate?: string;
  endDate?: string;
  dataPoints?: number;
}

export interface StrategyInfo {
  name?: string;
  parameters?: Record<string, any>;
  initialCash?: number;
  commission?: number;
  stockId?: string;
}

export interface StockResult {
  stockId: string;
  metrics: BacktestMetrics;
  equityCurve?: EquityPoint[];
  tradeMarkers?: TradeMarker[];
  dataPoints: number;
}

export interface GroupBacktestResult {
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
  errors?: Array<{ stockId: string; error: string }>;
}

export interface PerSymbolMetric {
  symbol: string;
  totalReturn: number;
  totalReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  tradeCount: number;
  contributionToPortfolio: number;
  winRate: number;
}

export interface PositionSnapshot {
  date: string;
  positions: Record<string, { shares: number; value: number; percentOfPortfolio: number }>;
  cash: number;
  totalValue: number;
}

export interface PortfolioBacktestResult {
  type: 'portfolio';
  symbols: string[];
  datasetFilenames?: Record<string, string>;
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  tradeMarkers: TradeMarker[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  positionSnapshots?: PositionSnapshot[];
  perSymbolMetrics?: PerSymbolMetric[];
  perSymbolEquityCurves?: Record<string, Array<{ date: string; value: number; shares: number }>>;
  constraints?: any;
}

export interface CandleData {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Tab types
export type MetricsTab = 'metrics' | 'trades' | 'charts' | 'stocks' | 'analysis';

// Sort types
export type TradeSortField = 'date' | 'size' | 'value';
export type SortDirection = 'asc' | 'desc';
export type TradeFilterType = 'all' | 'buy' | 'sell';
