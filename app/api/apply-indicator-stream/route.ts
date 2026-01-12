import { getIndicatorById } from '@/lib/indicator-storage';
import { executePythonIndicator } from '@/lib/python-executor';
import { addIndicatorColumn, addIndicatorGroupColumns } from '@/lib/csv-updater';
import { loadDataset } from '@/lib/csv';

export const runtime = 'nodejs';

interface ApplyResult {
  success: boolean;
  rowsProcessed?: number;
  error?: string;
  errorType?: string;
  details?: {
    message?: string;
    type?: string;
    code_line?: string;
    hints?: string[];
    traceback?: string;
    warnings?: string[];
  };
}

// POST /api/apply-indicator-stream - Apply indicator to dataset(s) with streaming progress
export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await request.json();
        const { indicatorId, datasetNames } = body;

        if (!indicatorId || !datasetNames || !Array.isArray(datasetNames)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: 'Invalid request',
              message: 'indicatorId and datasetNames (array) are required'
            })}\n\n`)
          );
          controller.close();
          return;
        }

        // Load indicator
        const indicator = await getIndicatorById(indicatorId);
        if (!indicator) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: 'Indicator not found'
            })}\n\n`)
          );
          controller.close();
          return;
        }

        // Send total count
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'total',
            total: datasetNames.length
          })}\n\n`)
        );

        const results: Record<string, ApplyResult> = {};

        // Apply indicator to each dataset
        for (let i = 0; i < datasetNames.length; i++) {
          const filename = datasetNames[i];

          try {
            // Send progress update
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'progress',
                current: i,
                total: datasetNames.length,
                filename
              })}\n\n`)
            );

            // Load dataset data
            let datasetData;

            try {
              datasetData = await loadDataset(filename);
            } catch (error) {
              results[filename] = {
                success: false,
                error: 'Dataset not found',
              };

              // Send result for this dataset
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'result',
                  filename,
                  result: results[filename]
                })}\n\n`)
              );
              continue;
            }

            // Prepare data for Python (convert to array of records)
            const dataRecords = datasetData.candles.map((candle, index) => {
              const record: Record<string, any> = {
                date: candle.time, // Already in YYYY-MM-DD format
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
                errorType: executionResult.type,
                details: executionResult.details,
              };

              // Send result for this dataset
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'result',
                  filename,
                  result: results[filename]
                })}\n\n`)
              );
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

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'result',
                    filename,
                    result: results[filename]
                  })}\n\n`)
                );
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

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'result',
                    filename,
                    result: results[filename]
                  })}\n\n`)
                );
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

            // Send result for this dataset
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'result',
                filename,
                result: results[filename],
                current: i + 1,
                total: datasetNames.length
              })}\n\n`)
            );
          } catch (error) {
            results[filename] = {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };

            // Send result for this dataset
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'result',
                filename,
                result: results[filename],
                current: i + 1,
                total: datasetNames.length
              })}\n\n`)
            );
          }
        }

        // Send completion
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            results
          })}\n\n`)
        );

        controller.close();
      } catch (error) {
        console.error('Error applying indicator:', error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: 'Failed to apply indicator',
            message: error instanceof Error ? error.message : 'Unknown error'
          })}\n\n`)
        );
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
