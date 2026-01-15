import { Indicator } from './indicator-storage';

/**
 * Replace column name references in Python code
 * Handles patterns like: data['column_name'], data["column_name"], data[column_name]
 */
export function replaceColumnInCode(
  code: string,
  oldColumnName: string,
  newColumnName: string
): string {
  // Escape special regex characters in the column name
  const escapedOld = oldColumnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pattern 1: data['column_name'] or data["column_name"]
  const singleQuotePattern = new RegExp(`data\\['${escapedOld}'\\]`, 'g');
  const doubleQuotePattern = new RegExp(`data\\["${escapedOld}"\\]`, 'g');

  // Pattern 2: Direct string references (for dict returns in group indicators)
  // e.g., 'column_name': value or "column_name": value
  const dictKeySingle = new RegExp(`'${escapedOld}'\\s*:`, 'g');
  const dictKeyDouble = new RegExp(`"${escapedOld}"\\s*:`, 'g');

  let result = code;
  result = result.replace(singleQuotePattern, `data['${newColumnName}']`);
  result = result.replace(doubleQuotePattern, `data["${newColumnName}"]`);
  result = result.replace(dictKeySingle, `'${newColumnName}':`);
  result = result.replace(dictKeyDouble, `"${newColumnName}":`);

  return result;
}

/**
 * Find all indicators that depend on the given indicator
 */
export function findDependentIndicators(
  indicatorId: string,
  allIndicators: Indicator[]
): Indicator[] {
  return allIndicators.filter(ind =>
    ind.dependencies && ind.dependencies.includes(indicatorId)
  );
}

/**
 * Find all indicators that depend on specific columns
 * Returns a map of column name -> indicators that use it
 */
export function findIndicatorsDependingOnColumns(
  columnNames: string[],
  allIndicators: Indicator[]
): Map<string, Indicator[]> {
  const result = new Map<string, Indicator[]>();

  for (const columnName of columnNames) {
    const dependentIndicators = allIndicators.filter(ind =>
      ind.dependencyColumns && ind.dependencyColumns.includes(columnName)
    );
    if (dependentIndicators.length > 0) {
      result.set(columnName, dependentIndicators);
    }
  }

  return result;
}

/**
 * Find all indicators that the given indicator depends on (recursively)
 */
export function findAllDependencies(
  indicatorId: string,
  allIndicators: Indicator[],
  visited: Set<string> = new Set()
): Indicator[] {
  if (visited.has(indicatorId)) {
    return [];
  }
  visited.add(indicatorId);

  const indicator = allIndicators.find(ind => ind.id === indicatorId);
  if (!indicator || !indicator.dependencies || indicator.dependencies.length === 0) {
    return [];
  }

  const result: Indicator[] = [];
  for (const depId of indicator.dependencies) {
    const dep = allIndicators.find(ind => ind.id === depId);
    if (dep) {
      result.push(dep);
      result.push(...findAllDependencies(depId, allIndicators, visited));
    }
  }

  return result;
}

/**
 * Topologically sort indicators based on dependencies
 * Returns indicators in the order they should be calculated
 */
export function topologicalSort(indicators: Indicator[]): Indicator[] {
  const sorted: Indicator[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(indicator: Indicator): boolean {
    if (visited.has(indicator.id)) {
      return true;
    }
    if (visiting.has(indicator.id)) {
      // Circular dependency detected
      console.error(`Circular dependency detected for indicator: ${indicator.name}`);
      return false;
    }

    visiting.add(indicator.id);

    // Visit dependencies first
    if (indicator.dependencies && indicator.dependencies.length > 0) {
      for (const depId of indicator.dependencies) {
        const dep = indicators.find(ind => ind.id === depId);
        if (dep) {
          if (!visit(dep)) {
            return false;
          }
        }
      }
    }

    visiting.delete(indicator.id);
    visited.add(indicator.id);
    sorted.push(indicator);
    return true;
  }

  // Visit all indicators
  for (const indicator of indicators) {
    if (!visited.has(indicator.id)) {
      visit(indicator);
    }
  }

  return sorted;
}

/**
 * Get all indicators that need to be deleted when deleting the given indicator
 * (includes the indicator itself and all its dependents recursively)
 */
export function getCascadeDeleteList(
  indicatorId: string,
  allIndicators: Indicator[]
): Indicator[] {
  const toDelete = new Set<string>();

  function addDependents(id: string) {
    if (toDelete.has(id)) {
      return;
    }
    toDelete.add(id);

    const dependents = findDependentIndicators(id, allIndicators);
    for (const dep of dependents) {
      addDependents(dep.id);
    }
  }

  addDependents(indicatorId);

  return Array.from(toDelete)
    .map(id => allIndicators.find(ind => ind.id === id))
    .filter((ind): ind is Indicator => ind !== undefined);
}
