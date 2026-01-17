-- Storage Re-architecture Migration
-- This migration transforms the storage system to support:
-- 1. Shared stock data across all users
-- 2. Public indicator library with subscriptions
-- 3. Database-only storage mode (remove local/online modes)

-- ============================================================================
-- Step 1: Create Enums
-- ============================================================================

-- CreateEnum
CREATE TYPE "IndicatorVisibility" AS ENUM ('PRIVATE', 'PUBLIC', 'UNLISTED');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- ============================================================================
-- Step 2: Create New Tables (Stock Data)
-- ============================================================================

-- CreateTable: Stock (shared stock master data)
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "category" TEXT,
    "exchange" TEXT,
    "firstDate" TIMESTAMP(3),
    "lastDate" TIMESTAMP(3),
    "lastUpdate" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StockPrice (time-series price data)
CREATE TABLE "StockPrice" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(18,4) NOT NULL,
    "high" DECIMAL(18,4) NOT NULL,
    "low" DECIMAL(18,4) NOT NULL,
    "close" DECIMAL(18,4) NOT NULL,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "turnover" DECIMAL(20,2),
    "amplitude" DECIMAL(8,4),
    "changePct" DECIMAL(8,4),
    "changeAmount" DECIMAL(18,4),
    "turnoverRate" DECIMAL(8,4),

    CONSTRAINT "StockPrice_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Step 3: Create New Tables (Indicator System)
-- ============================================================================

-- CreateTable: IndicatorSubscription
CREATE TABLE "IndicatorSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoUpdate" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IndicatorSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IndicatorValue (shared cache for public indicators)
CREATE TABLE "IndicatorValue" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(18,6),
    "groupValues" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndicatorValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IndicatorValueCache (user-specific cache)
CREATE TABLE "IndicatorValueCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(18,6),
    "groupValues" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndicatorValueCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DataImportJob
CREATE TABLE "DataImportJob" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataImportJob_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Step 4: Modify Indicator Table
-- ============================================================================

-- Add new columns to Indicator
ALTER TABLE "Indicator" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Indicator" ADD COLUMN "visibility" "IndicatorVisibility" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "Indicator" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "Indicator" ADD COLUMN "category" TEXT;
ALTER TABLE "Indicator" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Indicator" ADD COLUMN "version" TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE "Indicator" ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Indicator" ADD COLUMN "rating" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Indicator" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- Migrate data: copy userId to ownerId
UPDATE "Indicator" SET "ownerId" = "userId";

-- Make ownerId required
ALTER TABLE "Indicator" ALTER COLUMN "ownerId" SET NOT NULL;

-- Drop old userId column and constraints
ALTER TABLE "Indicator" DROP CONSTRAINT IF EXISTS "Indicator_userId_name_key";
DROP INDEX IF EXISTS "Indicator_userId_idx";
ALTER TABLE "Indicator" DROP COLUMN "userId";

-- ============================================================================
-- Step 5: Modify StockGroup Table
-- ============================================================================

-- Add new stockIds column
ALTER TABLE "StockGroup" ADD COLUMN "stockIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Drop old datasetNames column
ALTER TABLE "StockGroup" DROP COLUMN "datasetNames";

-- ============================================================================
-- Step 6: Modify UserSettings Table
-- ============================================================================

-- Drop csvDataPath column (no longer needed)
ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "csvDataPath";

-- ============================================================================
-- Step 7: Drop Old Tables
-- ============================================================================

-- Drop DatasetMetadata table (data merged into Stock)
DROP TABLE IF EXISTS "DatasetMetadata";

-- ============================================================================
-- Step 8: Create Indexes
-- ============================================================================

-- Stock indexes
CREATE UNIQUE INDEX "Stock_symbol_dataSource_key" ON "Stock"("symbol", "dataSource");
CREATE INDEX "Stock_symbol_idx" ON "Stock"("symbol");
CREATE INDEX "Stock_dataSource_idx" ON "Stock"("dataSource");
CREATE INDEX "Stock_category_idx" ON "Stock"("category");
CREATE INDEX "Stock_lastDate_idx" ON "Stock"("lastDate");

