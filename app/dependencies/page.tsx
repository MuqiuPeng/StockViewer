'use client';

import { useState, useEffect } from 'react';
import DependencyGraph from '@/components/DependencyGraph';

interface Dataset {
  id: string;
  symbol: string;
  name: string;
  dataSource: string;
  rowCount: number;
  isReferenced: boolean;
}

interface StockGroup {
  id: string;
  name: string;
  description: string | null;
  stockIds: string[];
  isReferenced: boolean;
}

interface BacktestHistory {
  id: string;
  strategyName: string;
  totalReturnPct: number;
  sharpeRatio: number;
  tradeCount: number;
  createdAt: string;
  target: any;
}

export default function DependenciesPage() {
  const [activeTab, setActiveTab] = useState<'graph' | 'datasets' | 'groups' | 'history'>('graph');
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [history, setHistory] = useState<BacktestHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'graph') {
      loadData();
    }
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'datasets') {
        // Fetch datasets and check which are referenced
        const [dsRes, groupsRes, historyRes] = await Promise.all([
          fetch('/api/datasets'),
          fetch('/api/groups'),
          fetch('/api/backtest-history?starred=true'),
        ]);

        const dsData = await dsRes.json();
        const groupsData = await groupsRes.json();
        const historyData = await historyRes.json();

        // Collect all referenced stock IDs from groups and backtest history
        const referencedIds = new Set<string>();

        // From stock groups
        (groupsData.groups || []).forEach((g: any) => {
          (g.stockIds || []).forEach((id: string) => referencedIds.add(id));
        });

        // From backtest history targets
        (historyData.history || []).forEach((h: any) => {
          const target = h.target || {};
          if (target.stockId) referencedIds.add(target.stockId);
          if (target.stockIds) {
            target.stockIds.forEach((id: string) => referencedIds.add(id));
          }
        });

        const dsList = (dsData.datasets || []).map((ds: any) => ({
          ...ds,
          isReferenced: referencedIds.has(ds.id),
        }));

        // Only show referenced datasets
        setDatasets(dsList.filter((ds: Dataset) => ds.isReferenced));
      } else if (activeTab === 'groups') {
        // Fetch groups and check which are referenced
        const [groupsRes, historyRes] = await Promise.all([
          fetch('/api/groups'),
          fetch('/api/backtest-history?starred=true'),
        ]);

        const groupsData = await groupsRes.json();
        const historyData = await historyRes.json();

        // Collect referenced group IDs from backtest history
        const referencedGroupIds = new Set<string>();
        (historyData.history || []).forEach((h: any) => {
          const target = h.target || {};
          if (target.groupId) referencedGroupIds.add(target.groupId);
        });

        const groupList = (groupsData.groups || []).map((g: any) => ({
          ...g,
          isReferenced: referencedGroupIds.has(g.id),
        }));

        // Only show referenced groups
        setGroups(groupList.filter((g: StockGroup) => g.isReferenced));
      } else if (activeTab === 'history') {
        // Only fetch starred backtest history
        const res = await fetch('/api/backtest-history?starred=true');
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4">
        <button
          onClick={() => setActiveTab('graph')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'graph'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Dependency Graph
        </button>
        <button
          onClick={() => setActiveTab('datasets')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'datasets'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Datasets
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'groups'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Stock Groups
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          Starred History
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'graph' && <DependencyGraph />}

        {activeTab === 'datasets' && (
          <div className="h-full overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl font-bold dark:text-white mb-2">Referenced Datasets</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Datasets that are used in stock groups or backtest history
              </p>

              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading...</div>
              ) : datasets.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400">No referenced datasets</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {datasets.map((ds) => (
                    <div
                      key={ds.id}
                      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium dark:text-white">
                            {ds.symbol} - {ds.name}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {ds.dataSource} · {ds.rowCount.toLocaleString()} rows
                          </p>
                        </div>
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded">
                          Referenced
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'groups' && (
          <div className="h-full overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl font-bold dark:text-white mb-2">Referenced Stock Groups</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Stock groups that are used in backtest history
              </p>

              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading...</div>
              ) : groups.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400">No referenced stock groups</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {groups.map((g) => (
                    <div
                      key={g.id}
                      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium dark:text-white">{g.name}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {g.description || 'No description'} · {g.stockIds.length} stocks
                          </p>
                        </div>
                        <span className="px-2 py-1 text-xs bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 rounded">
                          Referenced
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="h-full overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl font-bold dark:text-white mb-2">Starred Backtest History</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Backtest entries you&apos;ve starred for reference
              </p>

              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading...</div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400">No starred backtest history</p>
                  <p className="text-sm text-gray-400 mt-2">Star backtest entries to see them here</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium dark:text-white">{h.strategyName}</h3>
                          <div className="flex items-center gap-4 mt-1 text-sm">
                            <span className={h.totalReturnPct >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {h.totalReturnPct >= 0 ? '+' : ''}{h.totalReturnPct.toFixed(2)}%
                            </span>
                            <span className="text-gray-500 dark:text-gray-400">
                              Sharpe: {h.sharpeRatio.toFixed(2)}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400">
                              {h.tradeCount} trades
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(h.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded">
                          Starred
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
