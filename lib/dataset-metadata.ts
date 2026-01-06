import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const METADATA_FILE = join(process.cwd(), 'data', 'datasets', 'datasets.json');

export interface DatasetMetadata {
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
async function saveMetadata(datasets: DatasetMetadata[]): Promise<void> {
  const data: MetadataStore = { datasets };
  await writeFile(METADATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Find dataset by code, name, or filename
 */
export async function findDataset(identifier: string): Promise<DatasetMetadata | null> {
  const datasets = await loadMetadata();
  return datasets.find(
    ds => ds.code === identifier ||
          ds.name === identifier ||
          ds.filename === identifier ||
          ds.filename.replace(/\.csv$/i, '') === identifier
  ) || null;
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
