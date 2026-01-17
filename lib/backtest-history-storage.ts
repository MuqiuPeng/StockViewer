/**
 * Backtest history storage module
 * Uses the database storage abstraction layer
 */

import type { JsonStorageProvider, StorageProvider } from './storage/types';
import { BacktestResult } from './backtest-executor';
import { PortfolioConstraints } from './types/portfolio';

export interface BacktestHistoryEntry {
  // Identity
  id: string;
  createdAt: string;

  // Backtest configuration
  strategyId: string;
  strategyName: string;
  strategyType: 'single' | 'portfolio';

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

/**
 * Get the backtest history store instance
 * @param storage Storage provider (required)
 */
function getStore(storage: StorageProvider): JsonStorageProvider<BacktestHistoryEntry> {
  return storage.getJsonStore<BacktestHistoryEntry>('backtestHistory');
}

/**
 * Get all backtest history entries (sorted by date, newest first)
 * @param storage Storage provider (required)
 */
export async function getAllBacktestHistory(storage: StorageProvider): Promise<BacktestHistoryEntry[]> {
  const entries = await getStore(storage).getAll();

  // Sort by createdAt descending (newest first)
  return entries.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get a backtest history entry by ID
 * @param id Entry ID
 * @param storage Storage provider (required)
 */
export async function getBacktestHistoryById(
  id: string,
  storage: StorageProvider
): Promise<BacktestHistoryEntry | null> {
  return getStore(storage).getById(id);
}

/**
 * Create a new backtest history entry
 * @param entryData Entry data (without id, createdAt)
 * @param storage Storage provider (required)
 */
export async function createBacktestHistoryEntry(
  entryData: Omit<BacktestHistoryEntry, 'id' | 'createdAt'>,
  storage: StorageProvider
): Promise<BacktestHistoryEntry> {
  return getStore(storage).create(entryData);
}

/**
 * Update a backtest history entry
 * @param id Entry ID
 * @param updates Partial entry updates
 * @param storage Storage provider (required)
 */
export async function updateBacktestHistoryEntry(
  id: string,
  updates: Partial<Omit<BacktestHistoryEntry, 'id' | 'createdAt'>>,
  storage: StorageProvider
): Promise<BacktestHistoryEntry> {
  return getStore(storage).update(id, updates);
}

/**
 * Delete a backtest history entry
 * @param id Entry ID
 * @param storage Storage provider (required)
 */
export async function deleteBacktestHistoryEntry(
  id: string,
  storage: StorageProvider
): Promise<void> {
  await getStore(storage).delete(id);
}

// Specialized operations

/**
 * Star/unstar a backtest history entry
 * @param id Entry ID
 * @param starred Star status
 * @param storage Storage provider (required)
 */
export async function starBacktestHistoryEntry(
  id: string,
  starred: boolean,
  storage: StorageProvider
): Promise<void> {
  await updateBacktestHistoryEntry(id, { starred }, storage);
}

/**
 * Add notes to a backtest history entry
 * @param id Entry ID
 * @param notes Notes text
 * @param storage Storage provider (required)
 */
export async function addNoteToBacktestHistoryEntry(
  id: string,
  notes: string,
  storage: StorageProvider
): Promise<void> {
  await updateBacktestHistoryEntry(id, { notes }, storage);
}

/**
 * Add tags to a backtest history entry
 * @param id Entry ID
 * @param tags Array of tags
 * @param storage Storage provider (required)
 */
export async function addTagsToBacktestHistoryEntry(
  id: string,
  tags: string[],
  storage: StorageProvider
): Promise<void> {
  await updateBacktestHistoryEntry(id, { tags }, storage);
}
