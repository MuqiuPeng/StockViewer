/**
 * Minimal indicator info needed for dependency detection
 */
export interface IndicatorForDependency {
  id: string;
  name?: string;
  outputColumn: string;
  isGroup: boolean;
  groupName?: string | null;
  expectedOutputs?: string[];
}

export interface DependencyResult {
  dependencies: string[];         // Indicator IDs
  dependencyColumns: string[];    // Specific column names used
  datasetIndices: number[];       // dataset[n] indices referenced in code
  importedDatasets: string[];     // dataset symbols referenced via data.import_('symbol', type='dataset')
}

/**
 * Detect which other indicators are referenced in the Python code
 * by looking for column names from other indicators.
 * Also detects columns from external datasets in format xxx@yyy.
 * Returns both indicator IDs and specific column names used.
 */
export function detectDependencies(
  pythonCode: string,
  allIndicators: IndicatorForDependency[],
  currentIndicatorId?: string
): DependencyResult {
  const dependencies: string[] = [];
  const dependencyColumns: string[] = [];
  const addedColumns = new Set<string>(); // Track unique columns

  // First, detect external dataset columns in format xxx@yyy
  // These appear as data['dataset@column'] or data["dataset@column"]
  const externalColPatterns = [
    /data\['([^']+)@([^']+)'\]/g,
    /data\["([^"]+)@([^"]+)"\]/g,
  ];

  for (const pattern of externalColPatterns) {
    let match;
    while ((match = pattern.exec(pythonCode)) !== null) {
      const columnName = match[2]; // The yyy part after @

      // Check if this column corresponds to any indicator
      for (const indicator of allIndicators) {
        if (currentIndicatorId && indicator.id === currentIndicatorId) {
          continue;
        }

        let matchedColumn: string | null = null;

        if (indicator.isGroup && indicator.expectedOutputs) {
          // Check group indicator outputs
          for (const outputName of indicator.expectedOutputs) {
            const fullColumnName = `${indicator.groupName}:${outputName}`;
            if (columnName === fullColumnName || columnName === outputName) {
              matchedColumn = fullColumnName;
              break;
            }
          }
        } else if (indicator.outputColumn === columnName) {
          // Check single indicator output
          matchedColumn = indicator.outputColumn;
        }

        if (matchedColumn && !addedColumns.has(matchedColumn)) {
          if (!dependencies.includes(indicator.id)) {
            dependencies.push(indicator.id);
          }
          dependencyColumns.push(matchedColumn);
          addedColumns.add(matchedColumn);
        }
      }
    }
  }

  // Then detect direct column references
  for (const indicator of allIndicators) {
    // Skip self-reference
    if (currentIndicatorId && indicator.id === currentIndicatorId) {
      continue;
    }

    // For group indicators, check for references to each specific column
    if (indicator.isGroup && indicator.expectedOutputs) {
      const referencedColumns: string[] = [];

      for (const outputName of indicator.expectedOutputs) {
        const fullColumnName = `${indicator.groupName}:${outputName}`;

        // Skip if already added from external dataset detection
        if (addedColumns.has(fullColumnName)) {
          continue;
        }

        const patterns = [
          new RegExp(`data\\['${escapeRegex(fullColumnName)}'\\]`, 'g'),
          new RegExp(`data\\["${escapeRegex(fullColumnName)}"\\]`, 'g'),
          new RegExp(`data\\.${escapeRegex(fullColumnName)}\\b`, 'g'),
          new RegExp(`['"]${escapeRegex(fullColumnName)}['"]`, 'g'),
        ];

        const isReferenced = patterns.some(pattern => pattern.test(pythonCode));

        if (isReferenced) {
          referencedColumns.push(fullColumnName);
          addedColumns.add(fullColumnName);
        }
      }

      // If any columns from this group are referenced, add as dependency
      if (referencedColumns.length > 0) {
        if (!dependencies.includes(indicator.id)) {
          dependencies.push(indicator.id);
        }
        dependencyColumns.push(...referencedColumns);
      }
    } else {
      // Single indicator
      const outputColumn = indicator.outputColumn;

      // Skip if already added from external dataset detection
      if (addedColumns.has(outputColumn)) {
        continue;
      }

      const patterns = [
        new RegExp(`data\\['${escapeRegex(outputColumn)}'\\]`, 'g'),
        new RegExp(`data\\["${escapeRegex(outputColumn)}"\\]`, 'g'),
        new RegExp(`data\\.${escapeRegex(outputColumn)}\\b`, 'g'),
        new RegExp(`['"]${escapeRegex(outputColumn)}['"]`, 'g'),
      ];

      const isReferenced = patterns.some(pattern => pattern.test(pythonCode));

      if (isReferenced) {
        if (!dependencies.includes(indicator.id)) {
          dependencies.push(indicator.id);
        }
        dependencyColumns.push(outputColumn);
        addedColumns.add(outputColumn);
      }
    }
  }

  // Detect dataset[n] references
  const datasetIndices: number[] = [];
  const datasetPattern = /dataset\[(\d+)\]/g;
  let dsMatch;
  while ((dsMatch = datasetPattern.exec(pythonCode)) !== null) {
    const idx = parseInt(dsMatch[1], 10);
    if (!datasetIndices.includes(idx)) {
      datasetIndices.push(idx);
    }
  }
  datasetIndices.sort((a, b) => a - b);

  // Detect data.import_('symbol', type='dataset') references
  const importedDatasets: string[] = [];
  const importPatterns = [
    /data\.import_\(\s*['"]([^'"]+)['"]\s*,\s*type\s*=\s*['"]dataset['"]\s*\)/g,
    /data\.import_\(\s*['"]([^'"]+)['"]\s*\)/g,  // import_ without explicit type
  ];
  for (const pattern of importPatterns) {
    let impMatch;
    while ((impMatch = pattern.exec(pythonCode)) !== null) {
      const symbol = impMatch[1];
      if (!importedDatasets.includes(symbol)) {
        importedDatasets.push(symbol);
      }
    }
  }

  return { dependencies, dependencyColumns, datasetIndices, importedDatasets };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
