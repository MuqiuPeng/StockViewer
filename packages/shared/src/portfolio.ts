/**
 * Portfolio strategy configuration.
 *
 * This arrives from the strategy editor, is stored on the strategy, and is
 * passed to the backtest executor, so all three name it.
 *
 * It used to live in `lib/types/portfolio.ts` alongside `PositionSnapshot`,
 * `PerSymbolMetrics` and `PortfolioBacktestResult`. Those three had no
 * consumers and had drifted from the live copies in
 * `components/backtest/types.ts`: the server copy of
 * `PortfolioBacktestResult` still had `metrics: any` and a comment reading
 * "Will use BacktestMetrics from backtest-executor", while the component copy
 * is fully typed and carries fields the server copy never gained. They were
 * dropped rather than moved, because carrying a stale duplicate of a live
 * type into a package named "shared" is how it gets picked by mistake.
 */
export interface PortfolioConstraints {
  maxPositions?: number;           // Max concurrent positions (e.g., 5)
  positionSizing: 'equal' | 'custom';  // Equal-weight or custom
  reserveCash?: number;            // Reserve cash percentage (0-100)
  maxPositionSize?: number;        // Max % of portfolio per position
  minPositionSize?: number;        // Min $ amount per position
}
