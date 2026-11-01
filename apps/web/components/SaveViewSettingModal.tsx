'use client';

import { useState } from 'react';

interface ViewSetting {
  id: string;
  name: string;
}

interface SaveViewSettingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, existingId?: string) => Promise<void>;
  existingSettings: ViewSetting[];
}

export default function SaveViewSettingModal({
  isOpen,
  onClose,
  onSave,
  existingSettings,
}: SaveViewSettingModalProps) {
  const [mode, setMode] = useState<'new' | 'overwrite'>('new');
  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    if (mode === 'new') {
      if (!newName.trim()) {
        setError('Please enter a name for the setting');
        return;
      }
      setSaving(true);
      try {
        await onSave(newName.trim());
        setNewName('');
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to save setting');
      } finally {
        setSaving(false);
      }
    } else {
      if (!selectedId) {
        setError('Please select a setting to overwrite');
        return;
      }
      const selected = existingSettings.find(s => s.id === selectedId);
      if (!selected) {
        setError('Selected setting not found');
        return;
      }
      setSaving(true);
      try {
        await onSave(selected.name, selectedId);
        setSelectedId('');
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to save setting');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleClose = () => {
    setNewName('');
    setSelectedId('');
    setError(null);
    setMode('new');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={handleClose}
      />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">Save View Setting</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 rounded text-sm">
            {error}
          </div>
        )}

        {/* Mode Selection */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('new')}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
              mode === 'new'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Create New
          </button>
          <button
            onClick={() => setMode('overwrite')}
            disabled={existingSettings.length === 0}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === 'overwrite'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Overwrite Existing
          </button>
        </div>

        {mode === 'new' ? (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 dark:text-white">
              Setting Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleClose();
              }}
              placeholder="Enter a name..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 dark:text-white">
              Select Setting to Overwrite
            </label>
            {existingSettings.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No existing settings. Create a new one instead.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {existingSettings.map((setting) => (
                  <button
                    key={setting.id}
                    onClick={() => setSelectedId(setting.id)}
                    className={`w-full text-left p-3 border rounded transition-colors ${
                      selectedId === setting.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium dark:text-white">{setting.name}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (mode === 'new' && !newName.trim()) || (mode === 'overwrite' && !selectedId)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
