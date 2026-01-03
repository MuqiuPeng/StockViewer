import Papa from 'papaparse';
import { readFile, writeFile } from 'fs/promises';
import { getCsvFileStats } from './datasets';

export async function addIndicatorColumn(
  filename: string,
  columnName: string,
  values: (number | null)[]
): Promise<void> {
  const fileStats = await getCsvFileStats(filename);
  if (!fileStats.exists) {
    throw new Error(`CSV file not found: ${filename}`);
  }

  const fileContent = await readFile(fileStats.path, 'utf-8');

  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as Record<string, any>[];

          if (rows.length !== values.length) {
            throw new Error(
              `Row count mismatch: CSV has ${rows.length} rows, but values has ${values.length}`
            );
          }

          // Check if column already exists
          const headers = results.meta.fields || [];
          if (headers.includes(columnName)) {
            console.warn(`Column ${columnName} already exists, will overwrite`);
          }

          // Add new column to each row
          rows.forEach((row, index) => {
            row[columnName] = values[index];
          });

          // Generate updated CSV
          const updatedCsv = Papa.unparse(rows);

          // Write back to file
          await writeFile(fileStats.path, updatedCsv, 'utf-8');

          resolve();
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
}
