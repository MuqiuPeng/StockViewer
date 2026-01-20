'use client';

import { useState, useRef, useCallback } from 'react';

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ParseResult {
  success: boolean;
  rowCount: number;
  columns: string[];
  detectedColumns: {
    date: string | null;
    open: string | null;
    high: string | null;
    low: string | null;
    close: string | null;
    volume: string | null;
  };
  errors: string[];
  warnings: string[];
  preview: Record<string, string>[];
}

const REQUIRED_COLUMNS = ['date', 'open', 'high', 'low', 'close', 'volume'];
const COLUMN_ALIASES: Record<string, string[]> = {
  date: ['date', 'time', 'datetime', 'trade_date', '日期', 'tradedate'],
  open: ['open', 'open_price', '开盘', 'openprice'],
  high: ['high', 'high_price', '最高', 'highprice'],
  low: ['low', 'low_price', '最低', 'lowprice'],
  close: ['close', 'close_price', '收盘', 'closeprice'],
  volume: ['volume', 'vol', '成交量'],
};

export default function CsvUploadModal({
  isOpen,
  onClose,
  onSuccess,
}: CsvUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setParseResult(null);
    setSymbol('');
    setName('');
    setDescription('');
    setError(null);
  }, []);

  const parseCSV = useCallback((content: string): ParseResult => {
    const lines = content.trim().split('\n');
    const errors: string[] = [];
    const warnings: string[] = [];

    if (lines.length < 2) {
      return {
        success: false,
        rowCount: 0,
        columns: [],
        detectedColumns: { date: null, open: null, high: null, low: null, close: null, volume: null },
        errors: ['CSV must have at least a header row and one data row'],
        warnings: [],
        preview: [],
      };
    }

    // Parse header
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));

    // Detect column mapping
    const detectedColumns: Record<string, string | null> = {
      date: null,
      open: null,
      high: null,
      low: null,
      close: null,
      volume: null,
    };

    for (const [standardCol, aliases] of Object.entries(COLUMN_ALIASES)) {
      for (const alias of aliases) {
        const idx = header.findIndex((h) => h === alias);
        if (idx !== -1) {
          detectedColumns[standardCol] = header[idx];
          break;
        }
      }
    }

    // Check required columns
    const missingColumns = REQUIRED_COLUMNS.filter((col) => !detectedColumns[col]);
    if (missingColumns.length > 0) {
      errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    // Check for extra columns
    const mappedColumns = Object.values(detectedColumns).filter(Boolean);
    const unmappedColumns = header.filter((h) => !mappedColumns.includes(h));
    if (unmappedColumns.length > 0) {
      warnings.push(`Extra columns will be ignored: ${unmappedColumns.join(', ')}`);
    }

    // Parse preview rows (first 5)
    const preview: Record<string, string>[] = [];
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));
      const row: Record<string, string> = {};
      header.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      preview.push(row);
    }

    return {
      success: errors.length === 0,
      rowCount: lines.length - 1,
      columns: header,
      detectedColumns: detectedColumns as ParseResult['detectedColumns'],
      errors,
      warnings,
      preview,
    };
  }, []);

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      setError(null);

      if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
        setError('File must be a CSV file');
        return;
      }

      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit');
        return;
      }

      setFile(selectedFile);

      // Read and parse
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const result = parseCSV(content);
        setParseResult(result);
      };
      reader.onerror = () => {
        setError('Failed to read file');
      };
      reader.readAsText(selectedFile);
    },
    [parseCSV]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleSubmit = async () => {
    if (!file || !parseResult?.success) return;

    if (!symbol.trim()) {
      setError('Symbol is required');
      return;
    }

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('symbol', symbol.trim());
      formData.append('name', name.trim());
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      const response = await fetch('/api/tickets/custom-data', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      // Success
      alert('Upload submitted successfully! Your data will be available after admin approval.');
      resetState();
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Upload Custom Dataset
        </h2>

        {/* File Drop Zone */}
        {!file && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
              className="hidden"
            />
            <div className="text-gray-500 dark:text-gray-400">
              <svg
                className="mx-auto h-12 w-12 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-sm">
                Drag and drop a CSV file here, or click to select
              </p>
              <p className="text-xs mt-1 text-gray-400">
                Maximum file size: 10MB
              </p>
            </div>
          </div>
        )}

        {/* File Selected */}
        {file && parseResult && (
          <>
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {file.name}
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setParseResult(null);
                  }}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {(file.size / 1024).toFixed(1)} KB | {parseResult.rowCount} rows
              </div>
            </div>

            {/* Column Detection */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                Column Detection
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {REQUIRED_COLUMNS.map((col) => (
                  <div
                    key={col}
                    className={`px-3 py-2 rounded text-sm ${
                      parseResult.detectedColumns[col as keyof typeof parseResult.detectedColumns]
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                    }`}
                  >
                    <span className="font-medium">{col}:</span>{' '}
                    {parseResult.detectedColumns[col as keyof typeof parseResult.detectedColumns] || 'Not found'}
                  </div>
                ))}
              </div>
            </div>

            {/* Errors */}
            {parseResult.errors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 rounded">
                {parseResult.errors.map((err, i) => (
                  <div key={i} className="text-sm text-red-600 dark:text-red-400">
                    {err}
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {parseResult.warnings.length > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded">
                {parseResult.warnings.map((warn, i) => (
                  <div key={i} className="text-sm text-yellow-600 dark:text-yellow-400">
                    {warn}
                  </div>
                ))}
              </div>
            )}

            {/* Preview */}
            {parseResult.preview.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Data Preview (first 5 rows)
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700">
                        {parseResult.columns.slice(0, 8).map((col) => (
                          <th key={col} className="px-2 py-1 text-left">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.preview.map((row, i) => (
                        <tr key={i} className="border-t border-gray-200 dark:border-gray-600">
                          {parseResult.columns.slice(0, 8).map((col) => (
                            <td key={col} className="px-2 py-1 text-gray-600 dark:text-gray-300">
                              {row[col]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Form Fields */}
            {parseResult.success && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Symbol *
                  </label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g., AAPL"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Apple Inc."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of this dataset"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded text-sm">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !file || !parseResult?.success}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Uploading...' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}
