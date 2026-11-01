/**
 * The types that cross the client/server boundary.
 *
 * Types only — no runtime, so there is nothing here to bundle. See README.md
 * for what belongs and what does not.
 */
export type { PortfolioConstraints } from './portfolio';
export type { Indicator } from './indicator';
export type { Strategy } from './strategy';
export type { StockGroup } from './group';
export type { ConstantLine, ViewSetting } from './view-setting';
export type {
  BacktestInput,
  BacktestResult,
  BacktestHistoryEntry,
} from './backtest';
