/*
  Warnings:

  - You are about to drop the column `downloadCount` on the `Indicator` table. All the data in the column will be lost.
  - You are about to drop the column `publishedAt` on the `Indicator` table. All the data in the column will be lost.
  - You are about to drop the column `rating` on the `Indicator` table. All the data in the column will be lost.
  - You are about to drop the column `ratingCount` on the `Indicator` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `Indicator` table. All the data in the column will be lost.
  - You are about to drop the column `visibility` on the `Indicator` table. All the data in the column will be lost.
  - You are about to drop the `IndicatorSubscription` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "IndicatorSubscription" DROP CONSTRAINT "IndicatorSubscription_indicatorId_fkey";

-- DropForeignKey
ALTER TABLE "IndicatorSubscription" DROP CONSTRAINT "IndicatorSubscription_userId_fkey";

-- DropIndex
DROP INDEX "Indicator_downloadCount_idx";

-- DropIndex
DROP INDEX "Indicator_publishedAt_idx";

-- DropIndex
DROP INDEX "Indicator_visibility_idx";

-- AlterTable
ALTER TABLE "Indicator" DROP COLUMN "downloadCount",
DROP COLUMN "publishedAt",
DROP COLUMN "rating",
DROP COLUMN "ratingCount",
DROP COLUMN "version",
DROP COLUMN "visibility",
ADD COLUMN     "visibleTo" TEXT[],
ALTER COLUMN "tags" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StockGroup" ALTER COLUMN "stockIds" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StockPrice" ALTER COLUMN "turnover" SET DATA TYPE DECIMAL(24,2),
ALTER COLUMN "amplitude" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "changePct" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "turnoverRate" SET DATA TYPE DECIMAL(12,4);

-- DropTable
DROP TABLE "IndicatorSubscription";

-- DropEnum
DROP TYPE "IndicatorVisibility";

-- CreateIndex
CREATE INDEX "BacktestHistoryEntry_strategyId_idx" ON "BacktestHistoryEntry"("strategyId");

-- CreateIndex
CREATE INDEX "Indicator_visibleTo_idx" ON "Indicator"("visibleTo");
