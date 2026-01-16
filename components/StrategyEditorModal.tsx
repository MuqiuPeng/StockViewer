'use client';

import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from './ThemeProvider';

interface Strategy {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  strategyType: 'single' | 'portfolio';
  constraints?: {
    maxPositions?: number;
    positionSizing: 'equal' | 'custom';
    reserveCash?: number;
  };
  parameters?: Record<string, any>;
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;
  dependencies?: string[];
}

interface Indicator {
  id: string;
  name: string;
  outputColumn: string;
}

interface StrategyEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedItem?: Strategy, type?: 'strategy') => void;
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
            - If external datasets are configured, their columns will be included
              with format: {dataset_name}@{column_name}
              Example: index_data@close, index_data@volume
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

const PORTFOLIO_CODE_TEMPLATE = `def calculate(data_map, parameters):
    """
    MACD Portfolio Rotation Strategy

    Multi-stock portfolio with shared capital.
    - Rebalances monthly based on MACD signals
    - Ranks stocks by MACD momentum (DIF - DEA)
    - Holds top 3 stocks with bullish MACD signals
    - Rotates capital into strongest momentum stocks

    Args:
        data_map: Dict[str, pd.DataFrame] - {symbol: OHLC data}
                  Each DataFrame has columns: date, open, high, low, close, volume
                  And MACD indicators: MACD:DIF, MACD:DEA, MACD:MACD
                  If external datasets are configured, their columns will be included
                  with format: {dataset_name}@{column_name}
        parameters: dict of configurable parameters

    Returns:
        List of signals with 'symbol' field:
        [
            {
                'date': '2024-01-01',
                'symbol': '000001',  # REQUIRED for portfolio strategies
                'type': 'v',         # 'v' for value-based, 'a' for amount-based
                'amount': 10000,     # Positive = buy, negative = sell
                'execution': 'next_open'  # Optional: 'close' or 'next_open'
            },
            ...
        ]
    """
    signals = []

    # Parameters
    top_n = parameters.get('top_stocks', 3)
    rebalance_days = parameters.get('rebalance_days', 21)  # Monthly rebalancing
    position_size = parameters.get('position_size', 30000)

    # Get reference dates from first symbol
    first_symbol = list(data_map.keys())[0]
    all_dates = data_map[first_symbol].index

    # Track current holdings
    current_holdings = set()

    # Loop through dates and rebalance periodically
    for i in range(40, len(all_dates), rebalance_days):  # Start at day 40 (MACD needs ~35 days)
        current_date = all_dates[i]

        # Calculate MACD momentum for each stock
        macd_scores = {}
        for symbol, df in data_map.items():
            if i >= len(df):
                continue

            try:
                # Get MACD values at this date and convert to float
                dif = float(df['MACD:DIF'].iloc[i])
                dea = float(df['MACD:DEA'].iloc[i])
                macd_hist = float(df['MACD:MACD'].iloc[i])

                # Skip if NaN
                if pd.isna(dif) or pd.isna(dea) or pd.isna(macd_hist):
                    continue

                # MACD momentum score: use histogram and check if DIF > DEA
                is_bullish = dif > dea
                momentum = macd_hist if is_bullish else -abs(macd_hist)

                macd_scores[symbol] = momentum
            except (KeyError, IndexError, ValueError, TypeError):
                continue

        if not macd_scores:
            continue

        # Rank stocks by MACD momentum
        ranked_symbols = sorted(macd_scores.items(), key=lambda x: x[1], reverse=True)

        # Select top N stocks with positive momentum
        target_holdings = set()
        for symbol, momentum in ranked_symbols[:top_n]:
            if momentum > 0:  # Only hold stocks with bullish MACD
                target_holdings.add(symbol)

        # Sell stocks no longer in top picks
        to_sell = current_holdings - target_holdings
        for symbol in to_sell:
            signals.append({
                'date': current_date.strftime('%Y-%m-%d'),
                'symbol': symbol,
                'type': 'v',
                'amount': -position_size,
                'execution': 'next_open'
            })

        # Buy new top picks
        to_buy = target_holdings - current_holdings
        for symbol in to_buy:
            signals.append({
                'date': current_date.strftime('%Y-%m-%d'),
                'symbol': symbol,
                'type': 'v',
                'amount': position_size,
                'execution': 'next_open'
            })

        # Update holdings
        current_holdings = target_holdings

    return signals`;

