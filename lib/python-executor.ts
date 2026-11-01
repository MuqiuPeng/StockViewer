import { resolvePythonExecutable, spawnPython, withPythonSlot } from './python-child';
import { existsSync } from 'fs';
import { PYTHON_CONFIG } from './env';
import { executorScript } from './paths';

/**
 * Resource info for import manifest
 */
export interface ResourceInfo {
  id: string;
  name: string;
  isOwner: boolean;
  creatorEmail?: string;  // For user='email' lookup
  // For indicators
  outputColumn?: string;
  isGroup?: boolean;
  expectedOutputs?: string[];
  period?: string;
  // For datasets
  stockId?: string;
  symbol?: string;
  dataSource?: string;
}

/**
 * Manifest of resources available for import
 */
export interface ResourceManifest {
  indicators: Record<string, ResourceInfo>;
  datasets: Record<string, ResourceInfo>;
}

export interface PythonExecutionInput {
  code: string;
  data: Record<string, any>[];
  isGroup?: boolean;  // NEW: indicates group mode for MyTT indicators
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;  // External datasets configuration
  // Dynamic import support
  resourceManifest?: ResourceManifest;
  preloadedIndicators?: Record<string, Array<{ date: string; value?: number | null; groupValues?: Record<string, number | null> }>>;
  preloadedDatasets?: Record<string, Record<string, any>[]>;
}

export interface PythonExecutionResult {
  success: boolean;
  values?: (number | null)[] | Record<string, (number | null)[]>;  // Single array OR dict for groups
  error?: string;
  type?: string;
  details?: {
    message?: string;
    type?: string;
    code_line?: string;
    hints?: string[];
    traceback?: string;
    warnings?: string[];
  };
}

export async function executePythonIndicator(
  input: PythonExecutionInput
): Promise<PythonExecutionResult> {
  return withPythonSlot(() => new Promise<PythonExecutionResult>((resolve, reject) => {
    const pythonScript = executorScript('executor.py');

    // Check if executor.py exists
    if (!existsSync(pythonScript)) {
      reject(
        new Error(
          `Python script not found: ${pythonScript}. Set SV_EXECUTORS_DIR if ` +
            'the executors live elsewhere.'
        )
      );
      return;
    }

    const pythonExecutable = resolvePythonExecutable(PYTHON_CONFIG.EXECUTABLE);

    // Spawn Python process
    const pythonProcess = spawnPython(pythonExecutable, [pythonScript]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0 && code !== 1) {
        const errorMsg = stderr || 'No error output';
        console.error('[Python Executor] Process exited with code:', code);
        console.error('[Python Executor] stderr:', errorMsg);
        console.error('[Python Executor] stdout:', stdout);
        reject(new Error(`Python process exited with code ${code}. Error: ${errorMsg}`));
        return;
      }

      try {
        const result: PythonExecutionResult = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        console.error('[Python Executor] Failed to parse output:', stdout);
        console.error('[Python Executor] stderr:', stderr);
        reject(new Error(`Failed to parse Python output. stdout: ${stdout.substring(0, 200)}, stderr: ${stderr.substring(0, 200)}`));
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('[Python Executor] Failed to spawn process:', error);
      console.error('[Python Executor] Attempted to use:', pythonExecutable);
      console.error('[Python Executor] Script path:', pythonScript);
      reject(new Error(`Failed to spawn Python process: ${error.message}. Python executable: ${pythonExecutable}, Script: ${pythonScript}`));
    });

    // Send input data to Python via stdin
    pythonProcess.stdin.write(JSON.stringify(input));
    pythonProcess.stdin.end();

    // Timeout from environment config
    const timeout = setTimeout(() => {
      pythonProcess.kill();
      const timeoutMinutes = Math.floor(PYTHON_CONFIG.TIMEOUT_MS / 60000);
      reject(new Error(`Python execution timeout (${timeoutMinutes} minutes)`));
    }, PYTHON_CONFIG.TIMEOUT_MS);

    pythonProcess.on('close', () => {
      clearTimeout(timeout);
    });
  }));
}
