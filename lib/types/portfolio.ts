/**
 * Portfolio Strategy Types
 *
 * Types for multi-stock portfolio strategies with shared capital
 */

export interface PortfolioConstraints {
  maxPositions?: number;           // Max concurrent positions (e.g., 5)
  positionSizing: 'equal' | 'custom';  // Equal-weight or custom
  reserveCash?: number;            // Reserve cash percentage (0-100)
  maxPositionSize?: number;        // Max % of portfolio per position
  minPositionSize?: number;        // Min $ amount per position
}

export interface PositionSnapshot {
  date: string;
  positions: Record<string, {
    shares: number;
    value: number;
    percentOfPortfolio: number;
  }>;
  cash: number;
  totalValue: number;
}

export interface PerSymbolMetrics {
  symbol: string;
  totalReturn: number;
  totalReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  tradeCount: number;
  avgHoldingPeriod: number;        // Days
  contributionToPortfolio: number; // $ contribution
  winRate: number;
}

export interface PortfolioBacktestResult {
  success: true;
  type: 'portfolio';
  metrics: any;                      // Will use BacktestMetrics from backtest-executor
  equityCurve: any[];               // Will use EquityPoint[] from backtest-executor
  tradeMarkers: any[];              // Will use TradeMarker[] with 'symbol' field
  positionSnapshots: PositionSnapshot[];
  perSymbolMetrics: PerSymbolMetrics[];
  symbols: string[];
  constraints: PortfolioConstraints;
}
