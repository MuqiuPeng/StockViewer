/**
 * Storage abstraction types for both file-based and browser-based storage
 *
 * Note: Entity types (Indicator, Strategy, etc.) are exported from their
 * respective storage modules, not from here, to avoid circular dependencies.
 */

/**
 * Storage mode - determines which storage backend to use
 * - local: File-based storage (Node.js fs) for local/Docker deployment
 * - online: Browser IndexedDB storage for demo/single-user
 * - database: PostgreSQL storage for multi-user production deployment
 */
export type StorageMode = 'local' | 'online' | 'database';

/**
 * Store names for JSON-based storage
 */
export type StoreName =
  | 'indicators'
  | 'strategies'
  | 'backtestHistory'
  | 'groups'
  | 'datasetMetadata'
  | 'viewSettings';

/**
 * Generic interface for JSON-based collection storage
 * Handles arrays of items with common CRUD operations
 */
export interface JsonStorageProvider<T extends { id: string }> {
  /**
   * Get all items from the store
   */
  getAll(): Promise<T[]>;

  /**
   * Get a single item by ID
   */
  getById(id: string): Promise<T | null>;

  /**
   * Save (create) a new item
   * @param item - Item without id (will be generated)
   * @returns The created item with generated id
   */
  create(item: Omit<T, 'id' | 'createdAt'>): Promise<T>;

  /**
   * Update an existing item
   * @param id - Item ID
   * @param updates - Partial updates to apply
   * @returns The updated item
   */
  update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T>;

  /**
   * Delete an item by ID
   * @param id - Item ID
   * @returns true if deleted, throws if not found
   */
  delete(id: string): Promise<boolean>;

  /**
   * Save all items (bulk replace)
   * Used for migrations or bulk operations
   */
  saveAll(items: T[]): Promise<void>;
}

/**
 * Interface for binary/text file storage (CSV datasets)
 */
export interface FileStorageProvider {
  /**
   * List all files in the store
   */
  listFiles(): Promise<string[]>;

  /**
   * Check if a file exists
   */
  exists(filename: string): Promise<boolean>;

  /**
   * Read file content as text
   */
  readText(filename: string): Promise<string>;

  /**
   * Read file content as binary (ArrayBuffer)
   */
  readBinary(filename: string): Promise<ArrayBuffer>;

  /**
   * Write text content to a file
   */
  writeText(filename: string, content: string): Promise<void>;

  /**
   * Write binary content to a file
   */
  writeBinary(filename: string, content: ArrayBuffer): Promise<void>;

  /**
   * Delete a file
   */
  delete(filename: string): Promise<boolean>;

  /**
   * Get file stats (size, modified date if available)
   */
  getStats(filename: string): Promise<FileStats | null>;
}

export interface FileStats {
  size: number;
  modifiedAt?: Date;
}

/**
 * Combined storage provider interface
 */
export interface StorageProvider {
  /**
   * Current storage mode
   */
  readonly mode: StorageMode;

  /**
   * Get a JSON storage provider for a specific store
   */
  getJsonStore<T extends { id: string }>(storeName: StoreName): JsonStorageProvider<T>;

  /**
   * Get the file storage provider for CSV datasets
   */
  getFileStore(): FileStorageProvider;

  /**
   * Initialize storage (create necessary structures)
   */
  initialize(): Promise<void>;

  /**
   * Clear all storage (useful for testing or reset)
   */
  clearAll(): Promise<void>;
}
