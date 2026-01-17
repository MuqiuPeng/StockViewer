/**
 * Strategy storage module
 * Uses the database storage abstraction layer
 */

import type { JsonStorageProvider, StorageProvider } from './storage/types';
import { PortfolioConstraints } from './types/portfolio';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  strategyType: 'single' | 'portfolio';  // Strategy type
  constraints?: PortfolioConstraints;     // Portfolio constraints (only for portfolio type)
  parameters?: Record<string, any>;      // Configurable parameters
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;  // External datasets
  dependencies?: string[];               // Indicator names/IDs this strategy depends on
  createdAt: string;
  updatedAt?: string;
}

/**
 * Get the strategy store instance
 * @param storage Storage provider (required)
 */
function getStore(storage: StorageProvider): JsonStorageProvider<Strategy> {
  return storage.getJsonStore<Strategy>('strategies');
}

/**
 * Load all strategies
 * @param storage Storage provider (required)
 */
export async function loadStrategies(storage: StorageProvider): Promise<Strategy[]> {
  const strategies = await getStore(storage).getAll();

  // Migration: Add default strategyType for existing strategies
  let needsSave = false;
  const migratedStrategies = strategies.map(strategy => {
    if (!strategy.strategyType) {
      needsSave = true;
      return {
        ...strategy,
        strategyType: 'single' as const,
      };
    }
    return strategy;
  });

  if (needsSave) {
    await saveStrategies(migratedStrategies, storage);
  }

  return migratedStrategies;
}

/**
 * Save all strategies (bulk replace)
 * @param strategies Array of strategies to save
 * @param storage Storage provider (required)
 */
export async function saveStrategies(strategies: Strategy[], storage: StorageProvider): Promise<void> {
  return getStore(storage).saveAll(strategies);
}

/**
 * Get a strategy by ID
 * @param id Strategy ID
 * @param storage Storage provider (required)
 */
export async function getStrategyById(id: string, storage: StorageProvider): Promise<Strategy | null> {
  return getStore(storage).getById(id);
}

/**
 * Create a new strategy
 * @param strategyData Strategy data (without id, createdAt, updatedAt)
 * @param storage Storage provider (required)
 */
export async function saveStrategy(
  strategyData: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>,
  storage: StorageProvider
): Promise<Strategy> {
  const store = getStore(storage);
  const strategies = await store.getAll();

  // Check for duplicate names
  const existingByName = strategies.find(
    strategy => strategy.name.toLowerCase() === strategyData.name.toLowerCase()
  );
  if (existingByName) {
    throw new Error(`Strategy with name "${strategyData.name}" already exists`);
  }

  // Ensure defaults
  const dataWithDefaults = {
    ...strategyData,
    strategyType: strategyData.strategyType || 'single',
    parameters: strategyData.parameters || {},
  };

  return store.create(dataWithDefaults);
}

/**
 * Update an existing strategy
 * @param id Strategy ID
 * @param updates Partial strategy updates
 * @param storage Storage provider (required)
 */
export async function updateStrategy(
  id: string,
  updates: Partial<Omit<Strategy, 'id' | 'createdAt'>>,
  storage: StorageProvider
): Promise<Strategy> {
  const store = getStore(storage);

  // Check for duplicate names (if name is being updated)
  if (updates.name) {
    const strategies = await store.getAll();
    const existingByName = strategies.find(
      strategy => strategy.id !== id && strategy.name.toLowerCase() === updates.name!.toLowerCase()
    );
    if (existingByName) {
      throw new Error(`Strategy with name "${updates.name}" already exists`);
    }
  }

  return store.update(id, updates);
}

/**
 * Delete a strategy by ID
 * @param id Strategy ID
 * @param storage Storage provider (required)
 */
export async function deleteStrategy(id: string, storage: StorageProvider): Promise<void> {
  await getStore(storage).delete(id);
}
