/**
 * Group storage module
 * Uses the database storage abstraction layer
 */

import type { JsonStorageProvider, StorageProvider } from './storage/types';

export interface StockGroup {
  id: string;
  name: string;
  description?: string;
  stockIds: string[];         // Array of Stock IDs (references Stock table)
  createdAt: string;
  updatedAt?: string;
  isDataSource?: boolean;     // True for auto-generated data source groups
  dataSourceName?: string;    // The data source identifier when isDataSource is true
}

/**
 * Get the group store instance
 * @param storage Storage provider (required)
 */
function getStore(storage: StorageProvider): JsonStorageProvider<StockGroup> {
  return storage.getJsonStore<StockGroup>('groups');
}

/**
 * Load all groups from storage
 * @param storage Storage provider (required)
 */
export async function loadGroups(storage: StorageProvider): Promise<StockGroup[]> {
  return getStore(storage).getAll();
}

/**
 * Save groups to storage (bulk replace)
 * @param groups Array of groups to save
 * @param storage Storage provider (required)
 */
export async function saveGroups(groups: StockGroup[], storage: StorageProvider): Promise<void> {
  return getStore(storage).saveAll(groups);
}

/**
 * Get a group by ID
 * @param id Group ID
 * @param storage Storage provider (required)
 */
export async function getGroupById(id: string, storage: StorageProvider): Promise<StockGroup | null> {
  return getStore(storage).getById(id);
}

/**
 * Create a new group
 * @param group Group data (without id, createdAt, updatedAt)
 * @param storage Storage provider (required)
 */
export async function createGroup(
  group: Omit<StockGroup, 'id' | 'createdAt' | 'updatedAt'>,
  storage: StorageProvider
): Promise<StockGroup> {
  return getStore(storage).create(group);
}

/**
 * Update an existing group
 * @param id Group ID
 * @param updates Partial group updates
 * @param storage Storage provider (required)
 */
export async function updateGroup(
  id: string,
  updates: Partial<Omit<StockGroup, 'id' | 'createdAt'>>,
  storage: StorageProvider
): Promise<StockGroup | null> {
  try {
    return await getStore(storage).update(id, updates);
  } catch {
    return null;
  }
}

/**
 * Delete a group
 * @param id Group ID
 * @param storage Storage provider (required)
 */
export async function deleteGroup(id: string, storage: StorageProvider): Promise<boolean> {
  try {
    return await getStore(storage).delete(id);
  } catch {
    return false;
  }
}

/**
 * Get groups that contain a specific stock
 * @param stockId Stock ID
 * @param storage Storage provider (required)
 */
export async function getGroupsByStock(stockId: string, storage: StorageProvider): Promise<StockGroup[]> {
  const groups = await loadGroups(storage);
  return groups.filter(g => g.stockIds.includes(stockId));
}

/**
 * Add a stock to a group
 * @param groupId Group ID
 * @param stockId Stock ID
 * @param storage Storage provider (required)
 */
export async function addStockToGroup(
  groupId: string,
  stockId: string,
  storage: StorageProvider
): Promise<StockGroup | null> {
  const group = await getGroupById(groupId, storage);
  if (!group) return null;

  if (!group.stockIds.includes(stockId)) {
    return updateGroup(groupId, {
      stockIds: [...group.stockIds, stockId],
    }, storage);
  }
  return group;
}

/**
 * Remove a stock from a group
 * @param groupId Group ID
 * @param stockId Stock ID
 * @param storage Storage provider (required)
 */
export async function removeStockFromGroup(
  groupId: string,
  stockId: string,
  storage: StorageProvider
): Promise<StockGroup | null> {
  const group = await getGroupById(groupId, storage);
  if (!group) return null;

  return updateGroup(groupId, {
    stockIds: group.stockIds.filter(id => id !== stockId),
  }, storage);
}

/**
 * Sync data source groups to storage
 * Creates/updates groups for each data source
 * @param stocks Array of stocks with dataSource info
 * @param storage Storage provider (required)
 */
export async function syncDataSourceGroups(
  stocks: Array<{ id: string; dataSource: string }>,
  storage: StorageProvider
): Promise<void> {
  const groups = await loadGroups(storage);

  // Group stocks by data source
  const dataSources = new Map<string, string[]>();
  for (const stock of stocks) {
    if (stock.dataSource) {
      if (!dataSources.has(stock.dataSource)) {
        dataSources.set(stock.dataSource, []);
      }
      dataSources.get(stock.dataSource)!.push(stock.id);
    }
  }

  let modified = false;

  // For each data source, ensure a group exists
  for (const [dataSource, stockIds] of dataSources.entries()) {
    const groupId = `datasource_${dataSource}`;
    const existingGroup = groups.find(g => g.id === groupId);

    if (existingGroup) {
      // Update stock IDs if changed
      const sortedExisting = [...existingGroup.stockIds].sort();
      const sortedNew = [...stockIds].sort();

      if (JSON.stringify(sortedExisting) !== JSON.stringify(sortedNew)) {
        existingGroup.stockIds = stockIds;
        existingGroup.updatedAt = new Date().toISOString();
        modified = true;
      }
    } else {
      // Create new data source group
      groups.push({
        id: groupId,
        name: dataSource,
        description: `All stocks from ${dataSource}`,
        stockIds,
        isDataSource: true,
        dataSourceName: dataSource,
        createdAt: new Date().toISOString(),
      });
      modified = true;
    }
  }

  // Remove data source groups for sources that no longer have stocks
  const currentDataSources = new Set(Array.from(dataSources.keys()).map(s => `datasource_${s}`));
  const filteredGroups = groups.filter(g => !g.isDataSource || currentDataSources.has(g.id));

  if (filteredGroups.length !== groups.length) {
    await saveGroups(filteredGroups, storage);
    return;
  }

  if (modified) {
    await saveGroups(groups, storage);
  }
}
