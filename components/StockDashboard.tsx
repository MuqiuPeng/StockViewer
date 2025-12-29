'use client';

import { useState, useEffect } from 'react';
import ChartPanel from './ChartPanel';
import IndicatorSelector from './IndicatorSelector';

interface DatasetInfo {
  name: string;
  filename: string;
  columns: string[];
  indicators: string[];
  rowCount: number;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndicatorData {
  time: number;
  value: number | null;
}

interface DatasetData {
  meta: {
    name: string;
    filename: string;
    columns: string[];
    indicators: string[];
    rowCount: number;
  };
  candles: CandleData[];
  indicators: Record<string, IndicatorData[]>;
}

export default function StockDashboard() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [datasetData, setDatasetData] = useState<DatasetData | null>(null);
  const [enabledIndicators, setEnabledIndicators] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load datasets list on mount
  useEffect(() => {
    fetch('/api/datasets')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.message || 'Failed to load datasets');
          return;
        }
        setDatasets(data);
        if (data.length > 0) {
          setSelectedDataset(data[0].name);
        }
      })
      .catch((err) => {
        setError(`Failed to load datasets: ${err.message}`);
      });
  }, []);

  // Load dataset data when selection changes
  useEffect(() => {
    if (!selectedDataset) return;

    setLoading(true);
    setError(null);
    fetch(`/api/dataset/${encodeURIComponent(selectedDataset)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.message || 'Failed to load dataset');
          setDatasetData(null);
          return;
        }
        setDatasetData(data);
        
        // Default-enable first 2 indicators
        const indicators = data.meta.indicators || [];
        const defaultEnabled = new Set<string>();
        if (indicators.length > 0) {
          defaultEnabled.add(indicators[0]);
        }
        if (indicators.length > 1) {
          defaultEnabled.add(indicators[1]);
        }
        setEnabledIndicators(defaultEnabled);
      })
      .catch((err) => {
        setError(`Failed to load dataset: ${err.message}`);
        setDatasetData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedDataset]);

  const handleToggleIndicator = (indicator: string) => {
    setEnabledIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(indicator)) {
        next.delete(indicator);
      } else {
        next.add(indicator);
      }
      return next;
    });
  };

  return (
    <div className="stock-dashboard p-4">
      <h1 className="text-2xl font-bold mb-4">Stock Dashboard</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="dataset-select" className="block text-sm font-medium mb-2">
          Select Dataset:
        </label>
        <select
          id="dataset-select"
          value={selectedDataset}
          onChange={(e) => setSelectedDataset(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded"
          disabled={loading || datasets.length === 0}
        >
          {datasets.length === 0 ? (
            <option value="">No datasets available</option>
          ) : (
            datasets.map((ds) => (
              <option key={ds.name} value={ds.name}>
                {ds.name} ({ds.rowCount} rows)
              </option>
            ))
          )}
        </select>
      </div>

      {loading && (
        <div className="mb-4 text-gray-600">Loading dataset...</div>
      )}

      {datasetData && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <h2 className="text-lg font-semibold mb-2">Indicators</h2>
            <IndicatorSelector
              indicators={datasetData.meta.indicators}
              enabledIndicators={enabledIndicators}
              onToggle={handleToggleIndicator}
            />
          </div>
          <div className="lg:col-span-3">
            <h2 className="text-lg font-semibold mb-2">Chart</h2>
            <ChartPanel
              candles={datasetData.candles}
              indicators={datasetData.indicators}
              enabledIndicators={enabledIndicators}
            />
          </div>
        </div>
      )}
    </div>
  );
}

