import { Indicator } from './indicator-storage';

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
