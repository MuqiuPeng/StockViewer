import { NextResponse } from 'next/server';
import { validatePythonCode } from '@/lib/indicator-validator';
import { executePythonIndicator } from '@/lib/python-executor';
import { prisma } from '@/lib/prisma';
import { detectDependencies } from '@/lib/detect-dependencies';

export const runtime = 'nodejs';

// Standard columns that are always available in the data
const STANDARD_COLUMNS = new Set([
  'date', 'open', 'high', 'low', 'close', 'volume',
  'turnover', 'amplitude', 'change_pct', 'change_amount',
  'Open', 'High', 'Low', 'Close', 'Volume', 'Adj Close',
]);

/**
 * Extract all column references from Python code
 * Returns column names that are accessed via data['col'] or data["col"]
 */
function extractColumnReferences(pythonCode: string): string[] {
  const columns = new Set<string>();

  // Match data['column'] and data["column"] patterns
  const patterns = [
    /data\['([^']+)'\]/g,
    /data\["([^"]+)"\]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(pythonCode)) !== null) {
      const columnName = match[1];
      // Skip external dataset columns (xxx@yyy format)
      if (!columnName.includes('@')) {
        columns.add(columnName);
      }
    }
  }

  return Array.from(columns);
}

// POST /api/validate-indicator - Validate Python code
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pythonCode, isGroup, externalDatasets } = body;

    console.log('[validate-indicator] Received request with externalDatasets:', externalDatasets);

    if (!pythonCode) {
      return NextResponse.json(
        { error: 'Missing pythonCode' },
        { status: 400 }
      );
    }

    // First, validate code structure
    const validation = validatePythonCode(pythonCode);
    if (!validation.valid) {
      return NextResponse.json({
        valid: false,
        error: validation.error,
      });
    }

    // Extract all column references from the code
    const referencedColumns = extractColumnReferences(pythonCode);

    // Filter out standard columns to get potential indicator dependencies
    const nonStandardColumns = referencedColumns.filter(col => !STANDARD_COLUMNS.has(col));

    // If there are non-standard columns, check if they exist as indicator outputs
    let dependencyColumns: string[] = [];
    let missingDependencies: string[] = [];

    if (nonStandardColumns.length > 0) {
      // Fetch all indicators to check dependencies
      const allIndicators = await prisma.indicator.findMany({
        select: {
          id: true,
          name: true,
          outputColumn: true,
          isGroup: true,
          groupName: true,
          expectedOutputs: true,
        },
      });

      console.log('[validate-indicator] Found indicators:', allIndicators.length);
      console.log('[validate-indicator] Non-standard columns referenced:', nonStandardColumns);

      // Build a set of all available indicator columns
      const availableColumns = new Set<string>();
      for (const ind of allIndicators) {
        if (ind.isGroup && ind.groupName && ind.expectedOutputs) {
          // Group indicator: add all output columns
          for (const output of ind.expectedOutputs) {
            availableColumns.add(`${ind.groupName}:${output}`);
          }
          // Also add the groupName itself in case user references it
          availableColumns.add(ind.groupName);
        } else {
          // Single indicator: add outputColumn and name
          availableColumns.add(ind.outputColumn);
          if (ind.name !== ind.outputColumn) {
            availableColumns.add(ind.name);
          }
        }
      }

      console.log('[validate-indicator] Available columns:', Array.from(availableColumns));

      // Check each non-standard column
      for (const col of nonStandardColumns) {
        if (availableColumns.has(col)) {
          dependencyColumns.push(col);
        } else {
          missingDependencies.push(col);
        }
      }

      // If there are missing dependencies, return error with suggestions
      if (missingDependencies.length > 0) {
        // Find similar column names for suggestions
        const suggestions: Record<string, string[]> = {};
        for (const missing of missingDependencies) {
          const similar: string[] = [];
          const missingLower = missing.toLowerCase();
          const missingParts = missing.split(':');
          const missingPrefix = missingParts[0]?.toLowerCase();

          for (const available of availableColumns) {
            const availableLower = available.toLowerCase();
            // Check if same prefix (e.g., both start with "MACD:")
            if (missingPrefix && availableLower.startsWith(missingPrefix + ':')) {
              similar.push(available);
            }
            // Check for partial match
            else if (availableLower.includes(missingLower) || missingLower.includes(availableLower)) {
              similar.push(available);
            }
          }
          if (similar.length > 0) {
            suggestions[missing] = similar.slice(0, 5); // Limit to 5 suggestions
          }
        }

        const hints = [
          `The column(s) "${missingDependencies.join('", "')}" do not exist.`,
        ];

        // Add suggestions if found
        for (const [missing, similar] of Object.entries(suggestions)) {
          if (similar.length > 0) {
            hints.push(`For "${missing}", did you mean: ${similar.join(', ')}?`);
          }
        }

        hints.push('Please create the required indicator(s) first, or check for typos in column names.');
        hints.push('For group indicators, use format "GroupName:OutputName" (e.g., "MACD:DIF").');

        return NextResponse.json({
          valid: false,
          error: `Missing dependencies: ${missingDependencies.join(', ')}`,
          errorType: 'missing_dependency',
          details: {
            missingDependencies,
            suggestions,
            availableColumns: Array.from(availableColumns).slice(0, 20), // Show some available columns
            hints,
          },
        });
      }
    }

    // Build sample data with mock values for dependencies
    const sampleData: Record<string, any>[] = [
      { date: '2024-01-01T00:00:00.000', open: 100, high: 105, low: 99, close: 104, volume: 1000 },
      { date: '2024-01-02T00:00:00.000', open: 104, high: 106, low: 103, close: 105, volume: 1200 },
      { date: '2024-01-03T00:00:00.000', open: 105, high: 107, low: 104, close: 106, volume: 1100 },
      { date: '2024-01-04T00:00:00.000', open: 106, high: 108, low: 105, close: 107, volume: 1300 },
      { date: '2024-01-05T00:00:00.000', open: 107, high: 109, low: 106, close: 108, volume: 1250 },
    ];

    // Add mock values for dependency columns
    for (const col of dependencyColumns) {
      for (let i = 0; i < sampleData.length; i++) {
        // Use simple mock values (random-ish based on index)
        sampleData[i][col] = 100 + i * 0.5 + Math.sin(i) * 2;
      }
    }

    try {
      const result = await executePythonIndicator({
        code: pythonCode,
        data: sampleData,
        isGroup: isGroup || false,
        externalDatasets: externalDatasets || undefined,
      });

      if (!result.success) {
        return NextResponse.json({
          valid: false,
          error: result.error || 'Python execution failed',
          errorType: result.type,
          details: result.details,
        });
      }

      return NextResponse.json({
        valid: true,
        sampleResult: result.values,
        dependencies: dependencyColumns.length > 0 ? dependencyColumns : undefined,
      });
    } catch (execError) {
      return NextResponse.json({
        valid: false,
        error: execError instanceof Error ? execError.message : 'Execution error',
      });
    }
  } catch (error) {
    console.error('Error validating indicator:', error);
    return NextResponse.json(
      {
        error: 'Failed to validate indicator',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
