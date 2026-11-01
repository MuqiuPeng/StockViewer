import type { PortfolioConstraints } from './portfolio';

/**
 * What a backtest is asked for, what it answers, and what is kept of it.
 *
 * `BacktestInput` and `BacktestResult` were defined in
 * `lib/backtest-executor.ts` next to the function that spawns Python. That
 * made the stored entry below — which a component renders — depend on a
 * module importing `child_process`. The request and the response are the
 * contract between the two sides, so they live here and the executor imports
 * them like anyone else.
 */
export interface BacktestInput {
  strategyCode: string;
  data?: Record<string, any>[];                // Single-stock data
  dataMap?: Record<string, Record<string, any>[]>;  // Portfolio data (symbol -> data)
  strategyType: 'signal' | 'portfolio';        // Strategy type
  initialCash?: number;
  commission?: number;
  parameters?: Record<string, any>;
  constraints?: PortfolioConstraints;          // NEW: Portfolio constraints
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;  // External datasets configuration
}

export interface BacktestResult {
  success: boolean;
  metrics?: {
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
  };
  equityCurve?: Array<{ date: string; value: number; cash?: number; shares?: number; stock_value?: number }>;
  tradeMarkers?: Array<{
    signal_date?: string;
    execution_date?: string;
    date: string;
    symbol?: string;                 // NEW: Required for portfolio trades
    type: 'buy' | 'sell';
    amount?: number;
    price?: number;
    signal_price?: number;
    size?: number;
    value?: number;
    commission?: number;
    execution_mode?: 'close' | 'next_open';
  }>;
  // Portfolio-specific fields
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
  symbols?: string[];
  constraints?: PortfolioConstraints;
  error?: string;
  type?: string;
  details?: {
    message?: string;
    type?: string;
    code_line?: string;
    hints?: string[];
    traceback?: string;
    warnings?: string[];
  };
}

export interface BacktestHistoryEntry {
  // Identity
  id: string;
  createdAt: string;

  // Backtest configuration
  strategyId: string;
  strategyName: string;
  strategyType: 'signal' | 'portfolio';

  // Target information
  target: {
    type: 'single' | 'portfolio' | 'group';
    stockId?: string;           // Reference to Stock table
    symbols?: string[];
    groupId?: string;
    groupName?: string;
  };

  // Backtest parameters
  parameters: {
    initialCash: number;
    commission: number;
    startDate?: string;
    endDate?: string;
    strategyParameters?: Record<string, any>;
    constraints?: PortfolioConstraints;
  };

  // Results (full backtest result)
  result: BacktestResult;

  // Metadata
  starred: boolean;
  notes?: string;
  tags?: string[];

  // Summary metrics (denormalized for quick filtering/sorting)
  summary: {
    totalReturn: number;
    totalReturnPct: number;
    sharpeRatio: number;
    tradeCount: number;
    duration: number;
  };
}
