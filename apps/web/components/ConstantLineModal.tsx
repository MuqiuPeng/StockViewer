'use client';

import { useState, useEffect } from 'react';

interface ConstantLine {
  value: number;
  color: string;
  label: string;
}

interface ConstantLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  lines: ConstantLine[];
  onSave: (lines: ConstantLine[]) => void;
}

export default function ConstantLineModal({
  isOpen,
  onClose,
  chartTitle,
  lines,
  onSave,
}: ConstantLineModalProps) {
  const [localLines, setLocalLines] = useState<ConstantLine[]>(lines);
  const [newValue, setNewValue] = useState<string>('');
  const [newLabel, setNewLabel] = useState<string>('');

  useEffect(() => {
    setLocalLines(lines);
  }, [lines, isOpen]);

  const handleAddLine = () => {
    const value = parseFloat(newValue);
    if (isNaN(value)) {
      alert('Please enter a valid number');
      return;
    }

    setLocalLines([...localLines, {
      value,
      color: '#808080', // Always gray
      label: newLabel,
    }]);

    setNewValue('');
    setNewLabel('');
  };

  const handleRemoveLine = (index: number) => {
    setLocalLines(localLines.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(localLines);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold dark:text-white">{chartTitle} - Constant Lines</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Add New Line */}
          <div className="mb-6 border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700">
            <h3 className="text-lg font-semibold mb-3 dark:text-white">Add New Line</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1 dark:text-white">Value</label>
                <input
                  type="number"
                  step="any"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Enter value"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAddLine}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-sm font-medium mb-1 dark:text-white">Label (optional)</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Enter label"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          {/* Existing Lines */}
          <div>
            <h3 className="text-lg font-semibold mb-3 dark:text-white">Existing Lines ({localLines.length})</h3>
            {localLines.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No lines added yet</p>
            ) : (
              <div className="space-y-2">
                {localLines.map((line, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div>
                        <div className="font-medium dark:text-white">
                          Value: <span className="text-blue-600 dark:text-blue-400">{line.value}</span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{line.label}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveLine(index)}
                      className="px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
}
