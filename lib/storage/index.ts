/**
 * Storage abstraction layer
 *
 * Provides a unified interface for data storage that works in:
 * - LOCAL_MODE: File-based storage using Node.js fs (for local/Docker deployment)
 * - ONLINE_MODE: Browser-based storage using IndexedDB (for online deployment)
 * - DATABASE_MODE: PostgreSQL storage with user authentication (for production)
 *
 * Usage:
 *   import { getStorageProvider, getIndicatorStore, getAuthenticatedStorage } from '@/lib/storage';
 *
 *   // For local/online mode (no auth)
 *   const storage = getStorageProvider();
 *
 *   // For database mode (with auth)
 *   const storage = getAuthenticatedStorage(userId);
 *
 *   // Use typed store helpers
 *   const indicatorStore = getIndicatorStore();
 *   const indicators = await indicatorStore.getAll();
 */

export * from './types';

import type {
  StorageProvider,
  StorageMode,
  StoreName,
  JsonStorageProvider,
  FileStorageProvider,
} from './types';

// Import entity types from their respective modules
import type { Indicator } from '../indicator-storage';
import type { Strategy } from '../strategy-storage';
import type { BacktestHistoryEntry } from '../backtest-history-storage';
import type { StockGroup } from '../group-storage';
import type { DatasetMetadata } from '../dataset-metadata';
import type { ViewSetting } from '../view-settings-storage';

// Singleton storage provider instance
let storageProvider: StorageProvider | null = null;

/**
 * Determine the storage mode from environment
 */
export function getStorageMode(): StorageMode {
  // Check for explicit STORAGE_MODE environment variable
  const storageMode = process.env.NEXT_PUBLIC_STORAGE_MODE;
  if (storageMode === 'database') {
    return 'database';
  }
  if (storageMode === 'online') {
    return 'online';
  }
  if (storageMode === 'local') {
    return 'local';
  }

  // Check for LOCAL_MODE flag (legacy support)
  if (process.env.LOCAL_MODE === 'true') {
    return 'local';
  }

  // Check if we're in a browser environment without server access
  if (typeof window !== 'undefined') {
    // In browser, default to online mode unless explicitly set to local
    return 'online';
  }

  // Server-side defaults to local mode
  return 'local';
}

/**
 * Check if we're in a server-side environment
 */
export function isServerSide(): boolean {
  return typeof window === 'undefined';
}

/**
 * Get the storage provider singleton
 * Automatically selects file or browser storage based on environment
 *
 * Note: For database mode, use getAuthenticatedStorage(userId) instead
 */
export function getStorageProvider(): StorageProvider {
  const mode = getStorageMode();

  // Database mode requires authentication - use getAuthenticatedStorage instead
  if (mode === 'database') {
    throw new Error(
      'Database storage mode requires authentication. Use getAuthenticatedStorage(userId) instead.'
    );
  }

  if (storageProvider) {
    return storageProvider;
  }

  if (mode === 'local' && isServerSide()) {
    // Server-side with local mode - use file storage
    const { createFileStorageProvider } = require('./file-storage');
    storageProvider = createFileStorageProvider();
  } else if (mode === 'online' || !isServerSide()) {
    // Browser or online mode - use IndexedDB
    const { createBrowserStorageProvider, isIndexedDBAvailable } = require('./browser-storage');
    if (!isIndexedDBAvailable()) {
      throw new Error('IndexedDB is not available in this environment');
    }
    storageProvider = createBrowserStorageProvider();
  } else {
    // Fallback to file storage
    const { createFileStorageProvider } = require('./file-storage');
    storageProvider = createFileStorageProvider();
  }

  return storageProvider!;
}

// Cache for per-user database storage providers (keyed by `userId:csvPath`)
const userStorageProviders: Map<string, StorageProvider> = new Map();

/**
 * Get an authenticated storage provider for database mode
 * Creates a user-scoped DatabaseStorageProvider
 *
 * @param userId - The authenticated user's ID
 * @param csvDataPath - Optional user-specific CSV data path
 * @returns A storage provider scoped to the user
 */
export function getAuthenticatedStorage(userId: string, csvDataPath?: string | null): StorageProvider {
  const mode = getStorageMode();

  if (mode !== 'database') {
    // In non-database modes, return the singleton (userId is ignored)
    return getStorageProvider();
  }

  // Cache key includes CSV path since it affects the storage provider behavior
  const cacheKey = `${userId}:${csvDataPath || 'default'}`;

  // Check cache for existing provider
  if (userStorageProviders.has(cacheKey)) {
    return userStorageProviders.get(cacheKey)!;
  }

  // Create new database storage provider for this user
  const { createDatabaseStorageProvider } = require('./database-storage');
  const provider = createDatabaseStorageProvider(userId, csvDataPath);
  userStorageProviders.set(cacheKey, provider);

  return provider;
}

