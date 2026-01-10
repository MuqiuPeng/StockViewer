/**
 * Migration script to populate datasets.json with existing CSV files
 */
import { readdir } from 'fs/promises';
import { join } from 'path';
import { getDatasetInfo } from '../lib/csv';
import { registerDataset } from '../lib/dataset-metadata';

async function migrateMetadata() {
  console.log('Starting metadata migration...');

  const csvDir = join(process.cwd(), 'data', 'csv');

  try {
    // Get all CSV files
    const files = await readdir(csvDir);
    const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));

    console.log(`Found ${csvFiles.length} CSV files to migrate`);

    let successCount = 0;
    let errorCount = 0;

    for (const filename of csvFiles) {
      try {
        console.log(`Processing ${filename}...`);

        // Extract code and dataSource from filename
        const nameParts = filename.replace(/\.csv$/i, '').split('_');
        const code = nameParts[0];
        const dataSource = nameParts.length > 1 ? nameParts.slice(1).join('_') : 'stock_zh_a_hist';

        // Get dataset info (dates, row count, columns, etc.)
        const datasetInfo = await getDatasetInfo(filename);

        // Register in metadata
        await registerDataset({
          id: `${code}_${dataSource}`,  // Generate unique ID
          code,
          name: code, // Default name is the code
          filename,
          dataSource,
          firstDate: datasetInfo.firstDate,
          lastDate: datasetInfo.lastDate,
          lastUpdate: datasetInfo.lastUpdate,
          rowCount: datasetInfo.rowCount,
          columns: datasetInfo.columns,
          indicators: datasetInfo.indicators || [],
        });

        console.log(`✓ Registered ${filename}`);
        successCount++;
      } catch (error) {
        console.error(`✗ Failed to process ${filename}:`, error);
        errorCount++;
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total: ${csvFiles.length}`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateMetadata();
