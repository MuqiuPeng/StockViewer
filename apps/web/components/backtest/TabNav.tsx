'use client';

import { ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number | string;
}

interface TabNavProps<T extends string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  rightContent?: ReactNode;
}

export default function TabNav<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  rightContent,
}: TabNavProps<T>) {
  return (
    <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700">
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className="ml-1 text-sm">({tab.badge})</span>
            )}
          </button>
        ))}
      </div>
      {rightContent && <div>{rightContent}</div>}
    </div>
  );
}

// Section header component
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  rightContent?: ReactNode;
}

export function SectionHeader({ title, subtitle, rightContent }: SectionHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
        )}
      </div>
      {rightContent && <div>{rightContent}</div>}
    </div>
  );
}
