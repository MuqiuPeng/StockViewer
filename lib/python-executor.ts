import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';

export interface PythonExecutionInput {
  code: string;
  data: Record<string, any>[];
  isGroup?: boolean;  // NEW: indicates group mode for MyTT indicators
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

    // Get Python executable - prioritize local venv
    let pythonExecutable: string;
    
    // Check for explicit Python path first
    if (process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE) {
      pythonExecutable = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE!;
    } else {
      // Look for local venv in project directory
      const venvPath = path.join(process.cwd(), 'venv');
      const venvPython = process.platform === 'win32' 
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');
      
      if (existsSync(venvPython)) {
        pythonExecutable = venvPython;
      } else {
        // Fall back to python3
        pythonExecutable = 'python3';
      }
    }

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
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result: PythonExecutionResult = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });

    // Send input data to Python via stdin
    pythonProcess.stdin.write(JSON.stringify(input));
    pythonProcess.stdin.end();

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('Python execution timeout (5 minutes)'));
    }, 5 * 60 * 1000);

    pythonProcess.on('close', () => {
      clearTimeout(timeout);
    });
  });
}
