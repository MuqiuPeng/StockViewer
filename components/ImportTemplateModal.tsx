'use client';

import { useState, useEffect } from 'react';

interface ImportItem {
  id: string;
  type: 'indicator' | 'strategy' | 'stockGroup' | 'viewSetting' | 'backtestHistory';
  originalName: string;
  suggestedName: string;
  hasConflict: boolean;
  isDependency: boolean;
}

interface ImportTemplateModalProps {
  postId: string;
  attachmentId: string;
  onClose: () => void;
  onSuccess: (resource: { id: string; name: string; type: string }) => void;
}

const typeLabels: Record<string, string> = {
  indicator: 'Indicator',
  strategy: 'Strategy',
  stockGroup: 'Stock Group',
  viewSetting: 'View Setting',
  backtestHistory: 'Backtest History',
};

const typeColors: Record<string, string> = {
  indicator: 'purple',
  strategy: 'blue',
  stockGroup: 'green',
  viewSetting: 'orange',
  backtestHistory: 'pink',
};

export default function ImportTemplateModal({
  postId,
  attachmentId,
  onClose,
  onSuccess,
}: ImportTemplateModalProps) {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [renamedItems, setRenamedItems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkTemplate();
  }, [postId, attachmentId]);

  const checkTemplate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/posts/${postId}/check-template?attachmentId=${attachmentId}`
      );
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to check template');
      } else {
        setItems(data.items || []);
        // Initialize renamed items with suggested names
        const renamed: Record<string, string> = {};
        for (const item of data.items || []) {
          renamed[item.id] = item.suggestedName;
        }
        setRenamedItems(renamed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check template');
    } finally {
      setLoading(false);
    }
  };

  const handleNameChange = (itemId: string, newName: string) => {
    setRenamedItems(prev => ({ ...prev, [itemId]: newName }));
  };

  // Check if a name conflicts with any other item's name (in the import list)
  // or with existing user resources
  const checkLocalConflict = (itemId: string, name: string): boolean => {
    // Check against other items in this import
    for (const item of items) {
      if (item.id !== itemId && renamedItems[item.id] === name) {
        return true;
      }
    }
    return false;
  };

  // Check if all items have valid names (no empty, no conflicts)
  const hasValidNames = (): boolean => {
    for (const item of items) {
      const name = renamedItems[item.id]?.trim();
      if (!name) return false;
      // Check for conflict with original name if it had conflict
      if (item.hasConflict && name === item.originalName) return false;
      // Check for local conflicts
      if (checkLocalConflict(item.id, name)) return false;
    }
    return true;
  };

  const handleImport = async () => {
    if (!hasValidNames()) return;

    setImporting(true);
    setError(null);
    try {
      const response = await fetch(`/api/posts/${postId}/use-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachmentId,
          renamedItems,
        }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to import template');
      } else {
        onSuccess(data.resource);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import template');
    } finally {
      setImporting(false);
    }
  };

  const mainItem = items.find(item => !item.isDependency);
  const dependencyItems = items.filter(item => item.isDependency);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold dark:text-white mb-4">Import Template</h3>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Checking for conflicts...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : (
          <>
            {/* Main item */}
            {mainItem && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `var(--${typeColors[mainItem.type]}-100, #f3e8ff)`,
                      color: `var(--${typeColors[mainItem.type]}-700, #7c3aed)`,
                    }}
                  >
                    {typeLabels[mainItem.type]}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">Main Resource</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={renamedItems[mainItem.id] || ''}
                    onChange={(e) => handleNameChange(mainItem.id, e.target.value)}
                    className={`w-full p-3 border rounded-lg dark:bg-gray-700 dark:text-white ${
                      (mainItem.hasConflict && renamedItems[mainItem.id] === mainItem.originalName) ||
                      checkLocalConflict(mainItem.id, renamedItems[mainItem.id] || '') ||
                      !renamedItems[mainItem.id]?.trim()
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    placeholder="Enter name..."
                  />
                  {mainItem.hasConflict && renamedItems[mainItem.id] === mainItem.originalName && (
                    <p className="text-xs text-red-500 mt-1">
                      Name already exists. Please choose a different name.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Dependencies */}
            {dependencyItems.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Dependencies ({dependencyItems.length})
                </h4>
                <div className="space-y-3">
                  {dependencyItems.map((item) => {
                    const hasError =
                      (item.hasConflict && renamedItems[item.id] === item.originalName) ||
                      checkLocalConflict(item.id, renamedItems[item.id] || '') ||
                      !renamedItems[item.id]?.trim();

                    return (
                      <div key={item.id} className="border dark:border-gray-600 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: `var(--${typeColors[item.type]}-100, #f3e8ff)`,
                              color: `var(--${typeColors[item.type]}-700, #7c3aed)`,
                            }}
                          >
                            {typeLabels[item.type]}
                          </span>
                          {item.hasConflict && (
                            <span className="text-xs text-red-500">Conflict</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={renamedItems[item.id] || ''}
                          onChange={(e) => handleNameChange(item.id, e.target.value)}
                          className={`w-full p-2 border rounded dark:bg-gray-700 dark:text-white text-sm ${
                            hasError
                              ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                          placeholder="Enter name..."
                        />
                        {hasError && item.hasConflict && renamedItems[item.id] === item.originalName && (
                          <p className="text-xs text-red-500 mt-1">
                            Name already exists. Please rename.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !hasValidNames()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing...' : `Import${items.length > 1 ? ` (${items.length} items)` : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