-- StockPrice indexes
CREATE UNIQUE INDEX "StockPrice_stockId_date_key" ON "StockPrice"("stockId", "date");
CREATE INDEX "StockPrice_stockId_date_idx" ON "StockPrice"("stockId", "date");
CREATE INDEX "StockPrice_date_idx" ON "StockPrice"("date");

-- Indicator indexes
CREATE UNIQUE INDEX "Indicator_ownerId_name_key" ON "Indicator"("ownerId", "name");
CREATE INDEX "Indicator_ownerId_idx" ON "Indicator"("ownerId");
CREATE INDEX "Indicator_visibility_idx" ON "Indicator"("visibility");
CREATE INDEX "Indicator_category_idx" ON "Indicator"("category");
CREATE INDEX "Indicator_publishedAt_idx" ON "Indicator"("publishedAt");
CREATE INDEX "Indicator_downloadCount_idx" ON "Indicator"("downloadCount");

-- IndicatorSubscription indexes
CREATE UNIQUE INDEX "IndicatorSubscription_userId_indicatorId_key" ON "IndicatorSubscription"("userId", "indicatorId");
CREATE INDEX "IndicatorSubscription_userId_idx" ON "IndicatorSubscription"("userId");
CREATE INDEX "IndicatorSubscription_indicatorId_idx" ON "IndicatorSubscription"("indicatorId");

-- IndicatorValue indexes
CREATE UNIQUE INDEX "IndicatorValue_indicatorId_stockId_date_key" ON "IndicatorValue"("indicatorId", "stockId", "date");
CREATE INDEX "IndicatorValue_indicatorId_stockId_date_idx" ON "IndicatorValue"("indicatorId", "stockId", "date");
CREATE INDEX "IndicatorValue_stockId_date_idx" ON "IndicatorValue"("stockId", "date");

-- IndicatorValueCache indexes
CREATE UNIQUE INDEX "IndicatorValueCache_userId_indicatorId_stockId_date_key" ON "IndicatorValueCache"("userId", "indicatorId", "stockId", "date");
CREATE INDEX "IndicatorValueCache_userId_stockId_date_idx" ON "IndicatorValueCache"("userId", "stockId", "date");
CREATE INDEX "IndicatorValueCache_indicatorId_stockId_idx" ON "IndicatorValueCache"("indicatorId", "stockId");

-- DataImportJob indexes
CREATE INDEX "DataImportJob_status_idx" ON "DataImportJob"("status");
CREATE INDEX "DataImportJob_symbol_dataSource_idx" ON "DataImportJob"("symbol", "dataSource");

-- ============================================================================
-- Step 9: Add Foreign Keys
-- ============================================================================

-- StockPrice -> Stock
ALTER TABLE "StockPrice" ADD CONSTRAINT "StockPrice_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indicator -> User (owner)
ALTER TABLE "Indicator" ADD CONSTRAINT "Indicator_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- IndicatorSubscription -> User
ALTER TABLE "IndicatorSubscription" ADD CONSTRAINT "IndicatorSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- IndicatorSubscription -> Indicator
ALTER TABLE "IndicatorSubscription" ADD CONSTRAINT "IndicatorSubscription_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- IndicatorValue -> Indicator
ALTER TABLE "IndicatorValue" ADD CONSTRAINT "IndicatorValue_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- IndicatorValueCache -> User
ALTER TABLE "IndicatorValueCache" ADD CONSTRAINT "IndicatorValueCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- IndicatorValueCache -> Indicator
ALTER TABLE "IndicatorValueCache" ADD CONSTRAINT "IndicatorValueCache_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "Indicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BacktestHistoryEntry -> Strategy (with SetNull on delete)
-- Note: This may already exist, so we use IF NOT EXISTS pattern
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BacktestHistoryEntry_strategyId_fkey'
    ) THEN
        ALTER TABLE "BacktestHistoryEntry" ADD CONSTRAINT "BacktestHistoryEntry_strategyId_fkey"
        FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;
