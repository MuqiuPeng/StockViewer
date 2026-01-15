import { NextResponse } from 'next/server';
import { getIndicatorById, updateIndicator, deleteIndicator, loadIndicators, saveIndicators } from '@/lib/indicator-storage';
import { validatePythonCode } from '@/lib/indicator-validator';
import { findDependentIndicators, getCascadeDeleteList, findIndicatorsDependingOnColumns, replaceColumnInCode } from '@/lib/indicator-dependencies';
import { detectDependencies } from '@/lib/detect-dependencies';
import { renameGroupIndicatorColumns, removeGroupIndicatorColumns, cleanupOrphanedGroupColumns } from '@/lib/csv-updater';

// Helper to detect column name changes and find affected indicators
interface ColumnRename {
  oldName: string;
  newName: string;
}

function detectColumnRenames(
  existingIndicator: any,
  updates: {
    outputColumn?: string;
    groupName?: string;
    expectedOutputs?: string[];
  }
): ColumnRename[] {
  const renames: ColumnRename[] = [];

  if (existingIndicator.isGroup) {
    // Group indicator
    const oldGroupName = existingIndicator.groupName;
    const newGroupName = updates.groupName !== undefined ? updates.groupName : oldGroupName;
    const oldOutputs = existingIndicator.expectedOutputs || [];
    const newOutputs = updates.expectedOutputs !== undefined ? updates.expectedOutputs : oldOutputs;

    // Check if group name is changing
    if (oldGroupName && newGroupName && oldGroupName !== newGroupName) {
      // All columns with old group name need to be renamed
      for (const output of oldOutputs) {
        if (output.trim()) {
          renames.push({
            oldName: `${oldGroupName}:${output}`,
            newName: `${newGroupName}:${output}`,
          });
        }
      }
    }

    // Check if individual output names are changing (only if group name didn't change)
    if (oldGroupName === newGroupName && oldOutputs.length > 0 && newOutputs.length > 0) {
      // Match outputs by index to detect renames
      const maxLen = Math.min(oldOutputs.length, newOutputs.length);
      for (let i = 0; i < maxLen; i++) {
        const oldOutput = oldOutputs[i]?.trim();
        const newOutput = newOutputs[i]?.trim();
        if (oldOutput && newOutput && oldOutput !== newOutput) {
          renames.push({
            oldName: `${oldGroupName}:${oldOutput}`,
            newName: `${newGroupName}:${newOutput}`,
          });
        }
      }
    }
  } else {
    // Single indicator
    const oldOutputColumn = existingIndicator.outputColumn;
    const newOutputColumn = updates.outputColumn;

    if (oldOutputColumn && newOutputColumn && oldOutputColumn !== newOutputColumn) {
      renames.push({
        oldName: oldOutputColumn,
        newName: newOutputColumn,
      });
    }
  }

  return renames;
}

export const runtime = 'nodejs';

