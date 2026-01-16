'use client';

import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from './ThemeProvider';

interface Indicator {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  outputColumn: string;
  isGroup?: boolean;
  groupName?: string;
  expectedOutputs?: string[];
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;
}

interface IndicatorEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedItem?: Indicator, type?: 'indicator') => void;
  indicator?: Indicator | null;
}

const CODE_TEMPLATE = `def calculate(data):
    """
    Calculate indicator from stock data.

    Args:
        data: pandas DataFrame with columns:
            - date (datetime)
            - open, high, low, close, volume (float)
            - All other existing indicators
            - If external datasets are configured, their columns will be included
              with format: {dataset_name}@{column_name}

    Returns:
        pandas Series or list of same length as data
    """
    # Example: 20-day Simple Moving Average
    return data['close'].rolling(20).mean()`;

const MYTT_TEMPLATE = `def calculate(data):
    """
    Calculate indicator group using MyTT functions.

    Args:
        data: pandas DataFrame with columns:
            - date (datetime)
            - open, high, low, close, volume (float)
            - All existing indicators
            - If external datasets are configured, their columns will be included
              with format: {dataset_name}@{column_name}

    Returns:
        dict with indicator_name: values (numpy array or pandas Series)
    """
    # Example: MACD indicator group
    DIF, DEA, MACD_hist = MACD(data['close'].values, SHORT=12, LONG=26, M=9)

    return {
        'DIF': DIF,
        'DEA': DEA,
        'MACD': MACD_hist
    }`;

