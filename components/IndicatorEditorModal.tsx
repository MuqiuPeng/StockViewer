'use client';

import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

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
  onSuccess: () => void;
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
  const [indicatorType, setIndicatorType] = useState<'custom' | 'mytt_group'>('custom');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [outputColumn, setOutputColumn] = useState('');
  const [groupName, setGroupName] = useState('');
  const [expectedOutputs, setExpectedOutputs] = useState<string[]>(['']);
  const [pythonCode, setPythonCode] = useState('');
  const [externalDatasets, setExternalDatasets] = useState<Record<string, { groupId: string; datasetName: string }>>({});
  const [groups, setGroups] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'text' | 'upload'>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [syntaxWarnings, setSyntaxWarnings] = useState<string[]>([]);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);

  // Load groups on mount
  useEffect(() => {
    if (isOpen) {
      fetch('/api/groups')
        .then((res) => res.json())
        .then((data) => {
          if (data.groups) {
            setGroups(data.groups);
          }
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
      const response = await fetch('/api/validate-indicator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pythonCode,
          isGroup: indicatorType === 'mytt_group'
        }),
      });

      const data = await response.json();

      if (data.valid) {
        setValidationMessage('✓ Code is valid!');
      } else {
        setError(data.error || 'Validation failed');
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

      if (Object.keys(validExternalDatasets).length > 0) {
        requestBody.externalDatasets = validExternalDatasets;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to save indicator');
        setIsLoading(false);
        return;
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setIsLoading(false);
    }
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

      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          {indicator ? 'Edit Indicator' : 'Create New Indicator'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="indicatorType" className="block text-sm font-medium mb-2">
              Indicator Type <span className="text-red-500">*</span>
            </label>
            <select
              id="indicatorType"
              value={indicatorType}
              onChange={(e) => setIndicatorType(e.target.value as 'custom' | 'mytt_group')}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading || !!indicator}
            >
              <option value="custom">Custom Python (Single Indicator)</option>
              <option value="mytt_group">MyTT Library Group (Multiple Indicators)</option>
            </select>
            {indicator && (
              <p className="text-xs text-gray-500 mt-1">Type cannot be changed after creation</p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., SMA_20"
              disabled={isLoading}
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="description" className="block text-sm font-medium mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 20-day Simple Moving Average"
              rows={2}
              disabled={isLoading}
              required
            />
          </div>

          {/* External Datasets Selector */}
          <div className="mb-4 border rounded p-4 bg-gray-50">
            <h3 className="font-medium mb-2">External Datasets (Optional)</h3>
            <p className="text-xs text-gray-500 mb-3">
              Include additional datasets (e.g., market indices, reference stocks) in your indicator.
            </p>

            {/* Help Box */}
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
              <div className="flex items-start justify-between mb-1">
                <div className="text-xs font-medium text-blue-800">💡 How to use:</div>
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
              <div className="text-xs text-blue-700 space-y-1">
                <div>1. Click &quot;+ Add External Dataset&quot; below</div>
                <div>2. Choose a parameter name (e.g., <code className="bg-blue-100 px-1">index</code>)</div>
                <div>3. Select group and dataset</div>
                <div>4. Click &quot;Insert Template&quot; to see example code</div>
              </div>
            </div>

            {Object.entries(externalDatasets).map(([paramName, dataset]) => {
              const selectedGroup = groups.find(g => g.id === dataset.groupId);
              return (
                <div key={paramName} className="mb-3 p-3 border rounded bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Parameter Name:</label>
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
                  </div>
                  <input
                    type="text"
                    value={paramName}
                    onChange={(e) => {
                      const newName = e.target.value;
                      if (newName && newName !== paramName) {
                        const updated = { ...externalDatasets };
                        updated[newName] = updated[paramName];
                        delete updated[paramName];
                        setExternalDatasets(updated);
                      }
                    }}
                    className="w-full px-2 py-1 border rounded text-sm mb-2"
                    placeholder="e.g., index_data"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600">Group:</label>
                      <select
                        value={dataset.groupId}
                        onChange={(e) => {
                          setExternalDatasets({
                            ...externalDatasets,
                            [paramName]: { ...dataset, groupId: e.target.value, datasetName: '' }
                          });
                        }}
                        className="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value="">Select group</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Dataset:</label>
                      <select
                        value={dataset.datasetName}
                        onChange={(e) => {
                          setExternalDatasets({
                            ...externalDatasets,
                            [paramName]: { ...dataset, datasetName: e.target.value }
                          });
                        }}
                        className="w-full px-2 py-1 border rounded text-sm"
                        disabled={!dataset.groupId}
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
                setExternalDatasets({
                  ...externalDatasets,
                  [newName]: { groupId: '', datasetName: '' }
                });
              }}
              className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              title="Add an external dataset to use in your indicator. Access it via parameters['your_parameter_name'] in your code. Example: index_data = parameters['index']"
            >
              + Add External Dataset
            </button>
          </div>

          {indicatorType === 'custom' ? (
            <div className="mb-4">
              <label htmlFor="outputColumn" className="block text-sm font-medium mb-2">
                Output Column Name
              </label>
              <input
                id="outputColumn"
                type="text"
                value={outputColumn}
                onChange={(e) => setOutputColumn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Auto-filled from name"
                disabled={isLoading}
              />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label htmlFor="groupName" className="block text-sm font-medium mb-2">
                  Group Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="groupName"
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., MACD, KDJ, BOLL"
                  disabled={isLoading}
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Expected Outputs <span className="text-red-500">*</span>
                </label>
                <div className="text-xs text-gray-500 mb-2">
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
                      className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="px-3 py-2 bg-gray-200 rounded text-sm hover:bg-gray-300"
                  disabled={isLoading}
                >
                  + Add Output
                </button>
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Python Code <span className="text-red-500">*</span>
            </label>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`px-3 py-1 rounded ${
                  activeTab === 'text'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700'
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
                    : 'bg-gray-200 text-gray-700'
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
                <div className="border border-gray-300 rounded overflow-hidden">
                  <Editor
                    height="600px"
                    defaultLanguage="python"
                    value={pythonCode}
                    onChange={(value) => setPythonCode(value || '')}
                    onMount={(editor, monaco) => {
                      setEditorInstance(editor);
                      setMonacoInstance(monaco);
                    }}
                    theme="vs-light"
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
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                  >
                    {showSyntaxHelp ? '▼ Hide' : '▶ Show'} Python Syntax Help
                  </button>

                  {showSyntaxHelp && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-xs space-y-2">
                      <div>
                        <strong>Available in namespace:</strong>
                        <code className="block mt-1 bg-white p-1 rounded">pd (pandas), np (numpy), data (DataFrame), MyTT (library)</code>
                      </div>
                      <div>
                        <strong>Data columns:</strong>
                        <code className="block mt-1 bg-white p-1 rounded">date, open, high, low, close, volume, turnover, amplitude, change_pct, etc.</code>
                      </div>
                      <div>
                        <strong>Single indicator return:</strong>
                        <code className="block mt-1 bg-white p-1 rounded">return data['close'].rolling(20).mean()</code>
                      </div>
                      <div>
                        <strong>Group indicator return:</strong>
                        <code className="block mt-1 bg-white p-1 rounded">return {'{'}  'DIF': dif_values, 'DEA': dea_values {'}'}</code>
                      </div>
                      <div>
                        <strong>Common functions:</strong>
                        <code className="block mt-1 bg-white p-1 rounded">rolling(), shift(), diff(), mean(), std(), min(), max()</code>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded p-4 text-center">
                <input
                  type="file"
                  accept=".py"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer text-blue-600 hover:text-blue-700"
                >
                  Click to upload .py file
                </label>
                {pythonCode && (
                  <p className="mt-2 text-sm text-green-600">
                    ✓ File uploaded. Switch to Text Editor tab to view.
                  </p>
                )}
              </div>
            )}
          </div>

          {syntaxWarnings.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded text-sm">
              <div className="font-semibold mb-1">⚠️ Syntax Warnings:</div>
              <ul className="list-disc list-inside space-y-1">
                {syntaxWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          {validationMessage && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded text-sm">
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
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
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
    </div>
  );
}
