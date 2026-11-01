import { resolvePythonExecutable, spawnPython, withPythonSlot } from './python-child';
import { PYTHON_CONFIG } from './env';
import { executorScript } from './paths';
import type { BacktestInput, BacktestResult } from '@stockviewer/shared';



export async function executeBacktest(
  input: BacktestInput
): Promise<BacktestResult> {
  return withPythonSlot(() => new Promise<BacktestResult>((resolve, reject) => {
    const pythonScript = executorScript('backtest_executor.py');

    // Validate input
    if (!input.strategyType) {
      reject(new Error('strategyType is required'));
      return;
    }

    if (input.strategyType === 'signal' && !input.data) {
      reject(new Error('data is required for single-stock backtest'));
      return;
    }

    if (input.strategyType === 'portfolio' && !input.dataMap) {
      reject(new Error('dataMap is required for portfolio backtest'));
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
      // Log stderr for debugging
      if (stderr) {
        console.error('[Python Debug Output]:', stderr);
      }

      // Check if we have any output to parse
      if (!stdout.trim()) {
        reject(new Error(`Python process produced no output. Exit code: ${code}. Error: ${stderr || 'No error message'}`));
        return;
      }

      try {
        const result: BacktestResult = JSON.parse(stdout);

        // If result indicates failure, include stderr if available
        if (!result.success && !result.error && stderr) {
          result.error = stderr;
        }

        resolve(result);
      } catch (error) {
        // If JSON parsing fails, include both stdout and stderr in error
        const errorMsg = stderr || stdout || 'No error message available';
        reject(new Error(`Failed to parse Python output. Exit code: ${code}. Output: ${stdout.substring(0, 500)}. Error: ${errorMsg.substring(0, 500)}`));
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
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

