/**
 * Database-based storage implementation using Prisma/PostgreSQL
 * All data is scoped to the authenticated user
 * Stock price data is shared across all users via the Stock/StockPrice tables
 */

import { prisma } from '../prisma';
import type {
  StorageProvider,
  StorageMode,
  StoreName,
  JsonStorageProvider,
} from './types';

/**
 * Map store names to Prisma model info
 * Note: Indicator uses 'ownerId' instead of 'userId'
 */
const STORE_CONFIG: Record<StoreName, { model: string; userIdField: string }> = {
  indicators: { model: 'indicator', userIdField: 'ownerId' },
  strategies: { model: 'strategy', userIdField: 'userId' },
  backtestHistory: { model: 'backtestHistoryEntry', userIdField: 'userId' },
  groups: { model: 'stockGroup', userIdField: 'userId' },
  viewSettings: { model: 'viewSetting', userIdField: 'userId' },
};

/**
 * Database JSON storage with user scoping
 */
class DatabaseJsonStorage<T extends { id: string }> implements JsonStorageProvider<T> {
  private readonly storeName: StoreName;
  private readonly modelName: string;
  private readonly userIdField: string;
  private readonly userId: string;

  constructor(storeName: StoreName, userId: string) {
    this.storeName = storeName;
    const config = STORE_CONFIG[storeName];
    this.modelName = config.model;
    this.userIdField = config.userIdField;
    this.userId = userId;
  }

  private get model(): any {
    return (prisma as any)[this.modelName];
  }

  async getAll(): Promise<T[]> {
    const items = await this.model.findMany({
      where: { [this.userIdField]: this.userId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item: any) => this.mapFromDb(item));
  }

  async getById(id: string): Promise<T | null> {
    const item = await this.model.findFirst({
      where: { id, [this.userIdField]: this.userId },
    });
    return item ? this.mapFromDb(item) : null;
  }

  async create(item: Omit<T, 'id' | 'createdAt'>): Promise<T> {
    const created = await this.model.create({
      data: {
        ...this.mapToDb(item),
        [this.userIdField]: this.userId,
      },
    });
    return this.mapFromDb(created);
  }

  async update(id: string, updates: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T> {
    // Verify ownership
    const existing = await this.model.findFirst({
      where: { id, [this.userIdField]: this.userId },
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
      where: { id, [this.userIdField]: this.userId },
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
        where: { [this.userIdField]: this.userId },
      });

      for (const item of items) {
        await tx[this.modelName].create({
          data: {
            ...this.mapToDb(item),
            id: (item as any).id,
            [this.userIdField]: this.userId,
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

    // Remove userId/ownerId from result
    delete result.userId;
    delete result.ownerId;

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
    if (result.publishedAt instanceof Date) {
      result.publishedAt = result.publishedAt.toISOString();
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
 * Database storage provider with user context
 * All user-specific data is scoped by userId
 * Stock data is shared across all users
 */
export class DatabaseStorageProvider implements StorageProvider {
  readonly mode: StorageMode = 'database';
  private readonly userId: string;
  private jsonStores: Map<StoreName, JsonStorageProvider<any>> = new Map();

  constructor(userId: string) {
    this.userId = userId;
  }

  getJsonStore<T extends { id: string }>(storeName: StoreName): JsonStorageProvider<T> {
    if (!this.jsonStores.has(storeName)) {
      this.jsonStores.set(storeName, new DatabaseJsonStorage<T>(storeName, this.userId));
    }
    return this.jsonStores.get(storeName)!;
  }

  async initialize(): Promise<void> {
    // Database tables are created via Prisma migrations
    // Nothing to initialize here
  }

  async clearAll(): Promise<void> {
    // Delete all user data from all tables
    // Note: Stock/StockPrice data is shared and NOT deleted
    await prisma.$transaction([
      prisma.indicatorValueCache.deleteMany({ where: { userId: this.userId } }),
      prisma.indicatorSubscription.deleteMany({ where: { userId: this.userId } }),
      prisma.indicator.deleteMany({ where: { ownerId: this.userId } }),
      prisma.backtestHistoryEntry.deleteMany({ where: { userId: this.userId } }),
      prisma.strategy.deleteMany({ where: { userId: this.userId } }),
      prisma.stockGroup.deleteMany({ where: { userId: this.userId } }),
      prisma.viewSetting.deleteMany({ where: { userId: this.userId } }),
    ]);
  }
}

/**
 * Create a database storage provider instance with user context
 * @param userId - The authenticated user's ID
 */
export function createDatabaseStorageProvider(userId: string): StorageProvider {
  return new DatabaseStorageProvider(userId);
}
