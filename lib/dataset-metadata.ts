import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const METADATA_FILE = join(process.cwd(), 'data', 'datasets', 'datasets.json');

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
}

interface MetadataStore {
  datasets: DatasetMetadata[];
}

/**
 * Load all dataset metadata
 */
export async function loadMetadata(): Promise<DatasetMetadata[]> {
  try {
    const content = await readFile(METADATA_FILE, 'utf-8');
    const data: MetadataStore = JSON.parse(content);
    return data.datasets || [];
  } catch {
    return [];
  }
}

/**
 * Save all dataset metadata
 */
export async function saveMetadata(datasets: DatasetMetadata[]): Promise<void> {
  const data: MetadataStore = { datasets };
  await writeFile(METADATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Find dataset by ID, code, name, or filename
 * Priority: ID > filename > name > code (only if unique)
 */
export async function findDataset(identifier: string): Promise<DatasetMetadata | null> {
  const datasets = await loadMetadata();

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
  const datasets = await loadMetadata();
  const existingIndex = datasets.findIndex(ds => ds.filename === metadata.filename);

  if (existingIndex >= 0) {
    // Update existing
    datasets[existingIndex] = metadata;
  } else {
    // Add new
    datasets.push(metadata);
  }

  await saveMetadata(datasets);
}

/**
 * Remove a dataset from metadata
 */
export async function removeDataset(filename: string): Promise<void> {
  const datasets = await loadMetadata();
  const filtered = datasets.filter(ds => ds.filename !== filename);
  await saveMetadata(filtered);
}

/**
 * Update dataset name
 */
export async function updateDatasetName(filename: string, name: string): Promise<void> {
  const datasets = await loadMetadata();
  const dataset = datasets.find(ds => ds.filename === filename);
  if (dataset) {
    dataset.name = name;
    await saveMetadata(datasets);
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
