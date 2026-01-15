import { NextResponse } from 'next/server';
import { loadIndicators } from '@/lib/indicator-storage';
import { findIndicatorsDependingOnColumns } from '@/lib/indicator-dependencies';
import { getAllColumnsFromDatasets, REQUIRED_COLUMNS, BASE_INDICATORS, removeColumnsFromAllDatasets } from '@/lib/csv-updater';
import { deleteIndicator, saveIndicators } from '@/lib/indicator-storage';

export const runtime = 'nodejs';

/**
 * GET /api/check-orphaned-columns
 * Check for columns in CSV files that don't correspond to any defined indicator
 *
 * Returns:
 * - orphanedColumns: columns that exist in CSV but not in any indicator definition
 * - dependentIndicators: indicators that depend on the orphaned columns
 */
export async function GET() {
  try {
    // Get all columns from CSV files
    const { columns: csvColumns, errors: csvErrors } = await getAllColumnsFromDatasets();

    if (csvErrors.length > 0) {
      console.warn('Some errors occurred while reading CSV files:', csvErrors);
    }

    // Get all custom indicators
    const indicators = await loadIndicators();

    // Build set of valid column names from indicators
    const validIndicatorColumns = new Set<string>();

    for (const indicator of indicators) {
      if (indicator.isGroup && indicator.groupName && indicator.expectedOutputs) {
        // Group indicator: add all expected outputs with groupName:outputName format
        for (const output of indicator.expectedOutputs) {
          validIndicatorColumns.add(`${indicator.groupName}:${output}`);
        }
      } else if (indicator.outputColumn) {
        // Single indicator: add outputColumn
        validIndicatorColumns.add(indicator.outputColumn);
      }
    }

    // Build set of all valid columns (basic + indicators)
    const allValidColumns = new Set([
      ...REQUIRED_COLUMNS,
      ...BASE_INDICATORS,
      ...validIndicatorColumns,
    ]);

    // Find orphaned columns (exist in CSV but not in valid columns)
    const orphanedColumns: string[] = [];
    csvColumns.forEach(col => {
      if (!allValidColumns.has(col)) {
        orphanedColumns.push(col);
      }
    });

    // If no orphaned columns, return early
    if (orphanedColumns.length === 0) {
      return NextResponse.json({
        hasOrphanedColumns: false,
        orphanedColumns: [],
        dependentIndicators: [],
      });
    }

    // Find indicators that depend on orphaned columns
    const dependentIndicatorsMap = findIndicatorsDependingOnColumns(orphanedColumns, indicators);

    // Convert to array format
    const dependentIndicators: { column: string; indicators: { id: string; name: string }[] }[] = [];
    dependentIndicatorsMap.forEach((inds, column) => {
      dependentIndicators.push({
        column,
        indicators: inds.map(ind => ({ id: ind.id, name: ind.name })),
      });
    });

    return NextResponse.json({
      hasOrphanedColumns: true,
      orphanedColumns,
      dependentIndicators,
    });
  } catch (error) {
    console.error('Error checking orphaned columns:', error);
    return NextResponse.json(
      {
        error: 'Failed to check orphaned columns',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/check-orphaned-columns
 * Delete orphaned columns and their dependent indicators
 *
 * Body:
 * - orphanedColumns: columns to remove from CSV files
 * - indicatorIdsToDelete: indicator IDs to delete
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orphanedColumns, indicatorIdsToDelete } = body;

    if (!orphanedColumns || !Array.isArray(orphanedColumns)) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'orphanedColumns must be an array' },
        { status: 400 }
      );
    }

    const results: {
      removedColumns: string[];
      deletedIndicators: string[];
      errors: string[];
    } = {
      removedColumns: [],
      deletedIndicators: [],
      errors: [],
    };

    // Remove orphaned columns from CSV files
    if (orphanedColumns.length > 0) {
      const { updatedCount, errors } = await removeColumnsFromAllDatasets(orphanedColumns);
      results.removedColumns = orphanedColumns;
      results.errors.push(...errors);
      console.log(`Removed ${orphanedColumns.length} orphaned columns from ${updatedCount} datasets`);
    }

    // Delete dependent indicators
    if (indicatorIdsToDelete && Array.isArray(indicatorIdsToDelete) && indicatorIdsToDelete.length > 0) {
      const indicators = await loadIndicators();
      const idsToDelete = new Set(indicatorIdsToDelete);

      // Get names of indicators being deleted
      const deletedNames = indicators
        .filter(ind => idsToDelete.has(ind.id))
        .map(ind => ind.name);

      // Filter out deleted indicators
      const remaining = indicators.filter(ind => !idsToDelete.has(ind.id));
      await saveIndicators(remaining);

      results.deletedIndicators = deletedNames;
      console.log(`Deleted ${deletedNames.length} dependent indicators: ${deletedNames.join(', ')}`);
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Error removing orphaned columns:', error);
    return NextResponse.json(
      {
        error: 'Failed to remove orphaned columns',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
