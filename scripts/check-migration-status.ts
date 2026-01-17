/**
 * Check migration status
 *
 * This script checks the current state of the database and reports any issues.
 * Run with: npx tsx scripts/check-migration-status.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('=== Migration Status Check ===\n');

  // User statistics
  const userCount = await prisma.user.count();
  console.log(`Users: ${userCount}`);

  // Stock statistics
  const stockCount = await prisma.stock.count();
  const priceRowCount = await prisma.stockPrice.count();
  console.log(`\nStocks: ${stockCount}`);
  console.log(`Price rows: ${priceRowCount.toLocaleString()}`);

  // Stocks by data source
  const stocksBySource = await prisma.stock.groupBy({
    by: ['dataSource'],
    _count: { id: true },
  });

  if (stocksBySource.length > 0) {
    console.log('\nStocks by data source:');
    for (const group of stocksBySource) {
      console.log(`  - ${group.dataSource}: ${group._count.id}`);
    }
  }

  // Indicator statistics
  const indicatorCount = await prisma.indicator.count();
  const publicIndicators = await prisma.indicator.count({ where: { visibleTo: { isEmpty: true } } });
  const privateIndicators = indicatorCount - publicIndicators;
  console.log(`\nIndicators: ${indicatorCount}`);
  console.log(`  - Public (visibleTo empty): ${publicIndicators}`);
  console.log(`  - Private/Shared: ${privateIndicators}`);

  // Cached indicator values
  const sharedCacheCount = await prisma.indicatorValue.count();
  const userCacheCount = await prisma.indicatorValueCache.count();
  console.log(`\nIndicator cache:`);
  console.log(`  - Shared cache (IndicatorValue): ${sharedCacheCount.toLocaleString()}`);
  console.log(`  - User cache (IndicatorValueCache): ${userCacheCount.toLocaleString()}`);

  // Strategy statistics
  const strategyCount = await prisma.strategy.count();
  console.log(`\nStrategies: ${strategyCount}`);

  // Backtest history
  const backtestCount = await prisma.backtestHistoryEntry.count();
  console.log(`Backtest history entries: ${backtestCount}`);

  // Stock groups
  const groupCount = await prisma.stockGroup.count();
  console.log(`\nStock groups: ${groupCount}`);

  // View settings
  const viewSettingCount = await prisma.viewSetting.count();
  console.log(`View settings: ${viewSettingCount}`);

  // Import jobs
  const pendingJobs = await prisma.dataImportJob.count({ where: { status: 'PENDING' } });
  const processingJobs = await prisma.dataImportJob.count({ where: { status: 'PROCESSING' } });
  const completedJobs = await prisma.dataImportJob.count({ where: { status: 'COMPLETED' } });
  const failedJobs = await prisma.dataImportJob.count({ where: { status: 'FAILED' } });
  console.log(`\nImport jobs:`);
  console.log(`  - Pending: ${pendingJobs}`);
  console.log(`  - Processing: ${processingJobs}`);
  console.log(`  - Completed: ${completedJobs}`);
  console.log(`  - Failed: ${failedJobs}`);

  // Check for stocks without price data
  const stocksWithoutPrices = await prisma.stock.findMany({
    where: { rowCount: 0 },
    select: { symbol: true, dataSource: true },
  });

  if (stocksWithoutPrices.length > 0) {
    console.log(`\n⚠️  Stocks without price data: ${stocksWithoutPrices.length}`);
    for (const stock of stocksWithoutPrices.slice(0, 5)) {
      console.log(`    - ${stock.symbol} (${stock.dataSource})`);
    }
    if (stocksWithoutPrices.length > 5) {
      console.log(`    ... and ${stocksWithoutPrices.length - 5} more`);
    }
  }

  // Sample stock data
  if (stockCount > 0) {
    console.log('\n--- Sample Stocks ---');
    const sampleStocks = await prisma.stock.findMany({
      take: 5,
      orderBy: { rowCount: 'desc' },
    });

    for (const stock of sampleStocks) {
      console.log(`  ${stock.symbol} (${stock.name})`);
      console.log(`    Data source: ${stock.dataSource}`);
      console.log(`    Rows: ${stock.rowCount.toLocaleString()}`);
      console.log(`    Date range: ${stock.firstDate?.toISOString().split('T')[0] || 'N/A'} - ${stock.lastDate?.toISOString().split('T')[0] || 'N/A'}`);
      console.log(`    Last update: ${stock.lastUpdate?.toISOString() || 'N/A'}`);
    }
  }

  console.log('\n=== Check Complete ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