/**
 * Check if authentication is required for storage
 */
export function isAuthRequired(): boolean {
  return getStorageMode() === 'database';
}

/**
 * Reset the storage provider singleton (useful for testing)
 */
export function resetStorageProvider(): void {
  storageProvider = null;
  userStorageProviders.clear();
}

/**
 * Initialize storage (creates necessary structures)
 * For database mode, use initializeAuthenticatedStorage(userId) instead
 */
export async function initializeStorage(): Promise<void> {
  const mode = getStorageMode();
  if (mode === 'database') {
    // Database initialization is handled per-user
    return;
  }
  const provider = getStorageProvider();
  await provider.initialize();
}

/**
 * Initialize storage for an authenticated user
 */
export async function initializeAuthenticatedStorage(userId: string): Promise<void> {
  const provider = getAuthenticatedStorage(userId);
  await provider.initialize();
}

// =============================================================================
// Typed Store Helpers
// =============================================================================

/**
 * Get the indicators store with proper typing
 */
export function getIndicatorStore(): JsonStorageProvider<Indicator> {
  return getStorageProvider().getJsonStore<Indicator>('indicators');
}

/**
 * Get the strategies store with proper typing
 */
export function getStrategyStore(): JsonStorageProvider<Strategy> {
  return getStorageProvider().getJsonStore<Strategy>('strategies');
}

/**
 * Get the backtest history store with proper typing
 */
export function getBacktestHistoryStore(): JsonStorageProvider<BacktestHistoryEntry> {
  return getStorageProvider().getJsonStore<BacktestHistoryEntry>('backtestHistory');
}

/**
 * Get the groups store with proper typing
 */
export function getGroupStore(): JsonStorageProvider<StockGroup> {
  return getStorageProvider().getJsonStore<StockGroup>('groups');
}

/**
 * Get the dataset metadata store with proper typing
 */
export function getDatasetMetadataStore(): JsonStorageProvider<DatasetMetadata> {
  return getStorageProvider().getJsonStore<DatasetMetadata>('datasetMetadata');
}

/**
 * Get the view settings store with proper typing
 */
export function getViewSettingsStore(): JsonStorageProvider<ViewSetting> {
  return getStorageProvider().getJsonStore<ViewSetting>('viewSettings');
}

/**
 * Get the CSV file store
 */
export function getCsvFileStore(): FileStorageProvider {
  return getStorageProvider().getFileStore();
}

// =============================================================================
// Convenience Functions (matching existing API patterns)
// =============================================================================

// Indicators
export async function loadIndicators(): Promise<Indicator[]> {
  return getIndicatorStore().getAll();
}

export async function getIndicatorById(id: string): Promise<Indicator | null> {
  return getIndicatorStore().getById(id);
}

export async function saveIndicator(
  indicator: Omit<Indicator, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Indicator> {
  const store = getIndicatorStore();
  const existing = await store.getAll();

  // Check for duplicate names
  const duplicate = existing.find(
    (ind) => ind.name.toLowerCase() === indicator.name.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`Indicator with name "${indicator.name}" already exists`);
  }

  return store.create(indicator);
}

export async function updateIndicator(
  id: string,
  updates: Partial<Omit<Indicator, 'id' | 'createdAt'>>
): Promise<Indicator> {
  if (updates.name) {
    const store = getIndicatorStore();
    const existing = await store.getAll();
    const duplicate = existing.find(
      (ind) => ind.id !== id && ind.name.toLowerCase() === updates.name!.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Indicator with name "${updates.name}" already exists`);
    }
  }
  return getIndicatorStore().update(id, updates);
}

export async function deleteIndicator(id: string): Promise<void> {
  await getIndicatorStore().delete(id);
}

// Strategies
export async function loadStrategies(): Promise<Strategy[]> {
  return getStrategyStore().getAll();
}

export async function getStrategyById(id: string): Promise<Strategy | null> {
  return getStrategyStore().getById(id);
}

export async function saveStrategy(
  strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Strategy> {
  const store = getStrategyStore();
  const existing = await store.getAll();

  const duplicate = existing.find(
    (s) => s.name.toLowerCase() === strategy.name.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`Strategy with name "${strategy.name}" already exists`);
  }

  return store.create(strategy);
}

export async function updateStrategy(
  id: string,
  updates: Partial<Omit<Strategy, 'id' | 'createdAt'>>
): Promise<Strategy> {
  if (updates.name) {
    const store = getStrategyStore();
    const existing = await store.getAll();
    const duplicate = existing.find(
      (s) => s.id !== id && s.name.toLowerCase() === updates.name!.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Strategy with name "${updates.name}" already exists`);
    }
  }
  return getStrategyStore().update(id, updates);
}

