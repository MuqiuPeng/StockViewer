/**
 * Database-based storage implementation using Prisma/PostgreSQL
 * JSON data (indicators, strategies, etc.) is scoped to the authenticated user
 * CSV files are read from a shared local folder (CSV_DATA_PATH)
 */

import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { prisma } from '../prisma';
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
 * Map store names to Prisma model names
 */
const STORE_MODEL_MAP: Record<StoreName, string> = {
  indicators: 'indicator',
  strategies: 'strategy',
  backtestHistory: 'backtestHistoryEntry',
  groups: 'stockGroup',
  datasetMetadata: 'datasetMetadata',
  viewSettings: 'viewSetting',
};

/**
 * Database JSON storage with user scoping
 */
class DatabaseJsonStorage<T extends { id: string }> implements JsonStorageProvider<T> {
  private readonly storeName: StoreName;
  private readonly modelName: string;
  private readonly userId: string;

  constructor(storeName: StoreName, userId: string) {
    this.storeName = storeName;
    this.modelName = STORE_MODEL_MAP[storeName];
    this.userId = userId;
  }

  private get model(): any {
    return (prisma as any)[this.modelName];
  }

  async getAll(): Promise<T[]> {
    const items = await this.model.findMany({
      where: { userId: this.userId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item: any) => this.mapFromDb(item));
  }

  async getById(id: string): Promise<T | null> {
    const item = await this.model.findFirst({
      where: { id, userId: this.userId },
    });
    return item ? this.mapFromDb(item) : null;
  }

  async create(item: Omit<T, 'id' | 'createdAt'>): Promise<T> {
    const created = await this.model.create({
      data: {
        ...this.mapToDb(item),
        userId: this.userId,
      },
    });
    return this.mapFromDb(created);
  }

  async update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T> {
    // Verify ownership
    const existing = await this.model.findFirst({
      where: { id, userId: this.userId },
    });
    if (!existing) {
      throw new Error(`Item with ID "${id}" not found`);
    }

    const updated = await this.model.update({
      where: { id },
      data: this.mapToDb(updates),
    });
    return this.mapFromDb(updated);
  }

  async delete(id: string): Promise<boolean> {
    // Verify ownership
    const existing = await this.model.findFirst({
      where: { id, userId: this.userId },
    });
    if (!existing) {
      throw new Error(`Item with ID "${id}" not found`);
    }

    await this.model.delete({
      where: { id },
    });
    return true;
  }

  async saveAll(items: T[]): Promise<void> {
    // Transaction: delete all user's items then insert all new items
    await prisma.$transaction(async (tx: any) => {
      await tx[this.modelName].deleteMany({
        where: { userId: this.userId },
      });

      for (const item of items) {
        await tx[this.modelName].create({
          data: {
            ...this.mapToDb(item),
            id: (item as any).id,
            userId: this.userId,
          },
        });
      }
    });
  }

  /**
   * Transform database record to application format
   */
  private mapFromDb(record: any): T {
    const result: any = { ...record };

    // Remove userId from result
    delete result.userId;

    // Handle backtest history summary denormalization
    if (this.storeName === 'backtestHistory') {
      result.summary = {
        totalReturn: record.totalReturn,
        totalReturnPct: record.totalReturnPct,
        sharpeRatio: record.sharpeRatio,
        tradeCount: record.tradeCount,
        duration: record.duration,
      };
      // Remove denormalized fields
      delete result.totalReturn;
      delete result.totalReturnPct;
      delete result.sharpeRatio;
      delete result.tradeCount;
      delete result.duration;
    }

    // Convert dates to ISO strings
    if (result.createdAt instanceof Date) {
      result.createdAt = result.createdAt.toISOString();
    }
    if (result.updatedAt instanceof Date) {
      result.updatedAt = result.updatedAt.toISOString();
    }

    return result as T;
  }

  /**
   * Transform application format to database format
   */
  private mapToDb(item: any): any {
    const result: any = { ...item };

    // Remove id and createdAt as they're managed by Prisma
    delete result.id;
    delete result.createdAt;

    // Flatten summary for backtest history
    if (this.storeName === 'backtestHistory' && item.summary) {
      result.totalReturn = item.summary.totalReturn;
      result.totalReturnPct = item.summary.totalReturnPct;
      result.sharpeRatio = item.summary.sharpeRatio;
      result.tradeCount = item.summary.tradeCount;
      result.duration = item.summary.duration;
      delete result.summary;
    }

    return result;
  }
}

/**
 * File storage for CSV datasets
 * Reads from user-configured CSV folder path
 * CSV files are managed locally by the user
 */
class UserFileStorage implements IFileStorageProvider {
  private readonly baseDir: string;

