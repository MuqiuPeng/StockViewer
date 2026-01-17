/**
 * Indicator storage module
 * Uses the database storage abstraction layer
 */

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

  // Indicator groups (e.g., MACD with DIF, DEA, MACD)
  isGroup?: boolean;              // true for MyTT group indicators
  groupName?: string;             // e.g., "MACD" (same as outputColumn for groups)
  expectedOutputs?: string[];     // e.g., ["DIF", "DEA", "MACD"]

  // External datasets to include in parameters
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;

  // Visibility: empty array = public, array with userIds = only those users can access
  visibleTo?: string[];
  category?: string;
  tags?: string[];
}

/**
 * Get the indicator store instance
 * @param storage Storage provider (required)
 */
function getStore(storage: StorageProvider): JsonStorageProvider<Indicator> {
  return storage.getJsonStore<Indicator>('indicators');
}

/**
 * Load all indicators for the current user
 * @param storage Storage provider (required)
 */
export async function loadIndicators(storage: StorageProvider): Promise<Indicator[]> {
  return getStore(storage).getAll();
}

/**
 * Save all indicators (bulk replace)
 * @param indicators Array of indicators to save
 * @param storage Storage provider (required)
 */
export async function saveIndicators(indicators: Indicator[], storage: StorageProvider): Promise<void> {
  return getStore(storage).saveAll(indicators);
}

/**
 * Get an indicator by ID
 * @param id Indicator ID
 * @param storage Storage provider (required)
 */
export async function getIndicatorById(id: string, storage: StorageProvider): Promise<Indicator | null> {
  return getStore(storage).getById(id);
}

/**
 * Create a new indicator
 * @param indicatorData Indicator data (without id, createdAt, updatedAt)
 * @param storage Storage provider (required)
 */
export async function saveIndicator(
  indicatorData: Omit<Indicator, 'id' | 'createdAt' | 'updatedAt'>,
  storage: StorageProvider
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

  // Ensure defaults
  const dataWithDefaults = {
    ...indicatorData,
    dependencies: indicatorData.dependencies || [],
    // visibleTo is set at API layer based on userId
  };

  return store.create(dataWithDefaults);
}

/**
 * Update an existing indicator
 * @param id Indicator ID
 * @param updates Partial indicator updates
 * @param storage Storage provider (required)
 */
export async function updateIndicator(
  id: string,
  updates: Partial<Omit<Indicator, 'id' | 'createdAt'>>,
  storage: StorageProvider
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
 * @param storage Storage provider (required)
 */
export async function deleteIndicator(id: string, storage: StorageProvider): Promise<void> {
  await getStore(storage).delete(id);
}
