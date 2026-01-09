import { NextResponse } from 'next/server';
import { getIndicatorById } from '@/lib/indicator-storage';
import { executePythonIndicator } from '@/lib/python-executor';
import { addIndicatorColumn, addIndicatorGroupColumns } from '@/lib/csv-updater';
import { loadDataset } from '@/lib/csv';

export const runtime = 'nodejs';

interface ApplyResult {
  success: boolean;
  rowsProcessed?: number;
  error?: string;
}

// POST /api/apply-indicator - Apply indicator to dataset(s)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { indicatorId, datasetNames } = body;

    if (!indicatorId || !datasetNames || !Array.isArray(datasetNames)) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'indicatorId and datasetNames (array) are required' },
        { status: 400 }
      );
    }

    // Load indicator
    const indicator = await getIndicatorById(indicatorId);
    if (!indicator) {
      return NextResponse.json(
        { error: 'Indicator not found' },
        { status: 404 }
      );
    }

    // Apply indicator to each dataset
    const results: Record<string, ApplyResult> = {};

    for (const filename of datasetNames) {
      try {
        // Load dataset data
        let datasetData;

        try {
          datasetData = await loadDataset(filename);
        } catch (error) {
          results[filename] = {
            success: false,
            error: 'Dataset not found',
          };
          continue;
        }

        // Prepare data for Python (convert to array of records)
        const dataRecords = datasetData.candles.map((candle, index) => {
          const record: Record<string, any> = {
            date: new Date(candle.time * 1000).toISOString(),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          };

          // Add all indicators
          for (const [indicatorName, indicatorDataArray] of Object.entries(datasetData.indicators)) {
            if (indicatorDataArray[index]) {
              record[indicatorName] = indicatorDataArray[index].value;
            }
          }

          return record;
        });

        // Execute Python indicator
        const executionResult = await executePythonIndicator({
          code: indicator.pythonCode,
          data: dataRecords,
          isGroup: indicator.isGroup || false,
          externalDatasets: indicator.externalDatasets,
        });

        if (!executionResult.success) {
          results[filename] = {
            success: false,
            error: executionResult.error || 'Python execution failed',
          };
          continue;
        }

        // Apply to CSV based on indicator type
        if (indicator.isGroup) {
          // Group indicator - validate and add multiple columns
          const valuesDict = executionResult.values as Record<string, (number | null)[]>;

          // Validate returned keys match expected outputs
          if (!valuesDict || typeof valuesDict !== 'object') {
            results[filename] = {
              success: false,
              error: 'Group indicator must return a dictionary of values',
            };
            continue;
          }

          const returnedKeys = Object.keys(valuesDict);
          const expectedKeys = indicator.expectedOutputs || [];
          const missingKeys = expectedKeys.filter(k => !returnedKeys.includes(k));

          if (missingKeys.length > 0) {
            results[filename] = {
              success: false,
              error: `Missing expected outputs: ${missingKeys.join(', ')}`,
            };
            continue;
          }

          // Add group columns to CSV
          await addIndicatorGroupColumns(
            filename,
            indicator.groupName!,
            valuesDict
          );

          results[filename] = {
            success: true,
            rowsProcessed: dataRecords.length,
          };
        } else {
          // Single indicator - add one column
          await addIndicatorColumn(
            filename,
            indicator.outputColumn,
            executionResult.values as (number | null)[]
          );

          results[filename] = {
            success: true,
            rowsProcessed: dataRecords.length,
          };
        }
      } catch (error) {
        results[filename] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Error applying indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to apply indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