// GET /api/indicators/[id] - Get single indicator
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const indicator = await getIndicatorById(params.id);

    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ indicator });
  } catch (error) {
    console.error('Error getting indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to get indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// PUT /api/indicators/[id] - Update indicator
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, description, pythonCode, outputColumn, isGroup, groupName, expectedOutputs, externalDatasets } = body;

    // Validate Python code if provided
    if (pythonCode) {
      const validation = validatePythonCode(pythonCode);
      if (!validation.valid) {
        return NextResponse.json(
          { error: 'Invalid Python code', message: validation.error },
          { status: 400 }
        );
      }
    }

    // For group indicators, validate expectedOutputs if provided
    if (isGroup !== undefined && isGroup) {
      if (groupName !== undefined && !groupName) {
        return NextResponse.json(
          { error: 'Missing required fields', message: 'groupName is required for group indicators' },
          { status: 400 }
        );
      }

      if (expectedOutputs !== undefined) {
        if (!Array.isArray(expectedOutputs) || expectedOutputs.length === 0) {
          return NextResponse.json(
            { error: 'Invalid expectedOutputs', message: 'Group indicators must specify expectedOutputs as a non-empty array' },
            { status: 400 }
          );
        }

        const filteredOutputs = expectedOutputs.filter((output: string) => output.trim() !== '');
        if (filteredOutputs.length === 0) {
          return NextResponse.json(
            { error: 'Invalid expectedOutputs', message: 'expectedOutputs must contain at least one non-empty string' },
            { status: 400 }
          );
        }
      }
    }

    // Get the existing indicator to check for group name changes
    const existingIndicator = await getIndicatorById(params.id);
    if (!existingIndicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (pythonCode !== undefined) updates.pythonCode = pythonCode;
    if (outputColumn !== undefined) updates.outputColumn = outputColumn;
    if (isGroup !== undefined) updates.isGroup = isGroup;
    if (groupName !== undefined) updates.groupName = groupName;
    if (expectedOutputs !== undefined) {
      updates.expectedOutputs = expectedOutputs.filter((output: string) => output.trim() !== '');
    }
    // Handle externalDatasets - null means clear all, undefined means don't change
    if (externalDatasets !== undefined) {
      updates.externalDatasets = externalDatasets === null ? undefined : externalDatasets;
    }

    // Detect column renames
    const columnRenames = detectColumnRenames(existingIndicator, {
      outputColumn,
      groupName,
      expectedOutputs: expectedOutputs ? expectedOutputs.filter((output: string) => output.trim() !== '') : undefined,
    });

    // Check URL params
    const url = new URL(request.url);
    const autoFix = url.searchParams.get('autoFix') === 'true';

    // If there are column renames, check for dependent indicators
    if (columnRenames.length > 0) {
      const allIndicators = await loadIndicators();
      const oldColumnNames = columnRenames.map(r => r.oldName);
      const columnDependents = findIndicatorsDependingOnColumns(oldColumnNames, allIndicators);

      // Filter out the current indicator from dependents
      const affectedIndicators: { column: string; newColumn: string; indicators: { id: string; name: string }[] }[] = [];

      columnDependents.forEach((indicators, column) => {
        const filtered = indicators.filter(ind => ind.id !== params.id);
        if (filtered.length > 0) {
          const rename = columnRenames.find(r => r.oldName === column);
          affectedIndicators.push({
            column,
            newColumn: rename?.newName || column,
            indicators: filtered.map(ind => ({ id: ind.id, name: ind.name })),
          });
        }
      });

      if (affectedIndicators.length > 0 && !autoFix) {
        // Return info about affected indicators, ask for confirmation
        return NextResponse.json(
          {
            error: 'Column rename affects dependent indicators',
            message: 'The column name change will affect other indicators that use this column',
            columnRenames: affectedIndicators,
            requiresAutoFix: true,
          },
          { status: 400 }
        );
      }

      // Auto-fix: Update code in all dependent indicators
      if (affectedIndicators.length > 0 && autoFix) {
        console.log(`Auto-fixing ${affectedIndicators.length} column renames in dependent indicators`);

        // Get all affected indicator IDs
        const affectedIds = new Set<string>();
        affectedIndicators.forEach(({ indicators }) => {
          indicators.forEach(ind => affectedIds.add(ind.id));
        });

        // IMPORTANT: First update the target indicator in allIndicators with the new column names
        // so that dependency detection can find the new columns
        const targetIndicatorIndex = allIndicators.findIndex(ind => ind.id === params.id);
        if (targetIndicatorIndex !== -1) {
          // Apply updates to the target indicator
          if (outputColumn !== undefined) {
            allIndicators[targetIndicatorIndex].outputColumn = outputColumn;
          }
          if (groupName !== undefined) {
            allIndicators[targetIndicatorIndex].groupName = groupName;
          }
          if (expectedOutputs !== undefined) {
            allIndicators[targetIndicatorIndex].expectedOutputs = expectedOutputs.filter((o: string) => o.trim() !== '');
          }
        }

        // Update each affected indicator's code
        for (const indicator of allIndicators) {
          if (affectedIds.has(indicator.id)) {
            let updatedCode = indicator.pythonCode;

            // Apply all renames
            for (const rename of columnRenames) {
              updatedCode = replaceColumnInCode(updatedCode, rename.oldName, rename.newName);
            }

            if (updatedCode !== indicator.pythonCode) {
              // Re-detect dependencies with the updated code
              // Now allIndicators has the updated target indicator, so dependencies will be found correctly
              const { dependencies, dependencyColumns } = detectDependencies(updatedCode, allIndicators, indicator.id);

              // Update the indicator
              indicator.pythonCode = updatedCode;
              indicator.dependencies = dependencies;
              indicator.dependencyColumns = dependencyColumns;
              indicator.updatedAt = new Date().toISOString();

              console.log(`Updated code in indicator "${indicator.name}"`);
            }
          }
        }

        // Save all updated indicators
        await saveIndicators(allIndicators);
      }
    }

    // Re-detect dependencies if Python code is being updated
    if (pythonCode !== undefined) {
      const allIndicators = await loadIndicators();
      const { dependencies, dependencyColumns } = detectDependencies(pythonCode, allIndicators, params.id);
      updates.dependencies = dependencies;
      updates.dependencyColumns = dependencyColumns;
    }

    // Check if group name is changing for a group indicator
    const isGroupNameChanging =
      existingIndicator.isGroup &&
      groupName !== undefined &&
      existingIndicator.groupName &&
      existingIndicator.groupName !== groupName;

    if (isGroupNameChanging) {
      // Rename all columns with the old group name prefix to the new group name
      console.log(`Renaming group indicator columns from "${existingIndicator.groupName}" to "${groupName}"`);
      const renameResult = await renameGroupIndicatorColumns(existingIndicator.groupName!, groupName);

      if (renameResult.errors.length > 0) {
        console.error('Some datasets failed to update:', renameResult.errors);
      }

      console.log(`Updated ${renameResult.updatedCount} datasets with renamed columns`);
    }

    // Check if expectedOutputs are being removed from a group indicator
    const currentGroupName = groupName !== undefined ? groupName : existingIndicator.groupName;
    if (
      existingIndicator.isGroup &&
      existingIndicator.expectedOutputs &&
      expectedOutputs !== undefined &&
      currentGroupName
    ) {
      const newOutputs = expectedOutputs.filter((output: string) => output.trim() !== '');
      const removedOutputs = existingIndicator.expectedOutputs.filter(
        (output: string) => !newOutputs.includes(output)
      );

      if (removedOutputs.length > 0) {
        // Build full column names being removed
        const removedColumnNames = removedOutputs.map(output => `${currentGroupName}:${output}`);

        // Check if any other indicators depend on these columns
        const allIndicators = await loadIndicators();
        const columnDependents = findIndicatorsDependingOnColumns(removedColumnNames, allIndicators);

        // Check if force removal is requested
        const url = new URL(request.url);
        const forceRemove = url.searchParams.get('force') === 'true';

        if (columnDependents.size > 0 && !forceRemove) {
          // Build detailed error message
          const dependentInfo: { column: string; indicators: { id: string; name: string }[] }[] = [];
          columnDependents.forEach((indicators, column) => {
            dependentInfo.push({
              column,
              indicators: indicators.map(ind => ({ id: ind.id, name: ind.name })),
            });
          });

          return NextResponse.json(
            {
              error: 'Columns have dependent indicators',
              message: 'Some columns you are trying to remove are used by other indicators',
              dependentColumns: dependentInfo,
            },
            { status: 400 }
          );
        }

        console.log(`Removing ${removedOutputs.length} columns from group indicator "${currentGroupName}": ${removedOutputs.join(', ')}`);
        const removeResult = await removeGroupIndicatorColumns(currentGroupName, removedOutputs);

        if (removeResult.errors.length > 0) {
          console.error('Some datasets failed to update:', removeResult.errors);
        }

        console.log(`Updated ${removeResult.updatedCount} datasets with removed columns`);
      }
    }

    const indicator = await updateIndicator(params.id, updates);

    // Clean up any orphaned columns for group indicators
    // This handles cases where columns exist in CSV but aren't in expectedOutputs
    if (indicator.isGroup && indicator.groupName && indicator.expectedOutputs) {
      const orphanedCleanup = await cleanupOrphanedGroupColumns(
        indicator.groupName,
        indicator.expectedOutputs
      );
      if (orphanedCleanup.removedColumns.length > 0) {
        console.log(`Cleaned up orphaned columns: ${orphanedCleanup.removedColumns.join(', ')}`);
      }
    }

    return NextResponse.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Error updating indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to update indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE /api/indicators/[id] - Delete indicator
// Query params:
//   - cascade=true: delete all dependent indicators as well
//   - checkOnly=true: only check for dependents, don't delete
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const url = new URL(request.url);
    const cascade = url.searchParams.get('cascade') === 'true';
    const checkOnly = url.searchParams.get('checkOnly') === 'true';

    const allIndicators = await loadIndicators();
    const indicator = allIndicators.find(ind => ind.id === params.id);

    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    // Find dependent indicators
    const dependents = findDependentIndicators(params.id, allIndicators);

    // If checkOnly, return dependent info
    if (checkOnly) {
      return NextResponse.json({
        hasDependents: dependents.length > 0,
        dependents: dependents.map(d => ({ id: d.id, name: d.name })),
      });
    }

    // If has dependents and cascade not requested, return error with info
    if (dependents.length > 0 && !cascade) {
      return NextResponse.json(
        {
          error: 'Indicator has dependents',
          message: `Cannot delete "${indicator.name}" because other indicators depend on it`,
          dependents: dependents.map(d => ({ id: d.id, name: d.name })),
        },
        { status: 400 }
      );
    }

    // Perform deletion
    if (cascade && dependents.length > 0) {
      // Get all indicators to delete (including the target and all dependents)
      const toDelete = getCascadeDeleteList(params.id, allIndicators);
      const idsToDelete = new Set(toDelete.map(ind => ind.id));

      // Filter out all indicators to delete
      const remaining = allIndicators.filter(ind => !idsToDelete.has(ind.id));
      await saveIndicators(remaining);

      return NextResponse.json({
        success: true,
        deletedCount: toDelete.length,
        deleted: toDelete.map(d => ({ id: d.id, name: d.name })),
      });
    } else {
      // Simple deletion (no dependents)
      await deleteIndicator(params.id);
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error('Error deleting indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
