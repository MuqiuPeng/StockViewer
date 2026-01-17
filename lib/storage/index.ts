/**
 * Storage abstraction layer
 *
 * Provides a unified interface for PostgreSQL database storage
 * with user authentication for multi-user production deployment.
 *
 * Usage:
 *   import { getAuthenticatedStorage } from '@/lib/storage';
 *
 *   // Get user-scoped storage
 *   const storage = getAuthenticatedStorage(userId);
 *
 *   // Use stores
 *   const indicatorStore = storage.getJsonStore<Indicator>('indicators');
 *   const indicators = await indicatorStore.getAll();
 */

export * from './types';

import type {
  StorageProvider,
  StorageMode,
  StoreName,
  JsonStorageProvider,
} from './types';

// Import entity types from their respective modules
import type { Indicator } from '../indicator-storage';
import type { Strategy } from '../strategy-storage';
import type { BacktestHistoryEntry } from '../backtest-history-storage';
import type { StockGroup } from '../group-storage';
import type { ViewSetting } from '../view-settings-storage';

// Cache for per-user database storage providers
const userStorageProviders: Map<string, StorageProvider> = new Map();

/**
 * Get the storage mode (always 'database' now)
 */
export function getStorageMode(): StorageMode {
  return 'database';
}

/**
 * Check if we're in a server-side environment
 */
export function isServerSide(): boolean {
  return typeof window === 'undefined';
}

/**
 * Get an authenticated storage provider for database mode
 * Creates a user-scoped DatabaseStorageProvider
 *
 * @param userId - The authenticated user's ID
 * @returns A storage provider scoped to the user
 */
export function getAuthenticatedStorage(userId: string): StorageProvider {
  // Check cache for existing provider
  if (userStorageProviders.has(userId)) {
    return userStorageProviders.get(userId)!;
  }

  // Create new database storage provider for this user
  const { createDatabaseStorageProvider } = require('./database-storage');
  const provider = createDatabaseStorageProvider(userId);
  userStorageProviders.set(userId, provider);

  return provider;
}

/**
 * Check if authentication is required for storage (always true now)
 */
export function isAuthRequired(): boolean {
  return true;
}

/**
 * Reset the storage provider cache (useful for testing)
 */
export function resetStorageProvider(): void {
  userStorageProviders.clear();
}

/**
 * Initialize storage for an authenticated user
 */
export async function initializeAuthenticatedStorage(userId: string): Promise<void> {
  const provider = getAuthenticatedStorage(userId);
  await provider.initialize();
}

// =============================================================================
// Re-export types for convenience
// =============================================================================

export type {
  Indicator,
  Strategy,
  BacktestHistoryEntry,
  StockGroup,
  ViewSetting,
};
