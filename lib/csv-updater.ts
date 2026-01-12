import Papa from 'papaparse';
import { readFile, writeFile } from 'fs/promises';
import { getCsvFileStats } from './datasets';
import { cleanDateColumn } from './date-cleaner';
import { loadMetadata, saveMetadata } from './dataset-metadata';

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

/**
 * Rename all columns with a group indicator prefix across all datasets
 * E.g., rename all "aaa:xxx" columns to "bbb:xxx"
 */
export async function renameGroupIndicatorColumns(
  oldGroupName: string,
  newGroupName: string
): Promise<{ updatedCount: number; errors: string[] }> {
  const datasets = await loadMetadata();
  const oldPrefix = `${oldGroupName}:`;
  const newPrefix = `${newGroupName}:`;
  const errors: string[] = [];
  let updatedCount = 0;

  for (const dataset of datasets) {
    try {
      // Check if this dataset has columns with the old group prefix
      const columnsToRename = (dataset.columns || []).filter(col => col.startsWith(oldPrefix));

      if (columnsToRename.length === 0) {
        continue; // Skip datasets without the group indicator
      }

      const fileStats = await getCsvFileStats(dataset.filename);
      if (!fileStats.exists) {
        errors.push(`CSV file not found: ${dataset.filename}`);
        continue;
      }

      const fileContent = await readFile(fileStats.path, 'utf-8');

      await new Promise<void>((resolve, reject) => {
        Papa.parse(fileContent, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const rows = results.data as Record<string, any>[];
              const headers = results.meta.fields || [];

              // Create a mapping of old column names to new column names
              const columnMapping: Record<string, string> = {};
              for (const header of headers) {
                if (header.startsWith(oldPrefix)) {
                  const suffix = header.slice(oldPrefix.length);
                  columnMapping[header] = `${newPrefix}${suffix}`;
                }
              }

              // Rename columns in each row
              const renamedRows = rows.map(row => {
                const newRow: Record<string, any> = {};
                for (const [key, value] of Object.entries(row)) {
                  const newKey = columnMapping[key] || key;
                  newRow[newKey] = value;
                }
                return newRow;
              });

              // Clean date column if all dates are at midnight (T00:00:00.000)
              const datesCleaned = cleanDateColumn(renamedRows, 'date');
              if (datesCleaned) {
                console.log(`Cleaned date column: stripped T00:00:00.000 from all dates`);
              }

              // Generate updated CSV
              const updatedCsv = Papa.unparse(renamedRows);

              // Write back to file
              await writeFile(fileStats.path, updatedCsv, 'utf-8');

              // Update dataset metadata columns
              if (dataset.columns) {
                dataset.columns = dataset.columns.map(col => {
                  if (col.startsWith(oldPrefix)) {
                    const suffix = col.slice(oldPrefix.length);
                    return `${newPrefix}${suffix}`;
                  }
                  return col;
                });
              }

              updatedCount++;
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
    } catch (error) {
      errors.push(`Failed to update ${dataset.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Save updated metadata
  if (updatedCount > 0) {
    await saveMetadata(datasets);
  }

  return { updatedCount, errors };
}
