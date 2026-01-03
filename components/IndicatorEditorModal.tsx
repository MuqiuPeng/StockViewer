'use client';

import { useState, useEffect } from 'react';

interface Indicator {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  outputColumn: string;
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

export default function IndicatorEditorModal({
  isOpen,
  onClose,
  onSuccess,
  indicator,
}: IndicatorEditorModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [outputColumn, setOutputColumn] = useState('');
  const [pythonCode, setPythonCode] = useState('');
  const [activeTab, setActiveTab] = useState<'text' | 'upload'>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (indicator) {
      setName(indicator.name);
      setDescription(indicator.description);
      setOutputColumn(indicator.outputColumn);
      setPythonCode(indicator.pythonCode);
    } else {
      setName('');
      setDescription('');
      setOutputColumn('');
      setPythonCode('');
    }
    setError(null);
    setValidationMessage(null);
  }, [indicator, isOpen]);

  // Auto-fill output column from name
  useEffect(() => {
    if (!indicator && name && !outputColumn) {
      setOutputColumn(name.replace(/\s+/g, '_'));
    }
  }, [name, indicator, outputColumn]);

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
        body: JSON.stringify({ pythonCode }),
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

    setIsLoading(true);

    try {
      const url = indicator
        ? `/api/indicators/${indicator.id}`
        : '/api/indicators';
      const method = indicator ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          pythonCode,
          outputColumn: outputColumn || name,
        }),
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          {indicator ? 'Edit Indicator' : 'Create New Indicator'}
        </h2>

        <form onSubmit={handleSubmit}>
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
              <button
                type="button"
                onClick={handleInsertTemplate}
                className="ml-auto px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Insert Template
              </button>
            </div>

            {activeTab === 'text' ? (
              <textarea
                value={pythonCode}
                onChange={(e) => setPythonCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={12}
                placeholder="def calculate(data):&#10;    return data['close'].rolling(20).mean()"
                disabled={isLoading}
                required
              />
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
