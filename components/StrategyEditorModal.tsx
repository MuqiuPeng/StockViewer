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
  readOnly?: boolean;
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
  readOnly = false,
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

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[80vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold dark:text-white">
            {readOnly ? 'View Strategy' : (strategy ? 'Edit Strategy' : 'Create New Strategy')}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleValidate}
              disabled={isValidating || !pythonCode}
              className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || !name || !description || !pythonCode}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : strategy ? 'Update' : 'Create'}
              </button>
            )}
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mx-4 mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded text-sm flex-shrink-0">
            <div className="font-semibold">{error}</div>
            {errorDetails?.details?.traceback && (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer">Show details</summary>
                <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-900 rounded overflow-x-auto max-h-20">
                  {errorDetails.details.traceback}
                </pre>
              </details>
            )}
          </div>
        )}
        {validationSuccess && (
          <div className="mx-4 mt-2 p-2 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 rounded text-sm flex-shrink-0">
            {validationSuccess}
          </div>
        )}

        {/* Main Content - Three Columns */}
        <div className="flex flex-1 overflow-hidden p-4 gap-4">
          {/* Left Panel - Basic Settings */}
          <div className="w-64 flex-shrink-0 overflow-y-auto space-y-3">
            {/* Type */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Type</label>
              <select
                value={strategyType}
                onChange={(e) => setStrategyType(e.target.value as 'single' | 'portfolio')}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                disabled={isLoading || !!strategy || readOnly}
              >
                <option value="single">Single Stock</option>
                <option value="portfolio">Portfolio (Multi-Stock)</option>
              </select>
              {!!strategy && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Cannot change after creation
                </p>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                placeholder="e.g., MA_Crossover"
                disabled={isLoading || readOnly}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                placeholder="Brief description"
                rows={2}
                disabled={isLoading || readOnly}
              />
            </div>

            {/* Dependencies */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Dependencies</label>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                Required indicators for this strategy
              </p>
              {indicators.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No indicators</p>
              ) : (
                <div className="flex flex-wrap gap-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 max-h-24 overflow-y-auto">
                  {indicators.map((indicator) => (
                    <label
                      key={indicator.id}
                      className={`flex items-center px-2 py-0.5 rounded cursor-pointer text-xs transition-colors ${
                        dependencies.includes(indicator.name)
                          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200'
                          : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500'
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
                        disabled={readOnly}
                      />
                      {indicator.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Template Button */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setPythonCode(strategyType === 'portfolio' ? PORTFOLIO_CODE_TEMPLATE : CODE_TEMPLATE)}
                className="w-full px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                disabled={readOnly}
              >
                Insert Template
              </button>
            </div>
          </div>

          {/* Center - Code Editor */}
          <div className="flex-1 min-w-0">
            <div className="h-full border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
              <Editor
                height="100%"
                defaultLanguage="python"
                value={pythonCode}
                onChange={(value) => setPythonCode(value || '')}
                theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4,
                  insertSpaces: true,
                  wordWrap: 'off',
                  readOnly: isLoading || readOnly,
                  formatOnPaste: true,
                  formatOnType: true,
                  suggestOnTriggerCharacters: true,
                  quickSuggestions: true,
                  parameterHints: { enabled: true },
                  folding: true,
                  bracketPairColorization: { enabled: true },
                  guides: {
                    indentation: true,
                    bracketPairs: true
                  }
                }}
                loading={<div className="p-4 text-gray-500">Loading editor...</div>}
              />
            </div>
          </div>

          {/* Right Panel - External Datasets & Portfolio Constraints */}
          <div className="w-64 flex-shrink-0 overflow-y-auto space-y-3">
            {/* External Datasets */}
            <div className="border border-gray-300 dark:border-gray-600 rounded p-3 bg-gray-50 dark:bg-gray-700">
              <h3 className="text-xs font-medium mb-2 dark:text-white">External Datasets</h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">
                Include additional datasets (e.g., index data)
              </p>

              {Object.entries(externalDatasets).map(([paramName, dataset]) => {
                const isEditing = editingDataset === paramName;
                const config = isEditing && tempDatasetConfig ? tempDatasetConfig : { paramName, ...dataset };
                const selectedGroup = groups.find(g => g.id === config.groupId);

                return (
                  <div key={paramName} className="mb-2 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium dark:text-white truncate">{config.paramName}</span>
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (tempDatasetConfig) {
                                  const updated = { ...externalDatasets };
                                  if (tempDatasetConfig.paramName !== paramName) {
                                    delete updated[paramName];
                                  }
                                  updated[tempDatasetConfig.paramName] = {
                                    groupId: tempDatasetConfig.groupId,
                                    datasetName: tempDatasetConfig.datasetName
                                  };
                                  setExternalDatasets(updated);
                                }
                                setEditingDataset(null);
                                setTempDatasetConfig(null);
                              }}
                              className="text-green-600 hover:text-green-700"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDataset(null);
                                setTempDatasetConfig(null);
                              }}
                              className="text-gray-500 hover:text-gray-700"
                            >
                              ✕
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
                              className="text-blue-500 hover:text-blue-700"
                              disabled={readOnly}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = { ...externalDatasets };
                                delete updated[paramName];
                                setExternalDatasets(updated);
                              }}
                              className="text-red-500 hover:text-red-700"
                              disabled={readOnly}
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {isEditing && (
                      <>
                        <input
                          type="text"
                          value={config.paramName}
                          onChange={(e) => setTempDatasetConfig({ ...tempDatasetConfig!, paramName: e.target.value })}
                          className="w-full px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs mb-1 bg-white dark:bg-gray-700 dark:text-white"
                          placeholder="Parameter name"
                        />
                        <select
                          value={config.groupId}
                          onChange={(e) => setTempDatasetConfig({ ...tempDatasetConfig!, groupId: e.target.value, datasetName: '' })}
                          className="w-full px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs mb-1 bg-white dark:bg-gray-700 dark:text-white"
                        >
                          <option value="">Select group</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                        <select
                          value={config.datasetName}
                          onChange={(e) => setTempDatasetConfig({ ...tempDatasetConfig!, datasetName: e.target.value })}
                          className="w-full px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-700 dark:text-white"
                          disabled={!config.groupId}
                        >
                          <option value="">Select dataset</option>
                          {selectedGroup?.stockIds?.map((ds: string) => (
                            <option key={ds} value={ds}>{ds}</option>
                          ))}
                        </select>
                      </>
                    )}
                    {!isEditing && (
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {dataset.datasetName || 'Not configured'}
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  const newName = `dataset_${Object.keys(externalDatasets).length + 1}`;
                  setExternalDatasets({ ...externalDatasets, [newName]: { groupId: '', datasetName: '' } });
                  setEditingDataset(newName);
                  setTempDatasetConfig({ paramName: newName, groupId: '', datasetName: '' });
                }}
                className="w-full px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={readOnly}
              >
                + Add Dataset
              </button>
            </div>

            {/* Portfolio Constraints */}
            {strategyType === 'portfolio' && (
              <div className="border border-gray-300 dark:border-gray-600 rounded p-3 bg-gray-50 dark:bg-gray-700">
                <h3 className="text-xs font-medium mb-2 dark:text-white">Portfolio Constraints</h3>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] text-gray-600 dark:text-gray-400 mb-0.5">
                      Max Positions
                    </label>
                    <input
                      type="number"
                      value={constraints.maxPositions}
                      onChange={(e) => setConstraints({ ...constraints, maxPositions: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white"
                      min="1"
                      max="50"
                      disabled={readOnly}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-600 dark:text-gray-400 mb-0.5">
                      Reserve Cash (%)
                    </label>
                    <input
                      type="number"
                      value={constraints.reserveCash}
                      onChange={(e) => setConstraints({ ...constraints, reserveCash: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white"
                      min="0"
                      max="100"
                      disabled={readOnly}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-600 dark:text-gray-400 mb-0.5">
                      Position Sizing
                    </label>
                    <select
                      value={constraints.positionSizing}
                      onChange={(e) => setConstraints({ ...constraints, positionSizing: e.target.value as 'equal' | 'custom' })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white"
                      disabled={readOnly}
                    >
                      <option value="equal">Equal Weight</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Usage Help */}
            <div className="border border-gray-300 dark:border-gray-600 rounded p-3 bg-blue-50 dark:bg-blue-900/30">
              <h3 className="text-xs font-medium mb-1 text-blue-800 dark:text-blue-300">💡 Tips</h3>
              <div className="text-[10px] text-blue-700 dark:text-blue-300 space-y-1">
                <div>• Use <code className="bg-blue-100 dark:bg-blue-800 px-0.5">parameters.get(&apos;name&apos;)</code> to access external datasets</div>
                <div>• Return signals with: date, type, amount, execution</div>
                <div>• Portfolio strategies need &apos;symbol&apos; in each signal</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

