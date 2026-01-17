/**
 * View settings storage module
 * Uses the database storage abstraction layer
 */

import type { JsonStorageProvider, StorageProvider } from './storage/types';

export interface ConstantLine {
  value: number;
  color: string;
  label: string;
}

export interface ViewSetting {
  id: string;
  name: string;
  enabledIndicators1: string[];
  enabledIndicators2: string[];
  constantLines1: ConstantLine[];
  constantLines2: ConstantLine[];
  createdAt: string;
  updatedAt?: string;
}

/**
 * Get the view settings store instance
 * @param storage Storage provider (required)
 */
function getStore(storage: StorageProvider): JsonStorageProvider<ViewSetting> {
  return storage.getJsonStore<ViewSetting>('viewSettings');
}

/**
 * Get all view settings
 * @param storage Storage provider (required)
 */
export function getAllViewSettings(storage: StorageProvider): Promise<ViewSetting[]> {
  return getStore(storage).getAll();
}

/**
 * Get a view setting by ID
 * @param id View setting ID
 * @param storage Storage provider (required)
 */
export async function getViewSetting(id: string, storage: StorageProvider): Promise<ViewSetting | null> {
  return getStore(storage).getById(id);
}

/**
 * Create a new view setting
 * @param setting View setting data (without id, createdAt)
 * @param storage Storage provider (required)
 */
export async function createViewSetting(
  setting: Omit<ViewSetting, 'id' | 'createdAt'>,
  storage: StorageProvider
): Promise<ViewSetting> {
  return getStore(storage).create(setting);
}

/**
 * Update a view setting
 * @param id View setting ID
 * @param updates Partial view setting updates
 * @param storage Storage provider (required)
 */
export async function updateViewSetting(
  id: string,
  updates: Partial<Omit<ViewSetting, 'id' | 'createdAt'>>,
  storage: StorageProvider
): Promise<ViewSetting | null> {
  try {
    return await getStore(storage).update(id, updates);
  } catch {
    return null;
  }
}

/**
 * Delete a view setting
 * @param id View setting ID
 * @param storage Storage provider (required)
 */
export async function deleteViewSetting(id: string, storage: StorageProvider): Promise<boolean> {
  try {
    return await getStore(storage).delete(id);
  } catch {
    return false;
  }
}
