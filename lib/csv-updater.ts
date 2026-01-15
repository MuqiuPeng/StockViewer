import Papa from 'papaparse';
import { readFile, writeFile } from 'fs/promises';
import { getCsvFileStats } from './datasets';
import { cleanDateColumn } from './date-cleaner';
import { loadMetadata, saveMetadata } from './dataset-metadata';

// Basic columns that are always valid (from CSV data, not indicators)
export const REQUIRED_COLUMNS = ['date', 'open', 'high', 'low', 'close'];
export const BASE_INDICATORS = ['volume', 'turnover', 'amplitude', 'change_pct', 'change_amount', 'turnover_rate'];

/**
 * Get all unique column names across all datasets
 */
export async function getAllColumnsFromDatasets(): Promise<{ columns: Set<string>; errors: string[] }> {
  const datasets = await loadMetadata();
  const allColumns = new Set<string>();
  const errors: string[] = [];

  for (const dataset of datasets) {
    try {
      const fileStats = await getCsvFileStats(dataset.filename);
      if (!fileStats.exists) {
        continue;
      }

      const fileContent = await readFile(fileStats.path, 'utf-8');

      await new Promise<void>((resolve, reject) => {
        Papa.parse(fileContent, {
          header: true,
          preview: 1, // Only need headers, not all data
          complete: (results) => {
            const headers = results.meta.fields || [];
            headers.forEach(col => allColumns.add(col));
            resolve();
          },
          error: (error: Error) => {
            reject(new Error(`CSV parsing error: ${error.message}`));
          },
        });
      });
    } catch (error) {
      errors.push(`Failed to read ${dataset.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { columns: allColumns, errors };
}

/**
 * Remove specific columns from all datasets
 */
export async function removeColumnsFromAllDatasets(
  columnsToRemove: string[]
): Promise<{ updatedCount: number; errors: string[] }> {
  const datasets = await loadMetadata();
  const errors: string[] = [];
  let updatedCount = 0;

  for (const dataset of datasets) {
    try {
      const fileStats = await getCsvFileStats(dataset.filename);
      if (!fileStats.exists) {
        continue;
      }

      const fileContent = await readFile(fileStats.path, 'utf-8');

      const updated = await new Promise<boolean>((resolve, reject) => {
        Papa.parse(fileContent, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const rows = results.data as Record<string, any>[];
              const headers = results.meta.fields || [];

              // Check if this CSV has any of the columns to remove
              const matchingColumns = headers.filter(col => columnsToRemove.includes(col));

              if (matchingColumns.length === 0) {
                resolve(false);
                return;
              }

              // Remove the specified columns from each row
              const updatedRows = rows.map(row => {
                const newRow: Record<string, any> = {};
                for (const [key, value] of Object.entries(row)) {
                  if (!columnsToRemove.includes(key)) {
                    newRow[key] = value;
                  }
                }
                return newRow;
              });

              // Clean date column
              cleanDateColumn(updatedRows, 'date');

              // Generate updated CSV
              const updatedCsv = Papa.unparse(updatedRows);

              // Write back to file
              await writeFile(fileStats.path, updatedCsv, 'utf-8');

              // Update dataset metadata columns if present
              if (dataset.columns) {
                dataset.columns = dataset.columns.filter(col => !columnsToRemove.includes(col));
              }

              resolve(true);
            } catch (error) {
              reject(error);
            }
          },
          error: (error: Error) => {
            reject(new Error(`CSV parsing error: ${error.message}`));
          },
        });
      });

      if (updated) {
        updatedCount++;
      }
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

/**
 * Remove specific columns from a group indicator across all datasets
 * Used when expectedOutputs are removed from a group indicator
 */
export async function removeGroupIndicatorColumns(
  groupName: string,
  columnsToRemove: string[]
): Promise<{ updatedCount: number; errors: string[] }> {
  const datasets = await loadMetadata();
  const errors: string[] = [];
  let updatedCount = 0;

  // Build full column names to remove (e.g., "groupName:output1")
  const fullColumnNames = columnsToRemove.map(col => `${groupName}:${col}`);

  for (const dataset of datasets) {
    try {
      const fileStats = await getCsvFileStats(dataset.filename);
      if (!fileStats.exists) {
        continue; // Skip non-existent files silently
      }

      const fileContent = await readFile(fileStats.path, 'utf-8');

      const updated = await new Promise<boolean>((resolve, reject) => {
        Papa.parse(fileContent, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const rows = results.data as Record<string, any>[];
              const headers = results.meta.fields || [];

              // Check if this CSV has any of the columns to remove (check actual CSV headers)
              const matchingColumns = headers.filter(col =>
                fullColumnNames.includes(col)
              );

              if (matchingColumns.length === 0) {
                resolve(false); // No columns to remove in this file
                return;
              }

              // Remove the specified columns from each row
              const updatedRows = rows.map(row => {
                const newRow: Record<string, any> = {};
                for (const [key, value] of Object.entries(row)) {
                  if (!fullColumnNames.includes(key)) {
                    newRow[key] = value;
                  }
                }
                return newRow;
              });

              // Clean date column if all dates are at midnight (T00:00:00.000)
              const datesCleaned = cleanDateColumn(updatedRows, 'date');
              if (datesCleaned) {
                console.log(`Cleaned date column: stripped T00:00:00.000 from all dates`);
              }

              // Generate updated CSV
              const updatedCsv = Papa.unparse(updatedRows);

              // Write back to file
              await writeFile(fileStats.path, updatedCsv, 'utf-8');

              // Update dataset metadata columns if present
              if (dataset.columns) {
                dataset.columns = dataset.columns.filter(col =>
                  !fullColumnNames.includes(col)
                );
              }

              resolve(true);
            } catch (error) {
              reject(error);
            }
          },
          error: (error: Error) => {
            reject(new Error(`CSV parsing error: ${error.message}`));
          },
        });
      });

      if (updated) {
        updatedCount++;
      }
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

/**
 * Clean up orphaned columns for a group indicator across all datasets
 * Removes columns that match the group prefix but aren't in the expected outputs
 */
export async function cleanupOrphanedGroupColumns(
  groupName: string,
  expectedOutputs: string[]
): Promise<{ removedColumns: string[]; errors: string[] }> {
  const datasets = await loadMetadata();
  const errors: string[] = [];
  const removedColumns: string[] = [];
  const prefix = `${groupName}:`;

  // Build set of valid column names
  const validColumns = new Set(expectedOutputs.map(output => `${groupName}:${output}`));

  for (const dataset of datasets) {
    try {
      const fileStats = await getCsvFileStats(dataset.filename);
      if (!fileStats.exists) {
        continue;
      }

      const fileContent = await readFile(fileStats.path, 'utf-8');

      const result = await new Promise<{ updated: boolean; removed: string[] }>((resolve, reject) => {
        Papa.parse(fileContent, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const rows = results.data as Record<string, any>[];
              const headers = results.meta.fields || [];

              // Find orphaned columns (match prefix but not in valid set)
              const orphanedColumns = headers.filter(
                col => col.startsWith(prefix) && !validColumns.has(col)
              );

              if (orphanedColumns.length === 0) {
                resolve({ updated: false, removed: [] });
                return;
              }

              // Remove orphaned columns from each row
              const updatedRows = rows.map(row => {
                const newRow: Record<string, any> = {};
                for (const [key, value] of Object.entries(row)) {
                  if (!orphanedColumns.includes(key)) {
                    newRow[key] = value;
                  }
                }
                return newRow;
              });

              // Clean date column if all dates are at midnight
              const datesCleaned = cleanDateColumn(updatedRows, 'date');
              if (datesCleaned) {
                console.log(`Cleaned date column: stripped T00:00:00.000 from all dates`);
              }

              // Generate updated CSV
              const updatedCsv = Papa.unparse(updatedRows);

              // Write back to file
              await writeFile(fileStats.path, updatedCsv, 'utf-8');

              // Update dataset metadata columns if present
              if (dataset.columns) {
                dataset.columns = dataset.columns.filter(col => !orphanedColumns.includes(col));
              }

              resolve({ updated: true, removed: orphanedColumns });
            } catch (error) {
              reject(error);
            }
          },
          error: (error: Error) => {
            reject(new Error(`CSV parsing error: ${error.message}`));
          },
        });
      });

      if (result.updated) {
        removedColumns.push(...result.removed);
      }
    } catch (error) {
      errors.push(`Failed to update ${dataset.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Save updated metadata if any columns were removed
  if (removedColumns.length > 0) {
    await saveMetadata(datasets);
  }

  return { removedColumns, errors };
}
