/**
 * Strategy storage module
 * Uses the storage abstraction layer for both local (file) and online (IndexedDB) modes
 */

import { getStorageProvider, getStorageMode } from './storage';
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
 */
function getStore(storage?: StorageProvider): JsonStorageProvider<Strategy> {
  if (storage) {
    return storage.getJsonStore<Strategy>('strategies');
  }
  if (getStorageMode() === 'database') {
    throw new Error('Database mode requires passing a storage provider.');
  }
  return getStorageProvider().getJsonStore<Strategy>('strategies');
}

/**
 * Load all strategies
 */
export async function loadStrategies(): Promise<Strategy[]> {
  const strategies = await getStore().getAll();

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
    await saveStrategies(migratedStrategies);
  }

  return migratedStrategies;
}

/**
 * Save all strategies (bulk replace)
 */
export async function saveStrategies(strategies: Strategy[]): Promise<void> {
  return getStore().saveAll(strategies);
}

/**
 * Get a strategy by ID
 */
export async function getStrategyById(id: string, storage?: StorageProvider): Promise<Strategy | null> {
  return getStore(storage).getById(id);
}

/**
 * Create a new strategy
 */
export async function saveStrategy(
  strategyData: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Strategy> {
  const store = getStore();
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
 */
export async function updateStrategy(
  id: string,
  updates: Partial<Omit<Strategy, 'id' | 'createdAt'>>
): Promise<Strategy> {
  const store = getStore();

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
 */
export async function deleteStrategy(id: string): Promise<void> {
  await getStore().delete(id);
}
