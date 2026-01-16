/**
 * Backtest history storage module
 * Uses the storage abstraction layer for both local (file) and online (IndexedDB) modes
 */

import { getStorageProvider, getStorageMode } from './storage';
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
    datasetName?: string;
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
 */
function getStore(storage?: StorageProvider): JsonStorageProvider<BacktestHistoryEntry> {
  if (storage) {
    return storage.getJsonStore<BacktestHistoryEntry>('backtestHistory');
  }
  if (getStorageMode() === 'database') {
    throw new Error('Database mode requires passing a storage provider.');
  }
  return getStorageProvider().getJsonStore<BacktestHistoryEntry>('backtestHistory');
}

/**
 * Get all backtest history entries (sorted by date, newest first)
 */
export async function getAllBacktestHistory(): Promise<BacktestHistoryEntry[]> {
  const entries = await getStore().getAll();

  // Sort by createdAt descending (newest first)
  return entries.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get a backtest history entry by ID
 */
export async function getBacktestHistoryById(id: string): Promise<BacktestHistoryEntry | null> {
  return getStore().getById(id);
}

/**
 * Create a new backtest history entry
 */
export async function createBacktestHistoryEntry(
  storage: StorageProvider,
  entryData: Omit<BacktestHistoryEntry, 'id' | 'createdAt'>
): Promise<BacktestHistoryEntry> {
  return getStore(storage).create(entryData);
}

/**
 * Update a backtest history entry
 */
export async function updateBacktestHistoryEntry(
  id: string,
  updates: Partial<Omit<BacktestHistoryEntry, 'id' | 'createdAt'>>
): Promise<BacktestHistoryEntry> {
  return getStore().update(id, updates);
}

/**
 * Delete a backtest history entry
 */
export async function deleteBacktestHistoryEntry(id: string): Promise<void> {
  await getStore().delete(id);
}

// Specialized operations

/**
 * Star/unstar a backtest history entry
 */
export async function starBacktestHistoryEntry(id: string, starred: boolean): Promise<void> {
  await updateBacktestHistoryEntry(id, { starred });
}

/**
 * Add notes to a backtest history entry
 */
export async function addNoteToBacktestHistoryEntry(id: string, notes: string): Promise<void> {
  await updateBacktestHistoryEntry(id, { notes });
}

/**
 * Add tags to a backtest history entry
 */
export async function addTagsToBacktestHistoryEntry(id: string, tags: string[]): Promise<void> {
  await updateBacktestHistoryEntry(id, { tags });
}
