import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { PYTHON_CONFIG } from './env';

export interface PythonExecutionInput {
  code: string;
  data: Record<string, any>[];
  isGroup?: boolean;  // NEW: indicates group mode for MyTT indicators
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;  // External datasets configuration
}

export interface PythonExecutionResult {
  success: boolean;
  values?: (number | null)[] | Record<string, (number | null)[]>;  // Single array OR dict for groups
  error?: string;
  type?: string;
}

export async function executePythonIndicator(
  input: PythonExecutionInput
): Promise<PythonExecutionResult> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), 'data', 'python', 'executor.py');

    // Check if executor.py exists
    if (!existsSync(pythonScript)) {
      reject(new Error(`Python script not found: ${pythonScript}. Current directory: ${process.cwd()}`));
      return;
    }

    // Get Python executable - prioritize env config, then local venv
    let pythonExecutable: string;

    // Check for configured Python path first
    if (PYTHON_CONFIG.EXECUTABLE !== 'python3') {
      // Custom Python executable specified in env
      pythonExecutable = PYTHON_CONFIG.EXECUTABLE;
    } else {
      // Look for local venv in project directory
      const venvPath = path.join(process.cwd(), 'venv');
      const venvPython = process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');

      if (existsSync(venvPython)) {
        pythonExecutable = venvPython;
        console.log('[Python Executor] Using venv Python:', venvPython);
      } else {
        // Fall back to python3
        pythonExecutable = 'python3';
        console.log('[Python Executor] venv not found, using system python3');
      }
    }

    console.log('[Python Executor] Executing with:', pythonExecutable);
    console.log('[Python Executor] Script:', pythonScript);

    // Spawn Python process
    const pythonProcess = spawn(pythonExecutable, [pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

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
  });
}