export async function deleteStrategy(id: string): Promise<void> {
  await getStrategyStore().delete(id);
}

// Groups
export async function loadGroups(): Promise<StockGroup[]> {
  return getGroupStore().getAll();
}

export async function getGroupById(id: string): Promise<StockGroup | null> {
  return getGroupStore().getById(id);
}

export async function createGroup(
  group: Omit<StockGroup, 'id' | 'createdAt' | 'updatedAt'>
): Promise<StockGroup> {
  return getGroupStore().create(group);
}

export async function updateGroup(
  id: string,
  updates: Partial<Omit<StockGroup, 'id' | 'createdAt'>>
): Promise<StockGroup> {
  return getGroupStore().update(id, updates);
}

export async function deleteGroup(id: string): Promise<boolean> {
  return getGroupStore().delete(id);
}

// Dataset Metadata
export async function loadDatasetMetadata(): Promise<DatasetMetadata[]> {
  return getDatasetMetadataStore().getAll();
}

export async function findDataset(identifier: string): Promise<DatasetMetadata | null> {
  const datasets = await loadDatasetMetadata();

  // Priority 1: Match by unique ID
  let match = datasets.find((ds) => ds.id === identifier);
  if (match) return match;

  // Priority 2: Match by filename
  match = datasets.find(
    (ds) =>
      ds.filename === identifier || ds.filename.replace(/\.csv$/i, '') === identifier
  );
  if (match) return match;

  // Priority 3: Match by name
  match = datasets.find((ds) => ds.name === identifier);
  if (match) return match;

  // Priority 4: Match by code (only if unique)
  const codeMatches = datasets.filter((ds) => ds.code === identifier);
  if (codeMatches.length === 1) {
    return codeMatches[0];
  }

  return null;
}

export async function registerDataset(metadata: DatasetMetadata): Promise<void> {
  const store = getDatasetMetadataStore();
  const existing = await store.getAll();
  const existingIndex = existing.findIndex((ds) => ds.filename === metadata.filename);

  if (existingIndex >= 0) {
    await store.update(existing[existingIndex].id, metadata);
  } else {
    await store.create(metadata);
  }
}

export async function removeDataset(filename: string): Promise<void> {
  const store = getDatasetMetadataStore();
  const existing = await store.getAll();
  const dataset = existing.find((ds) => ds.filename === filename);
  if (dataset) {
    await store.delete(dataset.id);
  }
}

// View Settings
export async function getAllViewSettings(): Promise<ViewSetting[]> {
  return getViewSettingsStore().getAll();
}

export async function getViewSetting(id: string): Promise<ViewSetting | null> {
  return getViewSettingsStore().getById(id);
}

export async function createViewSetting(
  setting: Omit<ViewSetting, 'id' | 'createdAt'>
): Promise<ViewSetting> {
  return getViewSettingsStore().create(setting);
}

export async function updateViewSetting(
  id: string,
  updates: Partial<Omit<ViewSetting, 'id' | 'createdAt'>>
): Promise<ViewSetting> {
  return getViewSettingsStore().update(id, updates);
}

export async function deleteViewSetting(id: string): Promise<boolean> {
  return getViewSettingsStore().delete(id);
}

// Backtest History
export async function getAllBacktestHistory(): Promise<BacktestHistoryEntry[]> {
  const entries = await getBacktestHistoryStore().getAll();
  // Sort by createdAt descending
  return entries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getBacktestHistoryById(
  id: string
): Promise<BacktestHistoryEntry | null> {
  return getBacktestHistoryStore().getById(id);
}

export async function createBacktestHistoryEntry(
  entry: Omit<BacktestHistoryEntry, 'id' | 'createdAt'>
): Promise<BacktestHistoryEntry> {
  return getBacktestHistoryStore().create(entry);
}

export async function updateBacktestHistoryEntry(
  id: string,
  updates: Partial<Omit<BacktestHistoryEntry, 'id' | 'createdAt'>>
): Promise<BacktestHistoryEntry> {
  return getBacktestHistoryStore().update(id, updates);
}

export async function deleteBacktestHistoryEntry(id: string): Promise<void> {
  await getBacktestHistoryStore().delete(id);
}
