/**
 * Group storage module
 * Uses the storage abstraction layer for both local (file) and online (IndexedDB) modes
 */

import { getStorageProvider, getStorageMode } from './storage';
import type { JsonStorageProvider, StorageProvider } from './storage/types';

export interface StockGroup {
  id: string;
  name: string;
  description?: string;
  datasetNames: string[]; // Array of dataset filenames
  createdAt: string;
  updatedAt?: string;
  isDataSource?: boolean; // True for auto-generated data source groups
  dataSourceName?: string; // The data source identifier when isDataSource is true
}

/**
 * Get the group store instance
 */
function getStore(storage?: StorageProvider): JsonStorageProvider<StockGroup> {
  if (storage) {
    return storage.getJsonStore<StockGroup>('groups');
  }
  if (getStorageMode() === 'database') {
    throw new Error('Database mode requires passing a storage provider.');
  }
  return getStorageProvider().getJsonStore<StockGroup>('groups');
}

/**
 * Load all groups from storage
 */
export async function loadGroups(): Promise<StockGroup[]> {
  return getStore().getAll();
}

/**
 * Save groups to storage (bulk replace)
 */
async function saveGroups(groups: StockGroup[]): Promise<void> {
  return getStore().saveAll(groups);
}

/**
 * Get a group by ID
 */
export async function getGroupById(id: string, storage?: StorageProvider): Promise<StockGroup | null> {
  return getStore(storage).getById(id);
}

/**
 * Create a new group
 */
export async function createGroup(group: Omit<StockGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<StockGroup> {
  return getStore().create(group);
}

/**
 * Update an existing group
 */
export async function updateGroup(id: string, updates: Partial<Omit<StockGroup, 'id' | 'createdAt'>>): Promise<StockGroup | null> {
  try {
    return await getStore().update(id, updates);
  } catch {
    return null;
  }
}

/**
 * Delete a group
 */
export async function deleteGroup(id: string): Promise<boolean> {
  try {
    return await getStore().delete(id);
  } catch {
    return false;
  }
}

/**
 * Get groups that contain a specific dataset
 */
export async function getGroupsByDataset(datasetName: string): Promise<StockGroup[]> {
  const groups = await loadGroups();
  return groups.filter(g => g.datasetNames.includes(datasetName));
}

/**
 * Sync data source groups to storage
 * This creates/updates groups for each data source (e.g., datasource_stock_zh_a_hist)
 */
export async function syncDataSourceGroups(datasets: any[]): Promise<void> {
  const groups = await loadGroups();

  // Extract unique data sources from datasets
  const dataSources = new Map<string, string[]>();
  for (const dataset of datasets) {
    if (dataset.dataSource) {
      if (!dataSources.has(dataset.dataSource)) {
        dataSources.set(dataset.dataSource, []);
      }
      dataSources.get(dataset.dataSource)!.push(dataset.filename);
    }
  }

  let modified = false;

  // For each data source, ensure a group exists
  for (const [dataSource, datasetNames] of dataSources.entries()) {
    const groupId = `datasource_${dataSource}`;
    const existingGroup = groups.find(g => g.id === groupId);

    if (existingGroup) {
      // Update dataset names if changed
      const sortedExisting = [...existingGroup.datasetNames].sort();
      const sortedNew = [...datasetNames].sort();

      if (JSON.stringify(sortedExisting) !== JSON.stringify(sortedNew)) {
        existingGroup.datasetNames = datasetNames;
        existingGroup.updatedAt = new Date().toISOString();
        modified = true;
      }
    } else {
      // Create new data source group
      const { getDataSourceConfig } = await import('./data-sources');
      const sourceConfig = getDataSourceConfig(dataSource);
      const friendlyName = sourceConfig?.name || dataSource;

      groups.push({
        id: groupId,
        name: friendlyName,
        description: `All datasets from ${friendlyName}`,
        datasetNames,
        isDataSource: true,
        createdAt: new Date().toISOString(),
      });
      modified = true;
    }
  }

  // Remove data source groups for sources that no longer have datasets
  const currentDataSources = new Set(Array.from(dataSources.keys()).map(s => `datasource_${s}`));
  const removedGroups = groups.filter(g => g.isDataSource && !currentDataSources.has(g.id));

  if (removedGroups.length > 0) {
    const filteredGroups = groups.filter(g => !g.isDataSource || currentDataSources.has(g.id));
    await saveGroups(filteredGroups);
    return;
  }

  if (modified) {
    await saveGroups(groups);
  }
}

/**
 * Add a dataset to a group
 */
export async function addDatasetToGroup(groupId: string, datasetName: string): Promise<StockGroup | null> {
  const groups = await loadGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) return null;

  if (!group.datasetNames.includes(datasetName)) {
    group.datasetNames.push(datasetName);
    group.updatedAt = new Date().toISOString();
    await saveGroups(groups);
  }
  return group;
}

/**
 * Remove a dataset from a group
 */
export async function removeDatasetFromGroup(groupId: string, datasetName: string): Promise<StockGroup | null> {
  const groups = await loadGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) return null;

  group.datasetNames = group.datasetNames.filter(name => name !== datasetName);
  group.updatedAt = new Date().toISOString();
  await saveGroups(groups);
  return group;
}
