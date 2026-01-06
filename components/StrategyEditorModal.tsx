'use client';

import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

interface Strategy {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  parameters?: Record<string, any>;
}

interface StrategyEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  strategy?: Strategy | null;
}

const CODE_TEMPLATE = `def calculate(data, parameters):
    """
    Calculate trading signals from stock data.

    Args:
        data: pandas DataFrame with columns:
            - date (datetime)
            - open, high, low, close, volume (float)
            - All existing indicators
        parameters: dict of configurable parameters

    Returns:
        list of dicts with format:
        [
            {
                'date': '2024-01-01',
                'type': 'v' or 'a',
                'amount': 100,
                'execution': 'close' or 'next_open'  # Optional
            },
            ...
        ]
        - 'type': 'v' for value-based (dollar amount), 'a' for amount-based (share count)
        - 'amount': positive for buying, negative for selling
        - 'execution': (optional) 'close' = execute at same day close (default, immediate)
                                  'next_open' = execute at next day open (realistic, overnight gap)
    """
    signals = []

    # Example: Simple moving average crossover strategy
    # Buy when short MA crosses above long MA
    # Sell when short MA crosses below long MA

    short_window = parameters.get('short_window', 10)
    long_window = parameters.get('long_window', 30)

    data['short_ma'] = data['close'].rolling(short_window).mean()
    data['long_ma'] = data['close'].rolling(long_window).mean()

    for i in range(1, len(data)):
        prev_short = data['short_ma'].iloc[i-1]
        prev_long = data['long_ma'].iloc[i-1]
        curr_short = data['short_ma'].iloc[i]
        curr_long = data['long_ma'].iloc[i]

        # Golden cross: buy signal
        if prev_short <= prev_long and curr_short > curr_long:
            signals.append({
                'date': data.index[i].strftime('%Y-%m-%d'),
                'type': 'v',  # value-based (dollar amount)
                'amount': 10000,  # Buy $10000 worth
                'execution': 'next_open'  # Execute at next day's open (realistic)
            })

        # Death cross: sell signal
        elif prev_short >= prev_long and curr_short < curr_long:
            signals.append({
                'date': data.index[i].strftime('%Y-%m-%d'),
                'type': 'v',  # value-based (dollar amount)
                'amount': -10000,  # Sell $10000 worth
                'execution': 'next_open'  # Execute at next day's open (realistic)
            })

    return signals`;

export default function StrategyEditorModal({
  isOpen,
  onClose,
  onSuccess,
  strategy,
}: StrategyEditorModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pythonCode, setPythonCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (strategy) {
      setName(strategy.name);
      setDescription(strategy.description);
      setPythonCode(strategy.pythonCode);
    } else {
      setName('');
      setDescription('');
      setPythonCode(CODE_TEMPLATE);
    }
    setError(null);
    setValidationSuccess(null);
  }, [strategy, isOpen]);

  const handleValidate = async () => {
    setError(null);
    setValidationSuccess(null);
    setIsValidating(true);

    try {
      const response = await fetch('/api/validate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pythonCode }),
      });

      const data = await response.json();

      if (!data.valid) {
        throw new Error(data.error + (data.details ? '\n\n' + data.details : ''));
      }

      setValidationSuccess(`✓ Strategy is valid! Generated ${data.signalCount} signal(s) on test data.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationSuccess(null);
    setIsLoading(true);

    try {
      // Validate before saving
      const validationResponse = await fetch('/api/validate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pythonCode }),
      });

      const validationData = await validationResponse.json();

      if (!validationData.valid) {
        throw new Error(
          'Strategy validation failed:\n' +
          validationData.error +
          (validationData.details ? '\n\n' + validationData.details : '')
        );
      }

      // Save strategy
      const url = strategy ? `/api/strategies/${strategy.id}` : '/api/strategies';
      const method = strategy ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          pythonCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save strategy');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save strategy');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">
            {strategy ? 'Edit Strategy' : 'Create New Strategy'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded whitespace-pre-wrap">
            {error}
          </div>
        )}

        {validationSuccess && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            {validationSuccess}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              rows={3}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Python Code</label>
            <div className="border rounded" style={{ height: '400px' }}>
              <Editor
                height="400px"
                defaultLanguage="python"
                value={pythonCode}
                onChange={(value) => setPythonCode(value || '')}
                theme="vs-light"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Strategy must define: <code>def calculate(data, parameters)</code> returning list of signals
            </p>
          </div>

          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={handleValidate}
              disabled={isValidating || isLoading}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {isValidating ? 'Validating...' : 'Validate Code'}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || isValidating}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : strategy ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