export default function IndicatorEditorModal({
  isOpen,
  onClose,
  onSuccess,
  indicator,
}: IndicatorEditorModalProps) {
  const { theme } = useTheme();
  const [indicatorType, setIndicatorType] = useState<'custom' | 'mytt_group'>('custom');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [outputColumn, setOutputColumn] = useState('');
  const [groupName, setGroupName] = useState('');
  const [expectedOutputs, setExpectedOutputs] = useState<string[]>(['']);
  const [pythonCode, setPythonCode] = useState('');
  const [externalDatasets, setExternalDatasets] = useState<Record<string, { groupId: string; datasetName: string }>>({});
  const [editingDataset, setEditingDataset] = useState<string | null>(null);
  const [tempDatasetConfig, setTempDatasetConfig] = useState<{ paramName: string; groupId: string; datasetName: string } | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'text' | 'upload'>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [syntaxWarnings, setSyntaxWarnings] = useState<string[]>([]);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);

  // Orphaned columns check state
  const [showOrphanedColumnsModal, setShowOrphanedColumnsModal] = useState(false);
  const [orphanedColumnsData, setOrphanedColumnsData] = useState<{
    orphanedColumns: string[];
    dependentIndicators: { column: string; indicators: { id: string; name: string }[] }[];
  } | null>(null);
  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);

  // Column rename auto-fix state
  const [showColumnRenameModal, setShowColumnRenameModal] = useState(false);
  const [columnRenameData, setColumnRenameData] = useState<{
    columnRenames: { column: string; newColumn: string; indicators: { id: string; name: string }[] }[];
    pendingSubmit: any; // Store the pending request body
  } | null>(null);

  // Load groups on mount (includes both custom and data source groups)
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
    }
  }, [isOpen]);

  useEffect(() => {
    if (indicator) {
      setIndicatorType(indicator.isGroup ? 'mytt_group' : 'custom');
      setName(indicator.name);
      setDescription(indicator.description);
      setOutputColumn(indicator.outputColumn);
      setGroupName(indicator.groupName || '');
      setExpectedOutputs(indicator.expectedOutputs || ['']);
      setPythonCode(indicator.pythonCode);
      setExternalDatasets(indicator.externalDatasets || {});
    } else {
      setIndicatorType('custom');
      setName('');
      setDescription('');
      setOutputColumn('');
      setGroupName('');
      setExpectedOutputs(['']);
      setPythonCode('');
      setExternalDatasets({});
    }
    setError(null);
    setValidationMessage(null);
    setIsLoading(false);
    setIsValidating(false);
    setEditingDataset(null);
    setTempDatasetConfig(null);
  }, [indicator, isOpen]);

  // Auto-fill output column or groupName from name
  useEffect(() => {
    if (!indicator && name) {
      const normalized = name.replace(/\s+/g, '_');
      if (indicatorType === 'mytt_group' && !groupName) {
        setGroupName(normalized);
      } else if (indicatorType === 'custom' && !outputColumn) {
        setOutputColumn(normalized);
      }
    }
  }, [name, indicator, outputColumn, groupName, indicatorType]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.py')) {
      setError('Please upload a .py file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setPythonCode(content);
      setActiveTab('text');
    };
    reader.readAsText(file);
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationMessage(null);
    setError(null);

    try {
      // Filter out incomplete external datasets
      const validExternalDatasets = Object.fromEntries(
        Object.entries(externalDatasets).filter(
          ([_, dataset]) => dataset.groupId && dataset.datasetName
        )
      );

      const requestBody: any = {
        pythonCode,
        isGroup: indicatorType === 'mytt_group'
      };

      if (Object.keys(validExternalDatasets).length > 0) {
        requestBody.externalDatasets = validExternalDatasets;
      }

      const response = await fetch('/api/validate-indicator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.valid) {
        setValidationMessage('✓ Code is valid!');
        setErrorDetails(null);
      } else {
        setError(data.error || 'Validation failed');
        setErrorDetails(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation error');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationMessage(null);

    if (!name || !description || !pythonCode) {
      setError('Please fill in all required fields');
      return;
    }

    // Validate group-specific fields
    if (indicatorType === 'mytt_group') {
      if (!groupName) {
        setError('Group name is required for MyTT indicators');
        return;
      }

      const filteredOutputs = expectedOutputs.filter(o => o.trim() !== '');
      if (filteredOutputs.length === 0) {
        setError('At least one expected output is required for MyTT indicators');
        return;
      }
    }

    setIsLoading(true);

    try {
      const url = indicator
        ? `/api/indicators/${indicator.id}`
        : '/api/indicators';
      const method = indicator ? 'PUT' : 'POST';

      const requestBody: any = {
        name,
        description,
        pythonCode,
      };

      if (indicatorType === 'mytt_group') {
        requestBody.isGroup = true;
        requestBody.groupName = groupName;
        requestBody.expectedOutputs = expectedOutputs.filter(o => o.trim() !== '');
      } else {
        requestBody.isGroup = false;
        requestBody.outputColumn = outputColumn || name;
      }

      // Filter out incomplete external datasets
      const validExternalDatasets = Object.fromEntries(
        Object.entries(externalDatasets).filter(
          ([_, dataset]) => dataset.groupId && dataset.datasetName
        )
      );

      // Always send externalDatasets (even if empty) so the API knows to clear it
      // Use null to signal "clear all external datasets"
      requestBody.externalDatasets = Object.keys(validExternalDatasets).length > 0
        ? validExternalDatasets
        : null;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        // Check if this is a column rename that affects dependent indicators
        if (data.error === 'Column rename affects dependent indicators' && data.requiresAutoFix) {
          // Store the pending request and show the modal
          setColumnRenameData({
            columnRenames: data.columnRenames,
            pendingSubmit: requestBody,
          });
          setShowColumnRenameModal(true);
          setIsLoading(false);
          return;
        }

        // Check if this is a "columns have dependents" error
        if (data.error === 'Columns have dependent indicators' && data.dependentColumns) {
          // Build confirmation message
          const dependentInfo = data.dependentColumns as { column: string; indicators: { id: string; name: string }[] }[];
          const lines = dependentInfo.map(({ column, indicators }) => {
            const indicatorNames = indicators.map(ind => ind.name).join(', ');
            return `  • ${column} is used by: ${indicatorNames}`;
          });

          const confirmMessage = `The following columns are used by other indicators:\n${lines.join('\n')}\n\nDo you want to remove them anyway? This may break the dependent indicators.`;

          if (confirm(confirmMessage)) {
            // Retry with force=true
            const forceResponse = await fetch(`${url}?force=true`, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            });

            const forceData = await forceResponse.json();

            if (!forceResponse.ok) {
              setError(forceData.message || 'Failed to save indicator');
              setIsLoading(false);
              return;
            }

            setIsLoading(false);
            onSuccess(forceData.indicator || forceData, 'indicator');
            return;
          } else {
            setIsLoading(false);
            return;
          }
        }

        setError(data.message || 'Failed to save indicator');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      onSuccess(data.indicator || data, 'indicator');

      // Check for orphaned columns after successful save
      checkForOrphanedColumns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setIsLoading(false);
    }
  };

  // Check for orphaned columns in CSV files
  const checkForOrphanedColumns = async () => {
    try {
      const response = await fetch('/api/check-orphaned-columns');
      const data = await response.json();

      if (data.hasOrphanedColumns && data.orphanedColumns.length > 0) {
        setOrphanedColumnsData({
          orphanedColumns: data.orphanedColumns,
          dependentIndicators: data.dependentIndicators || [],
        });
        setShowOrphanedColumnsModal(true);
      }
    } catch (err) {
      console.error('Error checking for orphaned columns:', err);
    }
  };

  // Handle orphaned columns cleanup
  const handleCleanupOrphanedColumns = async () => {
    if (!orphanedColumnsData) return;

    setIsCleaningOrphans(true);

    try {
      // Collect all indicator IDs that need to be deleted
      const indicatorIdsToDelete: string[] = [];
      orphanedColumnsData.dependentIndicators.forEach(({ indicators }) => {
        indicators.forEach(ind => {
          if (!indicatorIdsToDelete.includes(ind.id)) {
            indicatorIdsToDelete.push(ind.id);
          }
        });
      });

      const response = await fetch('/api/check-orphaned-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orphanedColumns: orphanedColumnsData.orphanedColumns,
          indicatorIdsToDelete,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Cleaned up orphaned columns:', data);
        setShowOrphanedColumnsModal(false);
        setOrphanedColumnsData(null);
        onSuccess(); // Refresh the indicator list (no new item here, just cleanup)
      } else {
        setError(data.message || 'Failed to cleanup orphaned columns');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cleaning up orphaned columns');
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  // Cancel orphaned columns cleanup
  const handleCancelOrphanedCleanup = () => {
    setShowOrphanedColumnsModal(false);
    setOrphanedColumnsData(null);
  };

  // Handle column rename auto-fix
  const handleAutoFixColumnRename = async () => {
    if (!columnRenameData || !indicator) return;

    setIsLoading(true);

    try {
      const url = `/api/indicators/${indicator.id}?autoFix=true`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(columnRenameData.pendingSubmit),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to save indicator');
        setIsLoading(false);
        setShowColumnRenameModal(false);
        setColumnRenameData(null);
        return;
      }

      setIsLoading(false);
      setShowColumnRenameModal(false);
      setColumnRenameData(null);
      onSuccess(data.indicator || data, 'indicator');

      // Check for orphaned columns after successful save
      checkForOrphanedColumns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setIsLoading(false);
      setShowColumnRenameModal(false);
      setColumnRenameData(null);
    }
  };

  // Cancel column rename
  const handleCancelColumnRename = () => {
    setShowColumnRenameModal(false);
    setColumnRenameData(null);
  };

  const handleInsertTemplate = () => {
    setPythonCode(CODE_TEMPLATE);
  };

  const handleInsertMyTTTemplate = () => {
    setPythonCode(MYTT_TEMPLATE);
  };

  // Basic syntax checking with line numbers
  const checkBasicSyntax = (code: string) => {
    const warnings: string[] = [];
    const markers: any[] = [];

    if (!code.trim()) {
      return { warnings, markers };
    }

    const lines = code.split('\n');

    // Check for calculate function definition
    const hasCalculate = code.includes('def calculate(data)');
    if (!hasCalculate) {
      warnings.push('Missing "def calculate(data):" function definition');
      markers.push({
        severity: 4, // Warning
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 100,
        message: 'Missing "def calculate(data):" function definition'
      });
    }

    // Check for return statement
    const hasReturn = code.includes('return');
    if (!hasReturn) {
      warnings.push('Missing return statement');
      const lastLine = lines.length;
      markers.push({
        severity: 4, // Warning
        startLineNumber: lastLine,
        startColumn: 1,
        endLineNumber: lastLine,
        endColumn: lines[lastLine - 1]?.length || 1,
        message: 'Missing return statement'
      });
    }

    // Check for balanced parentheses
    const openParen = (code.match(/\(/g) || []).length;
    const closeParen = (code.match(/\)/g) || []).length;
    if (openParen !== closeParen) {
      const msg = `Unbalanced parentheses: ${openParen} open, ${closeParen} close`;
      warnings.push(msg);

      // Find line with imbalance
      let balance = 0;
      let errorLine = 1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        balance += (line.match(/\(/g) || []).length;
        balance -= (line.match(/\)/g) || []).length;
        if (balance < 0) {
          errorLine = i + 1;
          break;
        }
      }

      markers.push({
        severity: 8, // Error
        startLineNumber: errorLine,
        startColumn: 1,
        endLineNumber: errorLine,
        endColumn: lines[errorLine - 1]?.length || 1,
        message: msg
      });
    }

    // Check for balanced brackets
    const openBracket = (code.match(/\[/g) || []).length;
    const closeBracket = (code.match(/\]/g) || []).length;
    if (openBracket !== closeBracket) {
      const msg = `Unbalanced brackets: ${openBracket} open, ${closeBracket} close`;
      warnings.push(msg);
      markers.push({
        severity: 8,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 100,
        message: msg
      });
    }

    // Check for balanced braces
    const openBrace = (code.match(/\{/g) || []).length;
    const closeBrace = (code.match(/\}/g) || []).length;
    if (openBrace !== closeBrace) {
      const msg = `Unbalanced braces: ${openBrace} open, ${closeBrace} close`;
      warnings.push(msg);
      markers.push({
        severity: 8,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 100,
        message: msg
      });
    }

    return { warnings, markers };
  };

  // Check syntax when code changes and update editor markers
  useEffect(() => {
    if (pythonCode && editorInstance && monacoInstance) {
      const { warnings, markers } = checkBasicSyntax(pythonCode);
      setSyntaxWarnings(warnings);

      // Set markers in Monaco editor
      const model = editorInstance.getModel();
      if (model) {
        monacoInstance.editor.setModelMarkers(model, 'python-syntax', markers);
      }
    } else if (editorInstance && monacoInstance) {
      // Clear markers if no code
      const model = editorInstance.getModel();
      if (model) {
        monacoInstance.editor.setModelMarkers(model, 'python-syntax', []);
      }
      setSyntaxWarnings([]);
    }
  }, [pythonCode, editorInstance, monacoInstance]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 dark:text-white">
          {indicator ? 'Edit Indicator' : 'Create New Indicator'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="indicatorType" className="block text-sm font-medium mb-2 dark:text-white">
              Indicator Type <span className="text-red-500">*</span>
            </label>
            <select
              id="indicatorType"
              value={indicatorType}
              onChange={(e) => setIndicatorType(e.target.value as 'custom' | 'mytt_group')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading || !!indicator}
            >
              <option value="custom">Custom Python (Single Indicator)</option>
              <option value="mytt_group">MyTT Library Group (Multiple Indicators)</option>
            </select>
            {indicator && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Type cannot be changed after creation</p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium mb-2 dark:text-white">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., SMA_20"
              disabled={isLoading}
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="description" className="block text-sm font-medium mb-2 dark:text-white">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 20-day Simple Moving Average"
              rows={2}
              disabled={isLoading}
              required
            />
          </div>

          {/* External Datasets Selector */}
          <div className="mb-4 border dark:border-gray-600 rounded p-4 bg-gray-50 dark:bg-gray-700">
            <h3 className="font-medium mb-2 dark:text-white">External Datasets (Optional)</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Include additional datasets (e.g., market indices, reference stocks) in your indicator.
            </p>

            {/* Help Box */}
            <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded">
              <div className="flex items-start justify-between mb-1">
                <div className="text-xs font-medium text-blue-800 dark:text-blue-300">💡 How to use:</div>
                <button
                  type="button"
                  onClick={() => {
                    const template = `def calculate(data, parameters):
    """
    Indicator using external dataset.

    Args:
        data: pandas DataFrame with OHLC data
        parameters: Dict containing external datasets

    Returns:
        pandas Series with indicator values
    """
    import pandas as pd

    # Access external dataset (e.g., market index)
    # Replace 'index' with your parameter name
    index_data = parameters.get('index')

    if index_data is not None:
        # Merge with main data on date
        merged = data.merge(
            index_data[['date', 'close']],
            on='date',
            how='left',
            suffixes=('', '_index')
        )

        # Calculate relative strength indicator
        relative_strength = merged['close'] / merged['close_index']

        return relative_strength
    else:
        # Return zeros if external data not available
        return pd.Series([0] * len(data))`;
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
                <div>3. Select group and dataset (or &quot;All&quot; for all datasets)</div>
                <div>4. Single dataset: <code className="bg-blue-100 dark:bg-blue-800 px-1">data[&apos;param@col&apos;]</code> → value</div>
                <div>5. All datasets: <code className="bg-blue-100 dark:bg-blue-800 px-1">data[&apos;param@col&apos;]</code> → [val1, val2, ...]</div>
              </div>
            </div>

            {Object.entries(externalDatasets).map(([paramName, dataset]) => {
              const isEditing = editingDataset === paramName;
              const config = isEditing && tempDatasetConfig ? tempDatasetConfig : { paramName, ...dataset };
              const selectedGroup = groups.find(g => g.id === config.groupId);

              return (
                <div key={paramName} className="mb-3 p-3 border dark:border-gray-600 rounded bg-white dark:bg-gray-800">
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
                    className="w-full px-2 py-1 border dark:border-gray-600 rounded text-sm mb-2 bg-white dark:bg-gray-700 dark:text-white"
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
                        className="w-full px-2 py-1 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-white"
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
                        className="w-full px-2 py-1 border dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-white"
                        disabled={!isEditing || !config.groupId}
                      >
                        <option value="">Select dataset</option>
                        <option value="__all__">All (returns dict per column)</option>
                        {selectedGroup?.datasetNames.map((ds: string) => (
                          <option key={ds} value={ds}>{ds}</option>
                        ))}
                      </select>
                      {config.datasetName === '__all__' && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Access: data[&apos;{config.paramName}@col_name&apos;] returns [val1, val2, ...]
                        </p>
                      )}
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
              title="Add an external dataset to use in your indicator. Access columns via data['dataset_name@column_name']"
            >
              + Add External Dataset
            </button>
          </div>

          {indicatorType === 'custom' ? (
            <div className="mb-4">
              <label htmlFor="outputColumn" className="block text-sm font-medium mb-2 dark:text-white">
                Output Column Name
              </label>
              <input
                id="outputColumn"
                type="text"
                value={outputColumn}
                onChange={(e) => setOutputColumn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Auto-filled from name"
                disabled={isLoading}
              />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label htmlFor="groupName" className="block text-sm font-medium mb-2 dark:text-white">
                  Group Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="groupName"
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., MACD, KDJ, BOLL"
                  disabled={isLoading}
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 dark:text-white">
                  Expected Outputs <span className="text-red-500">*</span>
                </label>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  List the indicator names your calculate function will return in the dict
                </div>
                {expectedOutputs.map((output, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={output}
                      onChange={(e) => {
                        const newOutputs = [...expectedOutputs];
                        newOutputs[idx] = e.target.value;
                        setExpectedOutputs(newOutputs);
                      }}
                      placeholder={idx === 0 ? "e.g., DIF" : idx === 1 ? "e.g., DEA" : "e.g., MACD"}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isLoading}
                    />
                    {expectedOutputs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setExpectedOutputs(expectedOutputs.filter((_, i) => i !== idx))}
                        className="px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                        disabled={isLoading}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setExpectedOutputs([...expectedOutputs, ''])}
                  className="px-3 py-2 bg-gray-200 dark:bg-gray-600 dark:text-white rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-500"
                  disabled={isLoading}
                >
                  + Add Output
                </button>
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 dark:text-white">
              Python Code <span className="text-red-500">*</span>
            </label>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1 rounded ${
                  activeTab === 'text'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                }`}
              >
                Text Editor
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`px-3 py-1 rounded ${
                  activeTab === 'upload'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                }`}
              >
                Upload File
              </button>
              {indicatorType === 'custom' ? (
                <button
                  type="button"
                  onClick={handleInsertTemplate}
                  className="ml-auto px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Insert Template
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleInsertMyTTTemplate}
                  className="ml-auto px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Insert MyTT Template
                </button>
              )}
            </div>

            {activeTab === 'text' ? (
              <div className="relative">
                <div className="border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
                  <Editor
                    height="600px"
                    defaultLanguage="python"
                    value={pythonCode}
                    onChange={(value) => setPythonCode(value || '')}
                    onMount={(editor, monaco) => {
                      setEditorInstance(editor);
                      setMonacoInstance(monaco);
                    }}
                    theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                    options={{
                      minimap: { enabled: true },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 4,
                      insertSpaces: true,
                      wordWrap: 'off',
                      readOnly: isLoading,
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
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowSyntaxHelp(!showSyntaxHelp)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
                  >
                    {showSyntaxHelp ? '▼ Hide' : '▶ Show'} Python Syntax Help
                  </button>

                  {showSyntaxHelp && (
                    <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded text-xs space-y-2 dark:text-blue-200">
                      <div>
                        <strong>Available in namespace:</strong>
                        <code className="block mt-1 bg-white dark:bg-gray-800 p-1 rounded dark:text-gray-200">pd (pandas), np (numpy), data (DataFrame), MyTT (library)</code>
                      </div>
                      <div>
                        <strong>Data columns:</strong>
                        <code className="block mt-1 bg-white dark:bg-gray-800 p-1 rounded dark:text-gray-200">date, open, high, low, close, volume, turnover, amplitude, change_pct, etc.</code>
                      </div>
                      <div>
                        <strong>Single indicator return:</strong>
                        <code className="block mt-1 bg-white dark:bg-gray-800 p-1 rounded dark:text-gray-200">return data['close'].rolling(20).mean()</code>
                      </div>
                      <div>
                        <strong>Group indicator return:</strong>
                        <code className="block mt-1 bg-white dark:bg-gray-800 p-1 rounded dark:text-gray-200">return {'{'}  'DIF': dif_values, 'DEA': dea_values {'}'}</code>
                      </div>
                      <div>
                        <strong>Common functions:</strong>
                        <code className="block mt-1 bg-white dark:bg-gray-800 p-1 rounded dark:text-gray-200">rolling(), shift(), diff(), mean(), std(), min(), max()</code>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded p-4 text-center">
                <input
                  type="file"
                  accept=".py"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  Click to upload .py file
                </label>
                {pythonCode && (
                  <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                    ✓ File uploaded. Switch to Text Editor tab to view.
                  </p>
                )}
              </div>
            )}
          </div>

          {syntaxWarnings.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-600 text-yellow-800 dark:text-yellow-400 rounded text-sm">
              <div className="font-semibold mb-1">⚠️ Syntax Warnings:</div>
              <ul className="list-disc list-inside space-y-1">
                {syntaxWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded text-sm">
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
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-600 rounded font-mono text-xs">
                  Code: {errorDetails.details.code_line}
                </div>
              )}
              {errorDetails?.details?.hints && errorDetails.details.hints.length > 0 && (
                <div className="mt-2 space-y-1">
                  {errorDetails.details.hints.map((hint: string, i: number) => (
                    <div key={i} className="text-xs text-blue-700 dark:text-blue-400">
                      💡 {hint}
                    </div>
                  ))}
                </div>
              )}
              {errorDetails?.details?.traceback && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-xs">
                    Show full error details
                  </summary>
                  <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded overflow-x-auto max-h-40 text-xs dark:text-gray-200">
                    {errorDetails.details.traceback}
                  </pre>
                </details>
              )}
            </div>
          )}

          {validationMessage && (
            <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 rounded text-sm">
              {validationMessage}
            </div>
          )}

          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={handleValidate}
              disabled={isValidating || !pythonCode}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {isValidating ? 'Validating...' : 'Validate Code'}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !name || !description || !pythonCode}
                className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : indicator ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Orphaned Columns Confirmation Modal */}
      {showOrphanedColumnsModal && orphanedColumnsData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-orange-600 dark:text-orange-400 mb-4 flex items-center gap-2">
                <span>⚠️</span> Orphaned Columns Detected
              </h3>

              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                The following columns exist in your CSV files but don&apos;t correspond to any defined indicator:
              </p>

              <div className="bg-gray-50 dark:bg-gray-700 rounded p-3 mb-4 max-h-32 overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {orphanedColumnsData.orphanedColumns.map((col, idx) => (
                    <span key={idx} className="px-2 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300 text-xs rounded">
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {orphanedColumnsData.dependentIndicators.length > 0 && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                    The following indicators depend on these orphaned columns and will also be deleted:
                  </p>
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-3 mb-4 max-h-40 overflow-y-auto">
                    {orphanedColumnsData.dependentIndicators.map(({ column, indicators }, idx) => (
                      <div key={idx} className="mb-2 last:mb-0">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Column: <span className="font-mono text-red-600 dark:text-red-400">{column}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {indicators.map((ind, indIdx) => (
                            <span key={indIdx} className="px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-xs rounded">
                              {ind.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Do you want to remove these orphaned columns from all datasets?
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelOrphanedCleanup}
                  disabled={isCleaningOrphans}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCleanupOrphanedColumns}
                  disabled={isCleaningOrphans}
                  className="px-4 py-2 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                >
                  {isCleaningOrphans ? 'Cleaning...' : 'Continue & Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Column Rename Auto-Fix Modal */}
      {showColumnRenameModal && columnRenameData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-2">
                <span>🔄</span> Column Name Change Detected
              </h3>

              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                You are changing column names that are used by other indicators. Do you want to automatically update their code?
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-3 mb-4 max-h-60 overflow-y-auto">
                {columnRenameData.columnRenames.map(({ column, newColumn, indicators }, idx) => (
                  <div key={idx} className="mb-3 last:mb-0">
                    <div className="text-sm mb-2">
                      <span className="font-mono text-red-600 dark:text-red-400 line-through">{column}</span>
                      <span className="mx-2 text-gray-500">→</span>
                      <span className="font-mono text-green-600 dark:text-green-400">{newColumn}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Used by:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {indicators.map((ind, indIdx) => (
                        <span key={indIdx} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs rounded">
                          {ind.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Click &quot;Auto-Fix&quot; to update all references in the dependent indicators&apos; code automatically.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelColumnRename}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAutoFixColumnRename}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Updating...' : 'Auto-Fix & Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
