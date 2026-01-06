import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { PYTHON_CONFIG } from '@/lib/env';

// Dangerous imports that should be blocked
const DANGEROUS_IMPORTS = [
  'os',
  'sys',
  'subprocess',
  'eval',
  'exec',
  'open',
  '__import__',
  'compile',
  'globals',
  'locals',
  'vars',
  'dir',
  'getattr',
  'setattr',
  'delattr',
  'input',
  'raw_input',
];

// POST /api/validate-strategy - Validate strategy code
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pythonCode } = body;

    if (!pythonCode) {
      return NextResponse.json(
        { error: 'Missing pythonCode field' },
        { status: 400 }
      );
    }

    // 1. Check for dangerous imports
    const dangerousImportCheck = DANGEROUS_IMPORTS.some((dangerous) => {
      const importRegex = new RegExp(
        `(import\\s+${dangerous}|from\\s+${dangerous}|__import__\\(|eval\\(|exec\\()`,
        'i'
      );
      return importRegex.test(pythonCode);
    });

    if (dangerousImportCheck) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Security violation: Code contains dangerous imports or functions (os, sys, subprocess, eval, exec, etc.)',
        },
        { status: 400 }
      );
    }

    // 2. Check if calculate function is defined
    if (!pythonCode.includes('def calculate(')) {
      return NextResponse.json(
        {
          valid: false,
          error: 'Strategy must define a calculate(data, parameters) function',
        },
        { status: 400 }
      );
    }

    // 3. Run validation with Python executor
    const validationResult = await executeStrategyValidation(pythonCode);

    if (!validationResult.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: validationResult.error,
          details: validationResult.details,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      message: 'Strategy code is valid',
      signalCount: validationResult.signalCount,
    });
  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json(
      {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      },
      { status: 500 }
    );
  }
}

async function executeStrategyValidation(
  strategyCode: string
): Promise<{ valid: boolean; error?: string; details?: string; signalCount?: number }> {
  return new Promise((resolve) => {
    // Get Python executable
    let pythonExecutable: string;

    if (PYTHON_CONFIG.EXECUTABLE !== 'python3') {
      pythonExecutable = PYTHON_CONFIG.EXECUTABLE;
    } else {
      const venvPath = path.join(process.cwd(), 'venv');
      const venvPython = process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');

      if (existsSync(venvPython)) {
        pythonExecutable = venvPython;
      } else {
        pythonExecutable = 'python3';
      }
    }

    // Create sample data for validation (10 days of fake data)
    const sampleData = [];
    const baseDate = new Date('2024-01-01');
    for (let i = 0; i < 10; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);
      sampleData.push({
        date: date.toISOString().split('T')[0],
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 102 + i,
        volume: 1000000,
      });
    }

    // Create validation script
    const validationScript = `
import sys
import json
import traceback

try:
    import pandas as pd
    import numpy as np
except ImportError as e:
    print(json.dumps({
        'valid': False,
        'error': f'Missing required dependency: {str(e)}'
    }))
    sys.exit(1)

# Read input
input_data = json.load(sys.stdin)
strategy_code = input_data['strategyCode']
data_records = input_data['data']

try:
    # Convert to DataFrame
    df = pd.DataFrame(data_records)
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)

    # Execute strategy in isolated namespace
    namespace = {
        'pd': pd,
        'np': np,
        'data': df,
        'parameters': {},
    }

    exec(strategy_code, namespace)

    # Check if calculate function exists
    if 'calculate' not in namespace:
        print(json.dumps({
            'valid': False,
            'error': 'Strategy must define a calculate(data, parameters) function'
        }))
        sys.exit(1)

    # Execute calculate function
    result = namespace['calculate'](df, {})

    # Validate result type
    if not isinstance(result, list):
        print(json.dumps({
            'valid': False,
            'error': 'calculate() must return a list',
            'details': f'Got {type(result).__name__} instead'
        }))
        sys.exit(1)

    # Validate each signal
    for idx, signal in enumerate(result):
        if not isinstance(signal, dict):
            print(json.dumps({
                'valid': False,
                'error': f'Signal at index {idx} must be a dictionary',
                'details': f'Got {type(signal).__name__} instead'
            }))
            sys.exit(1)

        # Check required fields
        required_fields = ['date', 'type', 'amount']
        for field in required_fields:
            if field not in signal:
                print(json.dumps({
                    'valid': False,
                    'error': f'Signal at index {idx} missing required field: {field}',
                    'details': f'Signal: {signal}'
                }))
                sys.exit(1)

        # Validate type field
        if signal['type'] not in ['v', 'a']:
            print(json.dumps({
                'valid': False,
                'error': f'Signal at index {idx} has invalid type: {signal["type"]}',
                'details': 'Type must be "v" (value-based) or "a" (amount-based)'
            }))
            sys.exit(1)

        # Validate amount is numeric
        try:
            float(signal['amount'])
        except (ValueError, TypeError):
            print(json.dumps({
                'valid': False,
                'error': f'Signal at index {idx} has non-numeric amount: {signal["amount"]}',
                'details': 'Amount must be a number'
            }))
            sys.exit(1)

        # Validate date format
        try:
            pd.to_datetime(signal['date'])
        except Exception:
            print(json.dumps({
                'valid': False,
                'error': f'Signal at index {idx} has invalid date format: {signal["date"]}',
                'details': 'Date must be in YYYY-MM-DD format'
            }))
            sys.exit(1)

        # Validate execution field if present
        if 'execution' in signal:
            if signal['execution'] not in ['close', 'next_open']:
                print(json.dumps({
                    'valid': False,
                    'error': f'Signal at index {idx} has invalid execution mode: {signal["execution"]}',
                    'details': 'Execution mode must be "close" or "next_open"'
                }))
                sys.exit(1)

    # All checks passed
    print(json.dumps({
        'valid': True,
        'signalCount': len(result)
    }))

except SyntaxError as e:
    print(json.dumps({
        'valid': False,
        'error': 'Syntax Error in strategy code',
        'details': f'Line {e.lineno}: {str(e)}'
    }))
    sys.exit(1)
except Exception as e:
    print(json.dumps({
        'valid': False,
        'error': str(e),
        'details': traceback.format_exc()
    }))
    sys.exit(1)
`;

    const pythonProcess = spawn(pythonExecutable, ['-c', validationScript], {
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
      if (!stdout.trim()) {
        resolve({
          valid: false,
          error: 'Validation failed to produce output',
          details: stderr || 'No error message available',
        });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        resolve({
          valid: false,
          error: 'Failed to parse validation result',
          details: stdout.substring(0, 500) + '\n' + stderr.substring(0, 500),
        });
      }
    });

    pythonProcess.on('error', (error) => {
      resolve({
        valid: false,
        error: `Failed to run validation: ${error.message}`,
      });
    });

    // Send input data
    pythonProcess.stdin.write(
      JSON.stringify({
        strategyCode,
        data: sampleData,
      })
    );
    pythonProcess.stdin.end();

    // Timeout
    setTimeout(() => {
      pythonProcess.kill();
      resolve({
        valid: false,
        error: 'Validation timeout (10 seconds)',
      });
    }, 10000);
  });
}