export default function StrategyEditorModal({
  isOpen,
  onClose,
  onSuccess,
  strategy,
}: StrategyEditorModalProps) {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pythonCode, setPythonCode] = useState('');
  const [strategyType, setStrategyType] = useState<'single' | 'portfolio'>('single');
  const [constraints, setConstraints] = useState({
    maxPositions: 5,
    positionSizing: 'equal' as 'equal' | 'custom',
    reserveCash: 10,
  });
  const [externalDatasets, setExternalDatasets] = useState<Record<string, { groupId: string; datasetName: string }>>({});
  const [editingDataset, setEditingDataset] = useState<string | null>(null);
  const [tempDatasetConfig, setTempDatasetConfig] = useState<{ paramName: string; groupId: string; datasetName: string } | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);

  // Load groups and indicators on mount
  useEffect(() => {
    if (isOpen) {
      fetch('/api/groups')
        .then((res) => res.json())
        .then((data) => {
          setGroups(data.groups || []);
        })
        .catch((err) => {
          console.error('Failed to load groups:', err);
        });

      fetch('/api/indicators')
        .then((res) => res.json())
        .then((data) => {
          setIndicators(data.indicators || []);
        })
        .catch((err) => {
          console.error('Failed to load indicators:', err);
        });
    }
  }, [isOpen]);

  useEffect(() => {
    if (strategy) {
      setName(strategy.name);
      setDescription(strategy.description);
      setPythonCode(strategy.pythonCode);
      setStrategyType(strategy.strategyType || 'single');
      setConstraints({
        maxPositions: strategy.constraints?.maxPositions ?? 5,
        positionSizing: strategy.constraints?.positionSizing ?? 'equal',
        reserveCash: strategy.constraints?.reserveCash ?? 10,
      });
      setExternalDatasets(strategy.externalDatasets || {});
      setDependencies(strategy.dependencies || []);
    } else {
      setName('');
      setDescription('');
      setStrategyType('single');
      setPythonCode(CODE_TEMPLATE);
      setConstraints({
        maxPositions: 5,
        positionSizing: 'equal',
        reserveCash: 10,
      });
      setExternalDatasets({});
      setDependencies([]);
    }
    setError(null);
    setValidationSuccess(null);
  }, [strategy, isOpen]);

  // Update code template when strategy type changes
  useEffect(() => {
    // Only update template if creating new strategy (not editing)
    if (!strategy) {
      setPythonCode(strategyType === 'portfolio' ? PORTFOLIO_CODE_TEMPLATE : CODE_TEMPLATE);
    }
  }, [strategyType, strategy]);

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
        setError(`Strategy validation failed: ${validationData.error}`);
        setErrorDetails(validationData);
        setIsLoading(false);
        return;
      }

      // Save strategy
      const url = strategy ? `/api/strategies/${strategy.id}` : '/api/strategies';
      const method = strategy ? 'PUT' : 'POST';

      // Filter out incomplete external datasets
      const validExternalDatasets = Object.fromEntries(
        Object.entries(externalDatasets).filter(
          ([_, dataset]) => dataset.groupId && dataset.datasetName
        )
      );

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          pythonCode,
          strategyType,
          constraints: strategyType === 'portfolio' ? constraints : undefined,
          externalDatasets: Object.keys(validExternalDatasets).length > 0 ? validExternalDatasets : undefined,
          dependencies: dependencies.length > 0 ? dependencies : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save strategy');
      }

      onSuccess(data.strategy || data, 'strategy');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save strategy');
      setErrorDetails(null);
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
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold dark:text-white">
            {strategy ? 'Edit Strategy' : 'Create New Strategy'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded">
            <div className="font-semibold mb-2">{error}</div>
            {errorDetails?.details?.warnings && errorDetails.details.warnings.length > 0 && (
              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-600 rounded">
                <div className="font-semibold text-yellow-800 dark:text-yellow-400 text-xs mb-1">⚠️ Warnings:</div>
                {errorDetails.details.warnings.map((warning: string, i: number) => (
                  <div key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
                    • {warning}
                  </div>
                ))}
              </div>
            )}
            {errorDetails?.details?.code_line && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-600 rounded text-sm font-mono">
                Code: {errorDetails.details.code_line}
              </div>
            )}
            {errorDetails?.details?.hints && errorDetails.details.hints.length > 0 && (
              <div className="mt-2 space-y-1">
                {errorDetails.details.hints.map((hint: string, i: number) => (
                  <div key={i} className="text-sm text-blue-700 dark:text-blue-400">
                    💡 {hint}
                  </div>
                ))}
              </div>
            )}
            {errorDetails?.details?.traceback && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                  Show full error details
                </summary>
                <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded overflow-x-auto max-h-40 dark:text-gray-300">
                  {errorDetails.details.traceback}
                </pre>
              </details>
            )}
          </div>
        )}

        {validationSuccess && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 rounded">
            {validationSuccess}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-white">Strategy Type</label>
            <div className="flex space-x-4">
              <label className="flex items-center cursor-pointer dark:text-white">
                <input
                  type="radio"
                  value="single"
                  checked={strategyType === 'single'}
                  onChange={(e) => setStrategyType(e.target.value as 'single')}
                  className="mr-2"
                  disabled={!!strategy}
                />
                <span>Single Stock</span>
              </label>
              <label className="flex items-center cursor-pointer dark:text-white">
                <input
                  type="radio"
                  value="portfolio"
                  checked={strategyType === 'portfolio'}
                  onChange={(e) => setStrategyType(e.target.value as 'portfolio')}
                  className="mr-2"
                  disabled={!!strategy}
                />
                <span>Portfolio (Multi-Stock)</span>
              </label>
            </div>
            {!!strategy && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Strategy type cannot be changed after creation
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-white">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-white">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
              rows={3}
              required
            />
          </div>

          {/* Dependencies Selector */}
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-white">
              Dependencies (Indicators)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Select indicators that this strategy requires. These must be applied to datasets before running the strategy.
            </p>
            {indicators.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                No indicators available. Create indicators first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 max-h-32 overflow-y-auto">
                {indicators.map((indicator) => (
                  <label
                    key={indicator.id}
                    className={`flex items-center px-3 py-1 rounded cursor-pointer text-sm transition-colors ${
                      dependencies.includes(indicator.name)
                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-600'
                        : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-500 hover:bg-gray-200 dark:hover:bg-gray-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={dependencies.includes(indicator.name)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setDependencies([...dependencies, indicator.name]);
                        } else {
                          setDependencies(dependencies.filter((d) => d !== indicator.name));
                        }
                      }}
                      className="sr-only"
                    />
                    {indicator.name}
                  </label>
                ))}
              </div>
            )}
            {dependencies.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Selected: {dependencies.join(', ')}
              </p>
            )}
          </div>

          {/* External Datasets Selector */}
          <div className="border border-gray-300 dark:border-gray-600 rounded p-4 bg-gray-50 dark:bg-gray-700">
            <h3 className="font-medium mb-2 dark:text-white">External Datasets (Optional)</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Include additional datasets (e.g., market indices, reference stocks) in your strategy.
            </p>

            {/* Help Box */}
            <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-600 rounded">
              <div className="flex items-start justify-between mb-1">
                <div className="text-xs font-medium text-blue-800 dark:text-blue-300">💡 How to use:</div>
                <button
                  type="button"
                  onClick={() => {
                    const template = strategyType === 'portfolio'
                      ? `def calculate(data_map, parameters):
    """
    Strategy using external dataset.

    Args:
        data_map: Dict[str, pd.DataFrame] - {symbol: OHLC data}
        parameters: Dict containing external datasets

    Returns:
        List of signals
    """
    import pandas as pd

    # Access external dataset (e.g., market index)
    # Replace 'index' with your parameter name
    index_data = parameters.get('index')

    if index_data is not None:
        # Example: Use index data for market timing
        # Merge with first symbol to check market conditions
        first_symbol = list(data_map.keys())[0]
        stock_data = data_map[first_symbol]

        # Merge on date
        merged = stock_data.merge(
            index_data[['date', 'close']],
            on='date',
            how='left',
            suffixes=('', '_index')
        )

        # Your strategy logic here...

    signals = []
    # Add your trading logic here

    return signals`
                      : `def calculate(data, parameters):
    """
    Strategy using external dataset.

    Args:
        data: pandas DataFrame with OHLC data
        parameters: Dict containing external datasets

    Returns:
        List of signals
    """
    import pandas as pd

    # Access external dataset (e.g., market index)
    # Replace 'index' with your parameter name
    index_data = parameters.get('index')

    signals = []

    if index_data is not None:
        # Merge with main data on date
        merged = data.merge(
            index_data[['date', 'close']],
            on='date',
            how='left',
            suffixes=('', '_index')
        )

        # Calculate relative strength
        merged['relative_strength'] = merged['close'] / merged['close_index']

        # Example: Buy when stock outperforms index
        for i in range(20, len(merged)):
            if merged['relative_strength'].iloc[i] > 1.05:
                signals.append({
                    'date': merged['date'].iloc[i],
                    'type': 'v',
                    'amount': 10000,
                    'execution': 'close'
                })

    return signals`;
                    setPythonCode(template);
                  }}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  📝 Insert Template
                </button>
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <div>1. Click &quot;+ Add External Dataset&quot; below</div>
                <div>2. Choose a parameter name (e.g., <code className="bg-blue-100 dark:bg-blue-800 px-1">index</code>)</div>
                <div>3. Select group and dataset</div>
                <div>4. Click &quot;Insert Template&quot; to see example code</div>
              </div>
            </div>

            {Object.entries(externalDatasets).map(([paramName, dataset]) => {
              const isEditing = editingDataset === paramName;
              const config = isEditing && tempDatasetConfig ? tempDatasetConfig : { paramName, ...dataset };
              const selectedGroup = groups.find(g => g.id === config.groupId);

              return (
                <div key={paramName} className="mb-3 p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium dark:text-white">Parameter Name:</label>
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (tempDatasetConfig) {
                                const updated = { ...externalDatasets };
                                // Remove old key if name changed
                                if (tempDatasetConfig.paramName !== paramName) {
                                  delete updated[paramName];
                                }
                                // Add/update with new configuration
                                updated[tempDatasetConfig.paramName] = {
                                  groupId: tempDatasetConfig.groupId,
                                  datasetName: tempDatasetConfig.datasetName
                                };
                                setExternalDatasets(updated);
                              }
                              setEditingDataset(null);
                              setTempDatasetConfig(null);
                            }}
                            className="text-green-600 hover:text-green-700 text-sm font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDataset(null);
                              setTempDatasetConfig(null);
                            }}
                            className="text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDataset(paramName);
                              setTempDatasetConfig({ paramName, ...dataset });
                            }}
                            className="text-blue-500 hover:text-blue-700 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = { ...externalDatasets };
                              delete updated[paramName];
                              setExternalDatasets(updated);
                            }}
                            className="text-red-500 hover:text-red-700 text-sm"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <input
                    type="text"
                    value={config.paramName}
                    onChange={(e) => {
                      if (isEditing) {
                        setTempDatasetConfig({
                          ...tempDatasetConfig!,
                          paramName: e.target.value
                        });
                      }
                    }}
                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm mb-2 bg-white dark:bg-gray-700 dark:text-white"
                    placeholder="e.g., index_data"
                    disabled={!isEditing}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400">Group:</label>
                      <select
                        value={config.groupId}
                        onChange={(e) => {
                          if (isEditing) {
                            setTempDatasetConfig({
                              ...tempDatasetConfig!,
                              groupId: e.target.value,
                              datasetName: ''
                            });
                          }
                        }}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-white"
                        disabled={!isEditing}
                      >
                        <option value="">Select group</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400">Dataset:</label>
                      <select
                        value={config.datasetName}
                        onChange={(e) => {
                          if (isEditing) {
                            setTempDatasetConfig({
                              ...tempDatasetConfig!,
                              datasetName: e.target.value
                            });
                          }
                        }}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-white"
                        disabled={!isEditing || !config.groupId}
                      >
                        <option value="">Select dataset</option>
                        {selectedGroup?.datasetNames.map((ds: string) => (
                          <option key={ds} value={ds}>{ds}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => {
                const newName = `dataset_${Object.keys(externalDatasets).length + 1}`;
                const updated = {
                  ...externalDatasets,
                  [newName]: { groupId: '', datasetName: '' }
                };
                setExternalDatasets(updated);
                // Auto-edit the newly added dataset
                setEditingDataset(newName);
                setTempDatasetConfig({ paramName: newName, groupId: '', datasetName: '' });
              }}
              className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              title="Add an external dataset to use in your strategy. Access columns via data['dataset_name@column_name']"
            >
              + Add External Dataset
            </button>
          </div>

          {strategyType === 'portfolio' && (
            <div className="border border-gray-300 dark:border-gray-600 rounded p-4 bg-gray-50 dark:bg-gray-700">
              <h3 className="font-medium mb-3 dark:text-white">Portfolio Constraints</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-white">
                    Max Concurrent Positions
                  </label>
                  <input
                    type="number"
                    value={constraints.maxPositions}
                    onChange={(e) => setConstraints({
                      ...constraints,
                      maxPositions: parseInt(e.target.value) || 0
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white"
                    min="1"
                    max="50"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Maximum number of stocks to hold simultaneously
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-white">
                    Reserve Cash (%)
                  </label>
                  <input
                    type="number"
                    value={constraints.reserveCash}
                    onChange={(e) => setConstraints({
                      ...constraints,
                      reserveCash: parseInt(e.target.value) || 0
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white"
                    min="0"
                    max="100"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Percentage of capital to keep as cash reserve
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-white">
                    Position Sizing
                  </label>
                  <select
                    value={constraints.positionSizing}
                    onChange={(e) => setConstraints({
                      ...constraints,
                      positionSizing: e.target.value as 'equal' | 'custom'
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white"
                  >
                    <option value="equal">Equal Weight</option>
                    <option value="custom">Custom (Strategy Controlled)</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    How to distribute capital across positions
                  </p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-white">Python Code</label>
            <div className="border border-gray-300 dark:border-gray-600 rounded" style={{ height: '600px' }}>
              <Editor
                height="600px"
                defaultLanguage="python"
                value={pythonCode}
                onChange={(value) => setPythonCode(value || '')}
                theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Strategy must define: <code className="dark:text-gray-300">def calculate(data, parameters)</code> returning list of signals
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
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
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

