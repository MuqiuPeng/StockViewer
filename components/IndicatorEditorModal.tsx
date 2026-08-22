'use client';

import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from './ThemeProvider';
import {
  wrapCodeBody,
  extractCodeBody,
} from './editor/placeholder-utils';
import type { Period } from './editor/types';

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
  period?: Period;
  category?: string;
  tags?: string[];
}

interface IndicatorEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedItem?: Indicator, type?: 'indicator') => void;
  indicator?: Indicator | null;
  readOnly?: boolean;
}

// Templates - use direct data['column'] format
const CODE_TEMPLATE = `# Example: 20-day Simple Moving Average
return data['close'].rolling(20).mean()`;

const MYTT_TEMPLATE = `# Example: MACD indicator group
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
  readOnly = false,
}: IndicatorEditorModalProps) {
  const { theme } = useTheme();
  const [indicatorType, setIndicatorType] = useState<'scalar' | 'vector'>('scalar');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [outputColumn, setOutputColumn] = useState('');
  const [groupName, setGroupName] = useState('');
  const [expectedOutputs, setExpectedOutputs] = useState<string[]>(['']);
  const [pythonCode, setPythonCode] = useState('');
  const [externalDatasets, setExternalDatasets] = useState<Record<string, { groupId: string; datasetName: string }>>({});
  const [period, setPeriod] = useState<Period>('daily');
  const [category, setCategory] = useState(indicator?.category || '');
  const [tagsInput, setTagsInput] = useState((indicator?.tags || []).join(', '));
  const [activeTab, setActiveTab] = useState<'text' | 'upload'>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [syntaxWarnings, setSyntaxWarnings] = useState<string[]>([]);
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
    pendingSubmit: any;
  } | null>(null);

  // Track if outputColumn was manually edited by user
  const [outputColumnManuallyEdited, setOutputColumnManuallyEdited] = useState(false);

  // Initialize form when indicator changes
  useEffect(() => {
    if (indicator) {
      setIndicatorType(indicator.isGroup ? 'vector' : 'scalar');
      setName(indicator.name);
      setDescription(indicator.description);
      setOutputColumn(indicator.outputColumn);
      setGroupName(indicator.groupName || '');
      setExpectedOutputs(indicator.expectedOutputs || ['']);
      setPythonCode(extractCodeBody(indicator.pythonCode));
      setExternalDatasets(indicator.externalDatasets || {});
      setPeriod(indicator.period || 'daily');
      setCategory(indicator.category || '');
      setTagsInput((indicator.tags || []).join(', '));
    } else {
      setIndicatorType('scalar');
      setName('');
      setDescription('');
      setOutputColumn('');
      setGroupName('');
      setExpectedOutputs(['']);
      setPythonCode('');
      setExternalDatasets({});
      setPeriod('daily');
      setCategory('');
      setTagsInput('');
    }
    setError(null);
    setValidationMessage(null);
    setIsLoading(false);
    setIsValidating(false);
    setOutputColumnManuallyEdited(!!indicator);
  }, [indicator, isOpen]);

  // Auto-fill output column / groupName from name
  useEffect(() => {
    if (name) {
      const normalized = name.replace(/\s+/g, '_');
      if (indicatorType === 'vector') {
        if (!indicator || !outputColumnManuallyEdited) {
          setGroupName(normalized);
        }
      } else if (indicatorType === 'scalar') {
        if (!outputColumnManuallyEdited) {
          setOutputColumn(normalized);
        }
      }
    }
  }, [name, indicatorType, outputColumnManuallyEdited]);

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
      const validExternalDatasets = Object.fromEntries(
        Object.entries(externalDatasets).filter(
          ([_, dataset]) => dataset.groupId && dataset.datasetName
        )
      );

      const codeToValidate = wrapCodeBody(pythonCode);

      const requestBody: any = {
        pythonCode: codeToValidate,
        isGroup: indicatorType === 'vector'
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
        setValidationMessage('Code is valid!');
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

    if (!name || !pythonCode) {
      setError('Please fill in all required fields');
      return;
    }

    if (indicatorType === 'vector') {
      if (!groupName) {
        setError('Group name is required for vector indicators');
        return;
      }
      const filteredOutputs = expectedOutputs.filter(o => o.trim() !== '');
      if (filteredOutputs.length === 0) {
        setError('At least one expected output is required for vector indicators');
        return;
      }
    }

    setIsLoading(true);

    try {
      const url = indicator
        ? `/api/indicators/${indicator.id}`
        : '/api/indicators';
      const method = indicator ? 'PUT' : 'POST';

      const codeToSave = wrapCodeBody(pythonCode);

      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const requestBody: any = {
        name,
        description,
        pythonCode: codeToSave,
        period,
        category: category || null,
        tags,
      };

      if (indicatorType === 'vector') {
        requestBody.isGroup = true;
        requestBody.groupName = groupName;
        requestBody.expectedOutputs = expectedOutputs.filter(o => o.trim() !== '');
      } else {
        requestBody.isGroup = false;
        requestBody.outputColumn = outputColumn || name;
      }

      const validExternalDatasets = Object.fromEntries(
        Object.entries(externalDatasets).filter(
          ([_, dataset]) => dataset.groupId && dataset.datasetName
        )
      );

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
        if (data.error === 'Column rename affects dependent indicators' && data.requiresAutoFix) {
          setColumnRenameData({
            columnRenames: data.columnRenames,
            pendingSubmit: requestBody,
          });
          setShowColumnRenameModal(true);
          setIsLoading(false);
          return;
        }

        if (data.error === 'Columns have dependent indicators' && data.dependentColumns) {
          const dependentInfo = data.dependentColumns as { column: string; indicators: { id: string; name: string }[] }[];
          const lines = dependentInfo.map(({ column, indicators }) => {
            const indicatorNames = indicators.map(ind => ind.name).join(', ');
            return `  ${column} is used by: ${indicatorNames}`;
          });

          const confirmMessage = `The following columns are used by other indicators:\n${lines.join('\n')}\n\nDo you want to remove them anyway?`;

          if (confirm(confirmMessage)) {
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
      checkForOrphanedColumns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setIsLoading(false);
    }
  };

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

  const handleCleanupOrphanedColumns = async () => {
    if (!orphanedColumnsData) return;
    setIsCleaningOrphans(true);
    try {
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
        setShowOrphanedColumnsModal(false);
        setOrphanedColumnsData(null);
        onSuccess();
      } else {
        setError(data.message || 'Failed to cleanup orphaned columns');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cleaning up orphaned columns');
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  const handleCancelOrphanedCleanup = () => {
    setShowOrphanedColumnsModal(false);
    setOrphanedColumnsData(null);
  };

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
      checkForOrphanedColumns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setIsLoading(false);
      setShowColumnRenameModal(false);
      setColumnRenameData(null);
    }
  };

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

  // Basic syntax checking
  const checkBasicSyntax = (code: string) => {
    const warnings: string[] = [];
    const markers: any[] = [];

    if (!code.trim()) {
      return { warnings, markers };
    }

    const lines = code.split('\n');

    const hasReturn = code.includes('return');
    if (!hasReturn) {
      warnings.push('Missing return statement');
      const lastLine = lines.length;
      markers.push({
        severity: 4,
        startLineNumber: lastLine, startColumn: 1,
        endLineNumber: lastLine, endColumn: lines[lastLine - 1]?.length || 1,
        message: 'Missing return statement'
      });
    }

    const openParen = (code.match(/\(/g) || []).length;
    const closeParen = (code.match(/\)/g) || []).length;
    if (openParen !== closeParen) {
      const msg = `Unbalanced parentheses: ${openParen} open, ${closeParen} close`;
      warnings.push(msg);
      let balance = 0;
      let errorLine = 1;
      for (let i = 0; i < lines.length; i++) {
        balance += (lines[i].match(/\(/g) || []).length;
        balance -= (lines[i].match(/\)/g) || []).length;
        if (balance < 0) { errorLine = i + 1; break; }
      }
      markers.push({
        severity: 8,
        startLineNumber: errorLine, startColumn: 1,
        endLineNumber: errorLine, endColumn: lines[errorLine - 1]?.length || 1,
        message: msg
      });
    }

    const openBracket = (code.match(/\[/g) || []).length;
    const closeBracket = (code.match(/\]/g) || []).length;
    if (openBracket !== closeBracket) {
      const msg = `Unbalanced brackets: ${openBracket} open, ${closeBracket} close`;
      warnings.push(msg);
      markers.push({ severity: 8, startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 100, message: msg });
    }

    const openBrace = (code.match(/\{/g) || []).length;
    const closeBrace = (code.match(/\}/g) || []).length;
    if (openBrace !== closeBrace) {
      const msg = `Unbalanced braces: ${openBrace} open, ${closeBrace} close`;
      warnings.push(msg);
      markers.push({ severity: 8, startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 100, message: msg });
    }

    return { warnings, markers };
  };

  // Check syntax when code changes
  useEffect(() => {
    if (pythonCode && editorInstance && monacoInstance) {
      const { warnings, markers } = checkBasicSyntax(pythonCode);
      setSyntaxWarnings(warnings);
      const model = editorInstance.getModel();
      if (model) {
        monacoInstance.editor.setModelMarkers(model, 'python-syntax', markers);
      }
    } else if (editorInstance && monacoInstance) {
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

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[80vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold dark:text-white">
            {readOnly ? 'View Indicator' : (indicator ? 'Edit Indicator' : 'Create New Indicator')}
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
                disabled={isLoading || !name || !pythonCode}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : indicator ? 'Update' : 'Create'}
              </button>
            )}
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mx-4 mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded text-sm flex-shrink-0">
            {error}
          </div>
        )}
        {validationMessage && (
          <div className="mx-4 mt-2 p-2 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-400 rounded text-sm flex-shrink-0">
            {validationMessage}
          </div>
        )}

        {/* Main Content - Two Columns (Settings + Editor) */}
        <div className="flex flex-1 overflow-hidden p-4 gap-4">
          {/* Left Panel - Settings */}
          <div className="w-64 flex-shrink-0 overflow-y-auto space-y-3">
            {/* Type */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Type</label>
              <select
                value={indicatorType}
                onChange={(e) => setIndicatorType(e.target.value as 'scalar' | 'vector')}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                disabled={isLoading || !!indicator}
              >
                <option value="scalar">Scalar</option>
                <option value="vector">Vector</option>
              </select>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                {indicatorType === 'scalar' ? 'Single output value' : 'Multiple output values'}
              </p>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                placeholder="e.g., SMA_20"
                disabled={isLoading || readOnly}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                placeholder="Brief description"
                rows={2}
                disabled={isLoading || readOnly}
              />
            </div>

            {/* Period */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                disabled={isLoading || readOnly}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="indicator-categories"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                placeholder="e.g., Trend, Oscillator"
                disabled={isLoading || readOnly}
              />
              <datalist id="indicator-categories">
                <option value="Trend" />
                <option value="Oscillator" />
                <option value="Volume" />
                <option value="Momentum" />
                <option value="Volatility" />
              </datalist>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-white">Tags</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                placeholder="Comma-separated tags"
                disabled={isLoading || readOnly}
              />
            </div>

            {/* Output Settings */}
            {indicatorType === 'scalar' ? (
              <div>
                <label className="block text-xs font-medium mb-1 dark:text-white">Output Column</label>
                <input
                  type="text"
                  value={outputColumn}
                  onChange={(e) => {
                    setOutputColumn(e.target.value);
                    setOutputColumnManuallyEdited(true);
                  }}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="Auto from name"
                  disabled={isLoading || readOnly}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1 dark:text-white">Group Name *</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                    placeholder="e.g., MACD"
                    disabled={isLoading || readOnly}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 dark:text-white">Expected Outputs *</label>
                  {expectedOutputs.map((output, idx) => (
                    <div key={idx} className="flex gap-1 mb-1">
                      <input
                        type="text"
                        value={output}
                        onChange={(e) => {
                          const newOutputs = [...expectedOutputs];
                          newOutputs[idx] = e.target.value;
                          setExpectedOutputs(newOutputs);
                        }}
                        placeholder={`Output ${idx + 1}`}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                        disabled={isLoading || readOnly}
                      />
                      {expectedOutputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setExpectedOutputs(expectedOutputs.filter((_, i) => i !== idx))}
                          className="px-2 text-red-500 hover:text-red-700"
                          disabled={isLoading || readOnly}
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setExpectedOutputs([...expectedOutputs, ''])}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    disabled={isLoading || readOnly}
                  >
                    + Add Output
                  </button>
                </div>
              </>
            )}

            {/* Template Button */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              {indicatorType === 'scalar' ? (
                <button
                  type="button"
                  onClick={handleInsertTemplate}
                  className="w-full px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Insert Template
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleInsertMyTTTemplate}
                  className="w-full px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Insert MyTT Template
                </button>
              )}
            </div>

            {/* Hint */}
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
              Use <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{"data['close']"}</span> format for data references
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
                onMount={(editor, monaco) => {
                  setEditorInstance(editor);
                  setMonacoInstance(monaco);
                }}
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

        </div>
      </div>

      {/* Orphaned Columns Confirmation Modal */}
      {showOrphanedColumnsModal && orphanedColumnsData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-orange-600 dark:text-orange-400 mb-4">
                Orphaned Columns Detected
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
              <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-4">
                Column Name Change Detected
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                You are changing column names that are used by other indicators. Do you want to automatically update their code?
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-3 mb-4 max-h-60 overflow-y-auto">
                {columnRenameData.columnRenames.map(({ column, newColumn, indicators }, idx) => (
                  <div key={idx} className="mb-3 last:mb-0">
                    <div className="text-sm mb-2">
                      <span className="font-mono text-red-600 dark:text-red-400 line-through">{column}</span>
                      <span className="mx-2 text-gray-500">&rarr;</span>
                      <span className="font-mono text-green-600 dark:text-green-400">{newColumn}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Used by:</div>
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
                  disabled={isLoading || readOnly}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAutoFixColumnRename}
                  disabled={isLoading || readOnly}
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
