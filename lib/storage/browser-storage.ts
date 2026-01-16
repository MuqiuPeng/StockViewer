/**
 * Browser-based storage implementation using IndexedDB
 * This is used for ONLINE_MODE when running without server-side file access
 */

import type {
  StorageProvider,
  StorageMode,
  StoreName,
  JsonStorageProvider,
  FileStorageProvider,
  FileStats,
} from './types';

const DB_NAME = 'stockviewer-db';
const DB_VERSION = 1;

/**
 * Store configuration for IndexedDB object stores
 */
const STORE_NAMES: StoreName[] = [
  'indicators',
  'strategies',
  'backtestHistory',
  'groups',
  'datasetMetadata',
  'viewSettings',
];

const FILE_STORE_NAME = 'csvFiles';

/**
 * Generate a UUID in browser environment
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Open IndexedDB connection
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores for JSON data
      for (const storeName of STORE_NAMES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      }

      // Create object store for CSV files
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        const fileStore = db.createObjectStore(FILE_STORE_NAME, { keyPath: 'filename' });
        fileStore.createIndex('filename', 'filename', { unique: true });
      }
    };
  });
}

/**
 * Browser-based JSON storage using IndexedDB
 */
class BrowserJsonStorage<T extends { id: string }> implements JsonStorageProvider<T> {
  private readonly storeName: StoreName;

  constructor(storeName: StoreName) {
    this.storeName = storeName;
  }

  private async withStore<R>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => IDBRequest<R>
  ): Promise<R> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, mode);
      const store = transaction.objectStore(this.storeName);
      const request = callback(store);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      transaction.oncomplete = () => db.close();
    });
  }

  async getAll(): Promise<T[]> {
    return this.withStore('readonly', (store) => store.getAll());
  }

  async getById(id: string): Promise<T | null> {
    const result = await this.withStore('readonly', (store) => store.get(id));
    return result || null;
  }

  async create(item: Omit<T, 'id' | 'createdAt'>): Promise<T> {
    const newItem = {
      ...item,
      id: generateId(),
      createdAt: new Date().toISOString(),
    } as unknown as T;

    await this.withStore('readwrite', (store) => store.add(newItem));
    return newItem;
  }

  async update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Item with ID "${id}" not found`);
    }

    const updatedItem = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    } as T;

    await this.withStore('readwrite', (store) => store.put(updatedItem));
    return updatedItem;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Item with ID "${id}" not found`);
    }

    await this.withStore('readwrite', (store) => store.delete(id));
    return true;
  }

  async saveAll(items: T[]): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // Clear existing items
      store.clear();

      // Add all new items
      for (const item of items) {
        store.add(item);
      }

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  }
}

/**
 * File metadata stored in IndexedDB
 */
interface StoredFile {
  filename: string;
  content: ArrayBuffer;
  mimeType: string;
  size: number;
  modifiedAt: string;
}

/**
 * Browser-based file storage using IndexedDB
 */
class BrowserFileStorage implements FileStorageProvider {
  private async withStore<R>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => IDBRequest<R>
  ): Promise<R> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FILE_STORE_NAME, mode);
      const store = transaction.objectStore(FILE_STORE_NAME);
      const request = callback(store);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      transaction.oncomplete = () => db.close();
    });
  }

  async listFiles(): Promise<string[]> {
    const files = await this.withStore<StoredFile[]>('readonly', (store) => store.getAll());
    return files
      .filter((f) => f.filename.toLowerCase().endsWith('.csv'))
      .map((f) => f.filename);
  }

  async exists(filename: string): Promise<boolean> {
    const file = await this.withStore<StoredFile | undefined>('readonly', (store) =>
      store.get(filename)
    );
    return !!file;
  }

  async readText(filename: string): Promise<string> {
    const file = await this.withStore<StoredFile | undefined>('readonly', (store) =>
      store.get(filename)
    );
    if (!file) {
      throw new Error(`File "${filename}" not found`);
    }
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(file.content);
  }

  async readBinary(filename: string): Promise<ArrayBuffer> {
    const file = await this.withStore<StoredFile | undefined>('readonly', (store) =>
      store.get(filename)
    );
    if (!file) {
      throw new Error(`File "${filename}" not found`);
    }
    return file.content;
  }

  async writeText(filename: string, content: string): Promise<void> {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(content).buffer;
    await this.writeBinary(filename, buffer);
  }

  async writeBinary(filename: string, content: ArrayBuffer): Promise<void> {
    const storedFile: StoredFile = {
      filename,
      content,
      mimeType: filename.endsWith('.csv') ? 'text/csv' : 'application/octet-stream',
      size: content.byteLength,
      modifiedAt: new Date().toISOString(),
    };

    await this.withStore('readwrite', (store) => store.put(storedFile));
  }

  async delete(filename: string): Promise<boolean> {
    const exists = await this.exists(filename);
    if (!exists) {
      return false;
    }
    await this.withStore('readwrite', (store) => store.delete(filename));
    return true;
  }

  async getStats(filename: string): Promise<FileStats | null> {
    const file = await this.withStore<StoredFile | undefined>('readonly', (store) =>
      store.get(filename)
    );
    if (!file) {
      return null;
    }
    return {
      size: file.size,
      modifiedAt: new Date(file.modifiedAt),
    };
  }
}

/**
 * Browser-based storage provider for ONLINE_MODE
 */
export class BrowserStorageProvider implements StorageProvider {
  readonly mode: StorageMode = 'online';

  private jsonStores: Map<StoreName, JsonStorageProvider<any>> = new Map();
  private fileStore: BrowserFileStorage | null = null;

  getJsonStore<T extends { id: string }>(storeName: StoreName): JsonStorageProvider<T> {
    if (!this.jsonStores.has(storeName)) {
      this.jsonStores.set(storeName, new BrowserJsonStorage<T>(storeName));
    }
    return this.jsonStores.get(storeName)!;
  }

  getFileStore(): FileStorageProvider {
    if (!this.fileStore) {
      this.fileStore = new BrowserFileStorage();
    }
    return this.fileStore;
  }

  async initialize(): Promise<void> {
    // Just open the database to trigger creation
    const db = await openDatabase();
    db.close();
  }

  async clearAll(): Promise<void> {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const storeNames = [...STORE_NAMES, FILE_STORE_NAME];
      const transaction = db.transaction(storeNames, 'readwrite');

      for (const storeName of storeNames) {
        transaction.objectStore(storeName).clear();
      }

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  }
}

/**
 * Create a browser storage provider instance
 */
export function createBrowserStorageProvider(): StorageProvider {
  return new BrowserStorageProvider();
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
