'use client';

import { useState, useEffect } from 'react';
import { BacktestHistoryEntry } from '@/lib/backtest-history-storage';

interface BacktestHistoryDetailModalProps {
  entry: BacktestHistoryEntry | null;
  onClose: () => void;
  onRerun: (entry: BacktestHistoryEntry) => void;
  onViewResults: (entry: BacktestHistoryEntry) => void;
}

export default function BacktestHistoryDetailModal({
  entry,
  onClose,
  onRerun,
  onViewResults,
}: BacktestHistoryDetailModalProps) {
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) {
      setNotes(entry.notes || '');
      setTags(entry.tags || []);
    }
    setNewTag('');
  }, [entry]);

  if (!entry) return null;

  async function handleSave() {
    if (!entry) return;
    setSaving(true);
    try {
      await fetch(`/api/backtest-history/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, tags }),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save changes:', error);
    } finally {
      setSaving(false);
    }
  }

  function handleAddTag() {
    const trimmedTag = newTag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setNewTag('');
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-[600px] max-h-[80vh] overflow-y-auto shadow-xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Backtest Details
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl"
            >
              ✕
            </button>
          </div>

          {/* Summary */}
          <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="font-medium text-lg text-gray-900 dark:text-white">{entry.strategyName}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {new Date(entry.createdAt).toLocaleString()}
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center text-sm">
                <span className="text-gray-600 dark:text-gray-400 w-24">Type:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {entry.target.type === 'single' ? 'Single Stock' : entry.target.type === 'portfolio' ? 'Portfolio' : 'Group'}
                </span>
              </div>
              <div className="flex items-center text-sm">
                <span className="text-gray-600 dark:text-gray-400 w-24">Target:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {entry.target.type === 'single' && entry.target.datasetName && (
                    <span>📊 {entry.target.datasetName}</span>
                  )}
                  {entry.target.type === 'portfolio' && entry.target.symbols && (
                    <span>📈 {entry.target.symbols.length} stocks: {entry.target.symbols.join(', ')}</span>
                  )}
                  {entry.target.type === 'group' && entry.target.groupName && (
                    <span>📁 {entry.target.groupName}</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Return</div>
              <div
                className={
                  entry.summary.totalReturnPct >= 0
                    ? 'text-green-600 dark:text-green-400 font-medium'
                    : 'text-red-600 dark:text-red-400 font-medium'
                }
              >
                {entry.summary.totalReturnPct.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Sharpe Ratio</div>
              <div className="text-gray-900 dark:text-white font-medium">
                {entry.summary.sharpeRatio.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Trade Count</div>
              <div className="text-gray-900 dark:text-white font-medium">
                {entry.summary.tradeCount}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Duration</div>
              <div className="text-gray-900 dark:text-white font-medium">
                {entry.summary.duration}ms
              </div>
            </div>
          </div>

          {/* Parameters */}
          <div className="mb-4">
            <div className="font-medium mb-2 text-gray-900 dark:text-white">Parameters</div>
            <div className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
              <div>Initial Cash: ¥{entry.parameters.initialCash.toLocaleString()}</div>
              <div>Commission: {(entry.parameters.commission * 100).toFixed(2)}%</div>
              {entry.parameters.startDate && <div>Start Date: {entry.parameters.startDate}</div>}
              {entry.parameters.endDate && <div>End Date: {entry.parameters.endDate}</div>}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-white">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded h-24 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Add notes about this backtest..."
            />
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-white">
              Tags
            </label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-sm flex items-center gap-1"
                >
                  {tag}
                  <button
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Add tag..."
              />
              <button
                onClick={handleAddTag}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Add
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => onViewResults(entry)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                📊 View Results
              </button>
              <button
                onClick={() => onRerun(entry)}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                🔄 Re-run Backtest
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded hover:bg-gray-400 dark:hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
