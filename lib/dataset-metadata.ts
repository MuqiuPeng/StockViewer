/**
 * Dataset metadata storage module
 * Uses the storage abstraction layer for both local (file) and online (IndexedDB) modes
 */

import { getStorageProvider, getStorageMode } from './storage';
import type { JsonStorageProvider, StorageProvider } from './storage/types';

export interface DatasetMetadata {
  id: string;              // Unique identifier: {symbol}_{dataSource}
  code: string;
  name: string;
  filename: string;
  dataSource: string;
  firstDate?: string;
  lastDate?: string;
  lastUpdate?: string;
  rowCount?: number;
  columns?: string[];
  indicators?: string[];
  createdAt?: string;      // For storage abstraction compatibility
}

/**
 * Get the dataset metadata store instance
 * @param storage Optional storage provider (required for database mode)
 */
function getStore(storage?: StorageProvider): JsonStorageProvider<DatasetMetadata> {
  if (storage) {
    return storage.getJsonStore<DatasetMetadata>('datasetMetadata');
  }
  if (getStorageMode() === 'database') {
    throw new Error('Database mode requires passing a storage provider. Use getApiStorage() in API routes.');
  }
  return getStorageProvider().getJsonStore<DatasetMetadata>('datasetMetadata');
}

/**
 * Load all dataset metadata
 * @param storage Optional storage provider (required for database mode)
 */
export async function loadMetadata(storage?: StorageProvider): Promise<DatasetMetadata[]> {
  return getStore(storage).getAll();
}

/**
 * Save all dataset metadata (bulk replace)
 */
export async function saveMetadata(datasets: DatasetMetadata[]): Promise<void> {
  return getStore().saveAll(datasets);
}

/**
 * Find dataset by ID, code, name, or filename
 * Priority: ID > filename > name > code (only if unique)
 * @param identifier The identifier to search for
 * @param storage Optional storage provider (required for database mode)
 */
export async function findDataset(identifier: string, storage?: StorageProvider): Promise<DatasetMetadata | null> {
  const datasets = await loadMetadata(storage);

  // Priority 1: Match by unique ID
  let match = datasets.find(ds => ds.id === identifier);
  if (match) return match;

  // Priority 2: Match by filename (with or without .csv)
  match = datasets.find(ds =>
    ds.filename === identifier ||
    ds.filename.replace(/\.csv$/i, '') === identifier
  );
  if (match) return match;

  // Priority 3: Match by name
  match = datasets.find(ds => ds.name === identifier);
  if (match) return match;

  // Priority 4: Match by code (only if unique)
  const codeMatches = datasets.filter(ds => ds.code === identifier);
  if (codeMatches.length === 1) {
    return codeMatches[0];
  } else if (codeMatches.length > 1) {
    console.warn(`Ambiguous dataset code: ${identifier}, found ${codeMatches.length} matches. Use ID instead.`);
    return null;
  }

  // Not found
  return null;
}

/**
 * Register or update a dataset
 */
export async function registerDataset(metadata: DatasetMetadata): Promise<void> {
  const store = getStore();
  const datasets = await store.getAll();
  const existingIndex = datasets.findIndex(ds => ds.filename === metadata.filename);

  if (existingIndex >= 0) {
    // Update existing - preserve the id
    const existingId = datasets[existingIndex].id;
    await store.update(existingId, metadata);
  } else {
    // Add new - ensure id exists
    const metadataWithId = {
      ...metadata,
      id: metadata.id || `${metadata.code}_${metadata.dataSource}`,
    };
    await store.create(metadataWithId);
  }
}

/**
 * Remove a dataset from metadata
 */
export async function removeDataset(filename: string): Promise<void> {
  const datasets = await loadMetadata();
  const dataset = datasets.find(ds => ds.filename === filename);
  if (dataset) {
    await getStore().delete(dataset.id);
  }
}

/**
 * Update dataset name
 */
export async function updateDatasetName(filename: string, name: string): Promise<void> {
  const datasets = await loadMetadata();
  const dataset = datasets.find(ds => ds.filename === filename);
  if (dataset) {
    await getStore().update(dataset.id, { name });
  }
}

/**
 * Migrate existing datasets to add ID field
 * ID format: {symbol}_{dataSource}
 */
export async function migrateDatasetIds(): Promise<void> {
  const datasets = await loadMetadata();
  let modified = false;

  for (const dataset of datasets) {
    if (!dataset.id) {
      // Generate ID from code + dataSource
      dataset.id = `${dataset.code}_${dataset.dataSource}`;
      modified = true;
      console.log(`Migrated dataset: ${dataset.name} -> ID: ${dataset.id}`);
    }
  }

  if (modified) {
    await saveMetadata(datasets);
    console.log(`Migration complete: ${datasets.filter(d => d.id).length} datasets have IDs`);
  } else {
    console.log('No migration needed: all datasets already have IDs');
  }
}
