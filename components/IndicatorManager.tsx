'use client';

import { useState, useEffect } from 'react';
import IndicatorEditorModal from './IndicatorEditorModal';
import ApplyIndicatorModal from './ApplyIndicatorModal';

interface Indicator {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  outputColumn: string;
  isGroup?: boolean;
  groupName?: string;
  expectedOutputs?: string[];
  createdAt: string;
  updatedAt?: string;
}

interface IndicatorManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshDataset?: () => void;
}

export default function IndicatorManager({ isOpen, onClose, onRefreshDataset }: IndicatorManagerProps) {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [editingIndicator, setEditingIndicator] = useState<Indicator | null>(null);
  const [selectedIndicatorId, setSelectedIndicatorId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadIndicators();
    }
  }, [isOpen]);

  const loadIndicators = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/indicators');
      const data = await response.json();
      if (data.error) {
        setError(data.message || 'Failed to load indicators');
      } else {
        setIndicators(data.indicators || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load indicators');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      // First check if indicator has dependents
      const checkResponse = await fetch(`/api/indicators/${id}?checkOnly=true`, {
        method: 'DELETE',
      });
      const checkData = await checkResponse.json();

      let shouldDelete = false;
      let cascade = false;

      if (checkData.hasDependents && checkData.dependents.length > 0) {
        // Show warning about dependents
        const dependentNames = checkData.dependents.map((d: any) => d.name).join('\n  • ');
        const message = `Warning: "${name}" is used by other indicators:\n  • ${dependentNames}\n\nDeleting it will also delete all dependent indicators.\n\nDo you want to proceed?`;

        if (confirm(message)) {
          shouldDelete = true;
          cascade = true;
        }
      } else {
        // No dependents, simple confirmation
        if (confirm(`Are you sure you want to delete "${name}"?`)) {
          shouldDelete = true;
        }
      }

      if (!shouldDelete) {
        return;
      }

      // Perform deletion
      const deleteUrl = `/api/indicators/${id}${cascade ? '?cascade=true' : ''}`;
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete indicator');
      }

      const result = await response.json();

      // Show success message
      if (cascade && result.deletedCount > 1) {
        alert(`Successfully deleted ${result.deletedCount} indicators:\n  • ${result.deleted.map((d: any) => d.name).join('\n  • ')}`);
      }

      await loadIndicators();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete indicator');
    }
  };

  const handleEdit = (indicator: Indicator) => {
    setEditingIndicator(indicator);
    setIsEditorOpen(true);
  };

  const handleApply = (indicatorId: string) => {
    setSelectedIndicatorId(indicatorId);
    setIsApplyOpen(true);
  };

  const handleEditorClose = () => {
    setIsEditorOpen(false);
    setEditingIndicator(null);
  };

  const handleEditorSuccess = () => {
    setIsEditorOpen(false);
    setEditingIndicator(null);
    loadIndicators();
  };

  const handleApplyClose = () => {
    setIsApplyOpen(false);
    setSelectedIndicatorId(null);
  };

  const formatOutputColumn = (indicator: Indicator): string => {
    if (indicator.isGroup && indicator.groupName && indicator.expectedOutputs) {
      // For group indicators, show all columns in format "groupName:output1, groupName:output2, ..."
      return indicator.expectedOutputs
        .map(output => `${indicator.groupName}:${output}`)
        .join(', ');
    }
    // For single indicators, just show the output column name
    return indicator.outputColumn;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Indicator Manager</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="mb-4">
          <button
            onClick={() => setIsEditorOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Create New Indicator
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-600">Loading indicators...</div>
        ) : indicators.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No indicators yet. Create your first indicator to get started!
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Name</th>
                <th className="border p-2 text-left">Description</th>
                <th className="border p-2 text-left">Output Column</th>
                <th className="border p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((indicator) => (
                <tr key={indicator.id} className="hover:bg-gray-50">
                  <td className="border p-2 font-medium">{indicator.name}</td>
                  <td className="border p-2">{indicator.description}</td>
                  <td className="border p-2 font-mono text-sm">{formatOutputColumn(indicator)}</td>
                  <td className="border p-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApply(indicator.id)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => handleEdit(indicator)}
                        className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(indicator.id, indicator.name)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <IndicatorEditorModal
          isOpen={isEditorOpen}
          onClose={handleEditorClose}
          onSuccess={handleEditorSuccess}
          indicator={editingIndicator}
        />

        {selectedIndicatorId && (
          <ApplyIndicatorModal
            isOpen={isApplyOpen}
            onClose={handleApplyClose}
            indicatorId={selectedIndicatorId}
            onSuccess={onRefreshDataset}
          />
        )}
      </div>
    </div>
  );
}
