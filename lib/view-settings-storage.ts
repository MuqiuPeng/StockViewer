/**
 * View settings storage module
 * Uses the storage abstraction layer for both local (file) and online (IndexedDB) modes
 */

import { getStorageProvider } from './storage';
import type { JsonStorageProvider } from './storage/types';

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
 */
function getStore(): JsonStorageProvider<ViewSetting> {
  return getStorageProvider().getJsonStore<ViewSetting>('viewSettings');
}

/**
 * Get all view settings
 */
export function getAllViewSettings(): Promise<ViewSetting[]> {
  return getStore().getAll();
}

/**
 * Get a view setting by ID
 */
export async function getViewSetting(id: string): Promise<ViewSetting | null> {
  return getStore().getById(id);
}

/**
 * Create a new view setting
 */
export async function createViewSetting(setting: Omit<ViewSetting, 'id' | 'createdAt'>): Promise<ViewSetting> {
  return getStore().create(setting);
}

/**
 * Update a view setting
 */
export async function updateViewSetting(id: string, updates: Partial<Omit<ViewSetting, 'id' | 'createdAt'>>): Promise<ViewSetting | null> {
  try {
    return await getStore().update(id, updates);
  } catch {
    return null;
  }
}

/**
 * Delete a view setting
 */
export async function deleteViewSetting(id: string): Promise<boolean> {
  try {
    return await getStore().delete(id);
  } catch {
    return false;
  }
}
