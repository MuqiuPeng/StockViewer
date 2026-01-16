/**
 * Indicator storage module
 * Uses the storage abstraction layer for both local (file) and online (IndexedDB) modes
 */

import { getStorageProvider, isServerSide, getStorageMode } from './storage';
import type { JsonStorageProvider, StorageProvider } from './storage/types';

export interface Indicator {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  outputColumn: string;           // For single indicators (or group name for groups)
  createdAt: string;
  updatedAt?: string;
  dependencies: string[];         // Indicator IDs this depends on
  dependencyColumns?: string[];   // Specific columns used, e.g., ["KDJ:K", "SMA_20"]

  // NEW FIELDS for indicator groups
  isGroup?: boolean;              // true for MyTT group indicators
  groupName?: string;             // e.g., "MACD" (same as outputColumn for groups)
  expectedOutputs?: string[];     // e.g., ["DIF", "DEA", "MACD"]

  // External datasets to include in parameters
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;
}

/**
 * Get the indicator store instance
 * @param storage Optional storage provider (required for database mode)
 */
function getStore(storage?: StorageProvider): JsonStorageProvider<Indicator> {
  if (storage) {
    return storage.getJsonStore<Indicator>('indicators');
  }
  // For local/online mode, use default storage
  if (getStorageMode() === 'database') {
    throw new Error('Database mode requires passing a storage provider. Use getApiStorage() in API routes.');
  }
  return getStorageProvider().getJsonStore<Indicator>('indicators');
}

/**
 * Load all indicators
 * @param storage Optional storage provider (required for database mode)
 */
export async function loadIndicators(storage?: StorageProvider): Promise<Indicator[]> {
  return getStore(storage).getAll();
}

/**
 * Save all indicators (bulk replace)
 * @param indicators Array of indicators to save
 * @param storage Optional storage provider (required for database mode)
 */
export async function saveIndicators(indicators: Indicator[], storage?: StorageProvider): Promise<void> {
  return getStore(storage).saveAll(indicators);
}

/**
 * Get an indicator by ID
 * @param id Indicator ID
 * @param storage Optional storage provider (required for database mode)
 */
export async function getIndicatorById(id: string, storage?: StorageProvider): Promise<Indicator | null> {
  return getStore(storage).getById(id);
}

/**
 * Create a new indicator
 * @param indicatorData Indicator data (without id, createdAt, updatedAt)
 * @param storage Optional storage provider (required for database mode)
 */
export async function saveIndicator(
  indicatorData: Omit<Indicator, 'id' | 'createdAt' | 'updatedAt'>,
  storage?: StorageProvider
): Promise<Indicator> {
  const store = getStore(storage);
  const indicators = await store.getAll();

  // Check for duplicate names
  const existingByName = indicators.find(
    ind => ind.name.toLowerCase() === indicatorData.name.toLowerCase()
  );
  if (existingByName) {
    throw new Error(`Indicator with name "${indicatorData.name}" already exists`);
  }

  // Ensure dependencies array exists
  const dataWithDefaults = {
    ...indicatorData,
    dependencies: indicatorData.dependencies || [],
  };

  return store.create(dataWithDefaults);
}

/**
 * Update an existing indicator
 * @param id Indicator ID
 * @param updates Partial indicator updates
 * @param storage Optional storage provider (required for database mode)
 */
export async function updateIndicator(
  id: string,
  updates: Partial<Omit<Indicator, 'id' | 'createdAt'>>,
  storage?: StorageProvider
): Promise<Indicator> {
  const store = getStore(storage);

  // Check for duplicate names (if name is being updated)
  if (updates.name) {
    const indicators = await store.getAll();
    const existingByName = indicators.find(
      ind => ind.id !== id && ind.name.toLowerCase() === updates.name!.toLowerCase()
    );
    if (existingByName) {
      throw new Error(`Indicator with name "${updates.name}" already exists`);
    }
  }

  return store.update(id, updates);
}

/**
 * Delete an indicator by ID
 * @param id Indicator ID
 * @param storage Optional storage provider (required for database mode)
 */
export async function deleteIndicator(id: string, storage?: StorageProvider): Promise<void> {
  await getStore(storage).delete(id);
}
