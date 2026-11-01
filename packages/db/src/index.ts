/**
 * @stockviewer/db — the database and everything that reads or writes it.
 *
 * Importable from an API route or a script. Not from a React component: the
 * exports here open connections, and the types a component needs live in
 * @stockviewer/shared instead.
 */

// The client singleton. Anything holding a query that is not covered by the
// stores below uses this directly, which is most of the API surface: the
// stores cover the five user-owned collections, not the whole schema.
export { prisma } from './client';

// The user-scoped storage abstraction.
export {
  getAuthenticatedStorage,
  getStorageMode,
  initializeAuthenticatedStorage,
  isAuthRequired,
  isServerSide,
  resetStorageProvider,
} from './storage';
export type {
  JsonStorageProvider,
  StorageMode,
  StorageProvider,
  StoreName,
} from './storage/types';

// Per-collection CRUD, each taking a StorageProvider so the caller's identity
// decides what it can see.
export {
  deleteIndicator,
  getIndicatorById,
  loadIndicators,
  saveIndicator,
  saveIndicators,
  updateIndicator,
} from './indicator-storage';
export * from './strategy-storage';
export * from './group-storage';
export * from './view-settings-storage';
export * from './backtest-history-storage';

// Stock and StockPrice are shared across users rather than user-scoped, so
// these take no StorageProvider.
export * from './stock-storage';
