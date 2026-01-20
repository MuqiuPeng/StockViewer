'use client';

import { useState } from 'react';
import DatasetShareTab from './share/DatasetShareTab';
import IndicatorShareTab from './share/IndicatorShareTab';
import StrategyShareTab from './share/StrategyShareTab';

type Tab = 'datasets' | 'indicators' | 'strategies';

export default function SharePageContent() {
  const [activeTab, setActiveTab] = useState<Tab>('datasets');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Share Library
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Browse and import shared datasets, indicators, and strategies
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex gap-4">
            <button
              onClick={() => setActiveTab('datasets')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'datasets'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Datasets
            </button>
            <button
              onClick={() => setActiveTab('indicators')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'indicators'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Indicators
            </button>
            <button
              onClick={() => setActiveTab('strategies')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'strategies'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Strategies
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'datasets' && <DatasetShareTab />}
        {activeTab === 'indicators' && <IndicatorShareTab />}
        {activeTab === 'strategies' && <StrategyShareTab />}

        {/* Back link */}
        <div className="mt-6">
          <a
            href="/"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            &larr; Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