  constructor(csvDataPath?: string | null) {
    // Use user's configured path, or fall back to environment/default
    this.baseDir = csvDataPath || getCsvDataPath();
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  async listFiles(): Promise<string[]> {
    try {
      await this.ensureDir();
      const files = await readdir(this.baseDir);
      return files.filter(file => file.toLowerCase().endsWith('.csv'));
    } catch {
      return [];
    }
  }

  async exists(filename: string): Promise<boolean> {
    try {
      const filePath = join(this.baseDir, filename);
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  async readText(filename: string): Promise<string> {
    const filePath = join(this.baseDir, filename);
    return readFile(filePath, 'utf-8');
  }

  async readBinary(filename: string): Promise<ArrayBuffer> {
    const filePath = join(this.baseDir, filename);
    const buffer = await readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  async writeText(filename: string, content: string): Promise<void> {
    await this.ensureDir();
    const filePath = join(this.baseDir, filename);
    await writeFile(filePath, content, 'utf-8');
  }

  async writeBinary(filename: string, content: ArrayBuffer): Promise<void> {
    await this.ensureDir();
    const filePath = join(this.baseDir, filename);
    await writeFile(filePath, Buffer.from(content));
  }

  async delete(filename: string): Promise<boolean> {
    try {
      const filePath = join(this.baseDir, filename);
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getStats(filename: string): Promise<FileStats | null> {
    try {
      const filePath = join(this.baseDir, filename);
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
 * Database storage provider with user context
 * JSON data is user-scoped, CSV files are from user's configured local folder
 */
export class DatabaseStorageProvider implements StorageProvider {
  readonly mode: StorageMode = 'database';
  private readonly userId: string;
  private readonly csvDataPath: string | null;
  private jsonStores: Map<StoreName, JsonStorageProvider<any>> = new Map();
  private fileStore: UserFileStorage | null = null;

  constructor(userId: string, csvDataPath?: string | null) {
    this.userId = userId;
    this.csvDataPath = csvDataPath || null;
  }

  getJsonStore<T extends { id: string }>(storeName: StoreName): JsonStorageProvider<T> {
    if (!this.jsonStores.has(storeName)) {
      this.jsonStores.set(storeName, new DatabaseJsonStorage<T>(storeName, this.userId));
    }
    return this.jsonStores.get(storeName)!;
  }

  getFileStore(): IFileStorageProvider {
    // Use user's configured CSV folder path
    if (!this.fileStore) {
      this.fileStore = new UserFileStorage(this.csvDataPath);
    }
    return this.fileStore;
  }

  async initialize(): Promise<void> {
    // Database tables are created via Prisma migrations
    // Ensure CSV directory exists (use user's path or fallback to default)
    const csvDir = this.csvDataPath || getCsvDataPath();
    await mkdir(csvDir, { recursive: true });
  }

  async clearAll(): Promise<void> {
    // Delete all user data from all tables (but NOT CSV files - those are user-managed)
    await prisma.$transaction([
      prisma.indicator.deleteMany({ where: { userId: this.userId } }),
      prisma.strategy.deleteMany({ where: { userId: this.userId } }),
      prisma.backtestHistoryEntry.deleteMany({ where: { userId: this.userId } }),
      prisma.stockGroup.deleteMany({ where: { userId: this.userId } }),
      prisma.datasetMetadata.deleteMany({ where: { userId: this.userId } }),
      prisma.viewSetting.deleteMany({ where: { userId: this.userId } }),
    ]);
    // Note: CSV files are NOT deleted - they are managed locally by the user
  }
}

/**
 * Create a database storage provider instance with user context
 * @param userId - The authenticated user's ID
 * @param csvDataPath - Optional user-specific CSV data path
 */
export function createDatabaseStorageProvider(userId: string, csvDataPath?: string | null): StorageProvider {
  return new DatabaseStorageProvider(userId, csvDataPath);
}
