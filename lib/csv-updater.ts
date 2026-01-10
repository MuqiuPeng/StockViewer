import Papa from 'papaparse';
import { readFile, writeFile } from 'fs/promises';
import { getCsvFileStats } from './datasets';
import { cleanDateColumn } from './date-cleaner';

export async function addIndicatorGroupColumns(
  filename: string,
  groupName: string,
  indicatorValues: Record<string, (number | null)[]>
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

          // Validate all arrays have same length
          const firstKey = Object.keys(indicatorValues)[0];
          if (!firstKey) {
            throw new Error('No indicator values provided');
          }

          const expectedLength = indicatorValues[firstKey].length;

          // Check each indicator values array length
          for (const [key, values] of Object.entries(indicatorValues)) {
            if (values.length !== expectedLength) {
              throw new Error(
                `Inconsistent value lengths: ${key} has ${values.length} values, expected ${expectedLength}`
              );
            }
          }

          // Validate against CSV row count
          if (rows.length !== expectedLength) {
            throw new Error(
              `Row count mismatch: CSV has ${rows.length} rows, but indicators have ${expectedLength} values`
            );
          }

          const headers = results.meta.fields || [];

          // Add all columns with group:name format
          for (const [indicatorName, values] of Object.entries(indicatorValues)) {
            const columnName = `${groupName}:${indicatorName}`;

            if (headers.includes(columnName)) {
              console.warn(`Column ${columnName} already exists, will overwrite`);
            }

            // Add column to each row
            rows.forEach((row, index) => {
              row[columnName] = values[index];
            });
          }

          // Clean date column if all dates are at midnight (T00:00:00.000)
          const datesCleaned = cleanDateColumn(rows, 'date');
          if (datesCleaned) {
            console.log(`Cleaned date column: stripped T00:00:00.000 from all dates`);
          }

          // Generate updated CSV
          const updatedCsv = Papa.unparse(rows);

          // Write back to file
          await writeFile(fileStats.path, updatedCsv, 'utf-8');

          resolve();
        } catch (error) {
          reject(error);
        }
      },
      error: (error: Error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
}

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

          // Clean date column if all dates are at midnight (T00:00:00.000)
          const datesCleaned = cleanDateColumn(rows, 'date');
          if (datesCleaned) {
            console.log(`Cleaned date column: stripped T00:00:00.000 from all dates`);
          }

          // Generate updated CSV
          const updatedCsv = Papa.unparse(rows);

          // Write back to file
          await writeFile(fileStats.path, updatedCsv, 'utf-8');

          resolve();
        } catch (error) {
          reject(error);
        }
      },
      error: (error: Error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
}
