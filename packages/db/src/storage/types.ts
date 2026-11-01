/**
 * Storage abstraction types for database-based storage
 *
 * Note: Entity types (Indicator, Strategy, etc.) are exported from their
 * respective storage modules, not from here, to avoid circular dependencies.
 */

/**
 * Storage mode - now only database is supported
 */
export type StorageMode = 'database';

/**
 * Store names for JSON-based storage
 */
export type StoreName =
  | 'indicators'
  | 'strategies'
  | 'backtestHistory'
  | 'groups'
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
   * Initialize storage (create necessary structures)
   */
  initialize(): Promise<void>;

  /**
   * Clear all storage (useful for testing or reset)
   */
  clearAll(): Promise<void>;
}
