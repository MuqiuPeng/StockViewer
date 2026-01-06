import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { PYTHON_CONFIG } from './env';

export interface BacktestInput {
  strategyCode: string;
  data: Record<string, any>[];
  initialCash?: number;
  commission?: number;
  parameters?: Record<string, any>;
}

export interface BacktestResult {
  success: boolean;
  metrics?: {
    totalReturn: number;
    totalReturnPct: number;
    finalValue: number;
    initialValue: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
    sortinoRatio: number;
    calmarRatio: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    tradeCount: number;
    wonTrades?: number;
    lostTrades?: number;
    longestWinStreak?: number;
    longestLossStreak?: number;
    avgSlippagePct?: number;
    totalSlippageCost?: number;
    sameDayTrades?: number;
    nextOpenTrades?: number;
  };
  equityCurve?: Array<{ date: string; value: number }>;
  tradeMarkers?: Array<{
    signal_date?: string;
    execution_date?: string;
    date: string;
    type: 'buy' | 'sell';
    amount?: number;
    price?: number;
    signal_price?: number;
    size?: number;
    value?: number;
    commission?: number;
    execution_mode?: 'close' | 'next_open';
  }>;
  error?: string;
  type?: string;
}

export async function executeBacktest(
  input: BacktestInput
): Promise<BacktestResult> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), 'data', 'python', 'backtest-executor.py');

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
  });
}

