import { NextResponse } from 'next/server';
import { getIndicatorById, updateIndicator, deleteIndicator, loadIndicators, saveIndicators } from '@/lib/indicator-storage';
import { validatePythonCode } from '@/lib/indicator-validator';
import { findDependentIndicators, getCascadeDeleteList } from '@/lib/indicator-dependencies';
import { detectDependencies } from '@/lib/detect-dependencies';
import { renameGroupIndicatorColumns } from '@/lib/csv-updater';

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
    if (externalDatasets !== undefined) updates.externalDatasets = externalDatasets;

    // Re-detect dependencies if Python code is being updated
    if (pythonCode !== undefined) {
      const allIndicators = await loadIndicators();
      updates.dependencies = detectDependencies(pythonCode, allIndicators, params.id);
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

    const indicator = await updateIndicator(params.id, updates);

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
