/**
 * File-based storage implementation using Node.js fs
 * This wraps the existing file storage logic for LOCAL_MODE
 */

import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { getCsvDataPath } from '../env';
import type {
  StorageProvider,
  StorageMode,
  StoreName,
  JsonStorageProvider,
  FileStorageProvider as IFileStorageProvider,
  FileStats,
} from './types';

/**
 * Configuration for each JSON store
 */
const STORE_CONFIG: Record<StoreName, { dir: string; file: string; wrapperKey: string }> = {
  indicators: {
    dir: 'data/indicators',
    file: 'indicators.json',
    wrapperKey: 'indicators',
  },
  strategies: {
    dir: 'data/strategies',
    file: 'strategies.json',
    wrapperKey: 'strategies',
  },
  backtestHistory: {
    dir: 'data/backtest-history',
    file: 'history.json',
    wrapperKey: 'entries',
  },
  groups: {
    dir: 'data/groups',
    file: 'groups.json',
    wrapperKey: 'groups',
  },
  datasetMetadata: {
    dir: 'data/datasets',
    file: 'datasets.json',
    wrapperKey: 'datasets',
  },
  viewSettings: {
    dir: 'data/view-settings',
    file: 'settings.json',
    wrapperKey: '', // Plain array, no wrapper
  },
};

/**
 * File-based JSON storage implementation
 */
class FileJsonStorage<T extends { id: string }> implements JsonStorageProvider<T> {
  private readonly dirPath: string;
  private readonly filePath: string;
  private readonly wrapperKey: string;

  constructor(storeName: StoreName) {
    const config = STORE_CONFIG[storeName];
    this.dirPath = join(process.cwd(), config.dir);
    this.filePath = join(this.dirPath, config.file);
    this.wrapperKey = config.wrapperKey;
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dirPath, { recursive: true });
  }

  private async readStore(): Promise<T[]> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content);

      if (this.wrapperKey) {
        return data[this.wrapperKey] || [];
      }
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private async writeStore(items: T[]): Promise<void> {
    await this.ensureDir();

    let data: any;
    if (this.wrapperKey) {
      data = { [this.wrapperKey]: items };
    } else {
      data = items;
    }

    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async getAll(): Promise<T[]> {
    return this.readStore();
  }

  async getById(id: string): Promise<T | null> {
    const items = await this.readStore();
    return items.find(item => item.id === id) || null;
  }

  async create(item: Omit<T, 'id' | 'createdAt'>): Promise<T> {
    const items = await this.readStore();

    const newItem = {
      ...item,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    } as unknown as T;

    items.push(newItem);
    await this.writeStore(items);

    return newItem;
  }

  async update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T> {
    const items = await this.readStore();
    const index = items.findIndex(item => item.id === id);

    if (index === -1) {
      throw new Error(`Item with ID "${id}" not found`);
    }

    const updatedItem = {
      ...items[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    } as T;

    items[index] = updatedItem;
    await this.writeStore(items);

    return updatedItem;
  }

  async delete(id: string): Promise<boolean> {
    const items = await this.readStore();
    const filtered = items.filter(item => item.id !== id);

    if (filtered.length === items.length) {
      throw new Error(`Item with ID "${id}" not found`);
    }

    await this.writeStore(filtered);
    return true;
  }

  async saveAll(items: T[]): Promise<void> {
    await this.writeStore(items);
  }
}

/**
 * File-based binary/text file storage for CSV datasets
 * Reads from local CSV_DATA_PATH folder
 */
class FileBinaryStorage implements IFileStorageProvider {
  private readonly dirPath: string;

  constructor() {
    this.dirPath = getCsvDataPath();
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dirPath, { recursive: true });
  }

  async listFiles(): Promise<string[]> {
    try {
      const files = await readdir(this.dirPath);
      return files.filter(file => file.toLowerCase().endsWith('.csv'));
    } catch {
      return [];
    }
  }

  async exists(filename: string): Promise<boolean> {
    try {
      const filePath = join(this.dirPath, filename);
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  async readText(filename: string): Promise<string> {
    const filePath = join(this.dirPath, filename);
    return readFile(filePath, 'utf-8');
  }

  async readBinary(filename: string): Promise<ArrayBuffer> {
    const filePath = join(this.dirPath, filename);
    const buffer = await readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  async writeText(filename: string, content: string): Promise<void> {
    await this.ensureDir();
    const filePath = join(this.dirPath, filename);
    await writeFile(filePath, content, 'utf-8');
  }

  async writeBinary(filename: string, content: ArrayBuffer): Promise<void> {
    await this.ensureDir();
    const filePath = join(this.dirPath, filename);
    await writeFile(filePath, Buffer.from(content));
  }

  async delete(filename: string): Promise<boolean> {
    try {
      const filePath = join(this.dirPath, filename);
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getStats(filename: string): Promise<FileStats | null> {
    try {
      const filePath = join(this.dirPath, filename);
      const stats = await stat(filePath);
      return {
        size: stats.size,
        modifiedAt: stats.mtime,
      };
    } catch {
      return null;
    }
  }
}

/**
 * File-based storage provider for LOCAL_MODE
 */
export class LocalStorageProvider implements StorageProvider {
  readonly mode: StorageMode = 'local';

  private jsonStores: Map<StoreName, JsonStorageProvider<any>> = new Map();
  private fileStore: FileBinaryStorage | null = null;

  getJsonStore<T extends { id: string }>(storeName: StoreName): JsonStorageProvider<T> {
    if (!this.jsonStores.has(storeName)) {
      this.jsonStores.set(storeName, new FileJsonStorage<T>(storeName));
    }
    return this.jsonStores.get(storeName)!;
  }

  getFileStore(): FileBinaryStorage {
    if (!this.fileStore) {
      this.fileStore = new FileBinaryStorage();
    }
    return this.fileStore;
  }

  async initialize(): Promise<void> {
    // Ensure all directories exist
    const baseDir = process.cwd();
    const dirs = [
      'data/indicators',
      'data/strategies',
      'data/backtest-history',
      'data/groups',
      'data/datasets',
      'data/view-settings',
    ];

    for (const dir of dirs) {
      await mkdir(join(baseDir, dir), { recursive: true });
    }

    // Ensure CSV directory exists
    await mkdir(getCsvDataPath(), { recursive: true });
  }

  async clearAll(): Promise<void> {
    // Clear all JSON stores by writing empty arrays
    for (const storeName of Object.keys(STORE_CONFIG) as StoreName[]) {
      const store = this.getJsonStore(storeName);
      await store.saveAll([]);
    }

    // Clear CSV files
    const fileStore = this.getFileStore();
    const files = await fileStore.listFiles();
    for (const file of files) {
      await fileStore.delete(file);
    }
  }
}

/**
 * Create a file storage provider instance
 */
export function createFileStorageProvider(): StorageProvider {
  return new LocalStorageProvider();
}
