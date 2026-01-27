import { NextResponse } from 'next/server';
import { validatePythonCode } from '@/lib/indicator-validator';
import { executePythonIndicator, ResourceManifest, ResourceInfo } from '@/lib/python-executor';
import { prisma } from '@/lib/prisma';
import { detectDependencies } from '@/lib/detect-dependencies';
import { getApiStorage } from '@/lib/api-auth';

// Detect data.import_() calls in Python code (name-based)
function detectImportCalls(pythonCode: string): { indicatorNames: string[]; datasetSymbols: string[] } {
  const indicatorNames: string[] = [];
  const datasetSymbols: string[] = [];

  // First, detect dataset imports: data.import_('symbol', type='dataset')
  const datasetPattern = /data\.import_\s*\(\s*['"]([^'"]+)['"]\s*,\s*type\s*=\s*['"]dataset['"]\s*\)/g;
  let match;
  while ((match = datasetPattern.exec(pythonCode)) !== null) {
    if (!datasetSymbols.includes(match[1])) {
      datasetSymbols.push(match[1]);
    }
  }

  // Then detect indicator imports: data.import_('name') (without type='dataset')
  // We need to exclude dataset patterns already matched
  const indicatorPattern = /data\.import_\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = indicatorPattern.exec(pythonCode)) !== null) {
    const name = match[1];
    // Only add if it's not already detected as a dataset
    if (!indicatorNames.includes(name) && !datasetSymbols.includes(name)) {
      indicatorNames.push(name);
    }
  }

  // Also handle user-specific imports: data.import_(user='email', indicator='name')
  const userIndicatorPattern = /data\.import_\s*\(\s*user\s*=\s*['"][^'"]+['"]\s*,\s*indicator\s*=\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = userIndicatorPattern.exec(pythonCode)) !== null) {
    if (!indicatorNames.includes(match[1])) {
      indicatorNames.push(match[1]);
    }
  }

  return { indicatorNames, datasetSymbols };
}

// Build resource manifest for validation
async function buildValidationManifest(userId: string): Promise<ResourceManifest> {
  const indicatorsMap: Record<string, ResourceInfo> = {};
  const datasetsMap: Record<string, ResourceInfo> = {};

  // Get user's accessible indicators
  const userIndicators = await prisma.userIndicator.findMany({
    where: { userId },
    include: {
      indicator: {
        include: {
          creator: { select: { email: true } }
        }
      }
    }
  });

  for (const ui of userIndicators) {
    const ind = ui.indicator;
    const resourceInfo: ResourceInfo = {
      id: ind.id,
      name: ind.name,
      isOwner: ind.createdBy === userId,
      creatorEmail: ind.creator?.email || undefined,
      outputColumn: ind.outputColumn,
      isGroup: ind.isGroup,
      expectedOutputs: ind.expectedOutputs.length > 0 ? ind.expectedOutputs : undefined,
      period: ind.period,
    };
    indicatorsMap[ind.name] = resourceInfo;
  }

  // Get user's accessible datasets
  const userDatasets = await prisma.userStock.findMany({
    where: { userId },
    include: {
      stock: true
    }
  });

  for (const us of userDatasets) {
    const stock = us.stock;
    const resourceInfo: ResourceInfo = {
      id: stock.id,
      name: stock.name,
      isOwner: true,
      symbol: stock.symbol,
      stockId: stock.id,
      dataSource: stock.dataSource,
    };
    datasetsMap[stock.symbol] = resourceInfo;
  }

  return { indicators: indicatorsMap, datasets: datasetsMap };
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

    // Get current user for import support
    const authResult = await getApiStorage();
    const userId = authResult.success ? authResult.userId : null;

    // First, validate code structure
    const validation = validatePythonCode(pythonCode);
    if (!validation.valid) {
      return NextResponse.json({
        valid: false,
        error: validation.error,
      });
    }

    // Use detectDependencies to find indicator dependencies (same as apply flow)
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

    const { dependencies, dependencyColumns } = detectDependencies(pythonCode, allIndicators);

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

    // Build resource manifest and preload data for import support
    let resourceManifest: ResourceManifest | undefined;
    let preloadedIndicators: Record<string, Array<{ date: string; value?: number | null }>> | undefined;
    let preloadedDatasets: Record<string, Record<string, any>[]> | undefined;

    // Detect import calls in the code
    const { indicatorNames, datasetSymbols } = detectImportCalls(pythonCode);

    if (userId && (indicatorNames.length > 0 || datasetSymbols.length > 0)) {
      resourceManifest = await buildValidationManifest(userId);

      // Preload mock data for imported indicators (using sample dates)
      if (indicatorNames.length > 0) {
        preloadedIndicators = {};
        for (const name of indicatorNames) {
          // Find the indicator in manifest by name
          const indInfo = resourceManifest.indicators[name];
          if (indInfo) {
            // Provide mock indicator values for validation (keyed by name)
            preloadedIndicators[name] = sampleData.map((d, i) => ({
              date: d.date.split('T')[0],
              value: 100 + i * 0.5,
            }));
          }
        }
      }

      // Preload mock data for imported datasets
      if (datasetSymbols.length > 0) {
        preloadedDatasets = {};
        for (const symbol of datasetSymbols) {
          const dsInfo = resourceManifest.datasets[symbol];
          if (dsInfo) {
            // Provide mock dataset values for validation (keyed by symbol)
            preloadedDatasets[symbol] = sampleData.map(d => ({
              ...d,
              date: d.date.split('T')[0],
            }));
          }
        }
      }
    }

    try {
      const result = await executePythonIndicator({
        code: pythonCode,
        data: sampleData,
        isGroup: isGroup || false,
        externalDatasets: externalDatasets || undefined,
        resourceManifest,
        preloadedIndicators,
        preloadedDatasets,
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
