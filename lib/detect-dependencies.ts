import { Indicator } from './indicator-storage';

export interface DependencyResult {
  dependencies: string[];         // Indicator IDs
  dependencyColumns: string[];    // Specific column names used
}

/**
 * Detect which other indicators are referenced in the Python code
 * by looking for column names from other indicators.
 * Returns both indicator IDs and specific column names used.
 */
export function detectDependencies(
  pythonCode: string,
  allIndicators: Indicator[],
  currentIndicatorId?: string
): DependencyResult {
  const dependencies: string[] = [];
  const dependencyColumns: string[] = [];

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

        const patterns = [
          new RegExp(`data\\['${escapeRegex(fullColumnName)}'\\]`, 'g'),
          new RegExp(`data\\["${escapeRegex(fullColumnName)}"\\]`, 'g'),
          new RegExp(`data\\.${escapeRegex(fullColumnName)}\\b`, 'g'),
          new RegExp(`['"]${escapeRegex(fullColumnName)}['"]`, 'g'),
        ];

        const isReferenced = patterns.some(pattern => pattern.test(pythonCode));

        if (isReferenced) {
          referencedColumns.push(fullColumnName);
        }
      }

      // If any columns from this group are referenced, add as dependency
      if (referencedColumns.length > 0) {
        dependencies.push(indicator.id);
        dependencyColumns.push(...referencedColumns);
      }
    } else {
      // Single indicator
      const outputColumn = indicator.outputColumn;

      const patterns = [
        new RegExp(`data\\['${escapeRegex(outputColumn)}'\\]`, 'g'),
        new RegExp(`data\\["${escapeRegex(outputColumn)}"\\]`, 'g'),
        new RegExp(`data\\.${escapeRegex(outputColumn)}\\b`, 'g'),
        new RegExp(`['"]${escapeRegex(outputColumn)}['"]`, 'g'),
      ];

      const isReferenced = patterns.some(pattern => pattern.test(pythonCode));

      if (isReferenced) {
        dependencies.push(indicator.id);
        dependencyColumns.push(outputColumn);
      }
    }
  }

  return { dependencies, dependencyColumns };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
