import { Indicator } from './indicator-storage';

/**
 * Detect which other indicators are referenced in the Python code
 * by looking for column names from other indicators
 */
export function detectDependencies(
  pythonCode: string,
  allIndicators: Indicator[],
  currentIndicatorId?: string
): string[] {
  const dependencies: string[] = [];

  for (const indicator of allIndicators) {
    // Skip self-reference
    if (currentIndicatorId && indicator.id === currentIndicatorId) {
      continue;
    }

    // For group indicators, check for references to any of the group:name columns
    if (indicator.isGroup && indicator.expectedOutputs) {
      let groupReferenced = false;

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
          groupReferenced = true;
          break;  // One match is enough for the whole group
        }
      }

      if (groupReferenced) {
        dependencies.push(indicator.id);
      }
    } else {
      // Single indicator (existing logic)
      const outputColumn = indicator.outputColumn;

      // Look for references to this indicator's output column in the Python code
      // Common patterns:
      // - data['column_name']
      // - data["column_name"]
      // - data.column_name (less common but possible)
      // - 'column_name' or "column_name" anywhere in the code

      const patterns = [
        new RegExp(`data\\['${escapeRegex(outputColumn)}'\\]`, 'g'),
        new RegExp(`data\\["${escapeRegex(outputColumn)}"\\]`, 'g'),
        new RegExp(`data\\.${escapeRegex(outputColumn)}\\b`, 'g'),
        // Also check for string literals (in case of dynamic access)
        new RegExp(`['"]${escapeRegex(outputColumn)}['"]`, 'g'),
      ];

      const isReferenced = patterns.some(pattern => pattern.test(pythonCode));

      if (isReferenced) {
        dependencies.push(indicator.id);
      }
    }
  }

  return dependencies;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
