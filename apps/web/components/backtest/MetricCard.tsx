'use client';

import { ReactNode } from 'react';

export type MetricCardColor = 'blue' | 'purple' | 'green' | 'red' | 'orange' | 'teal' | 'yellow' | 'gray';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  subValue?: ReactNode;
  tooltip?: string;
  tooltipTitle?: string;
  color?: MetricCardColor;
  // For dynamic coloring based on value
  dynamicColor?: boolean;
  isPositive?: boolean;
}

const colorClasses: Record<MetricCardColor, {
  bg: string;
  text: string;
  border: string;
}> = {
  blue: {
    bg: 'from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/40',
    text: 'text-blue-900 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-700',
  },
  purple: {
    bg: 'from-purple-50 to-purple-100 dark:from-purple-900/40 dark:to-purple-800/40',
    text: 'text-purple-900 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-700',
  },
  green: {
    bg: 'from-green-50 to-green-100 dark:from-green-900/40 dark:to-green-800/40',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-200 dark:border-green-700',
  },
  red: {
    bg: 'from-red-50 to-red-100 dark:from-red-900/40 dark:to-red-800/40',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-700',
  },
  orange: {
    bg: 'from-orange-50 to-orange-100 dark:from-orange-900/40 dark:to-orange-800/40',
    text: 'text-orange-900 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-700',
  },
  teal: {
    bg: 'from-teal-50 to-teal-100 dark:from-teal-900/40 dark:to-teal-800/40',
    text: 'text-teal-900 dark:text-teal-300',
    border: 'border-teal-200 dark:border-teal-700',
  },
  yellow: {
    bg: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/40 dark:to-yellow-800/40',
    text: 'text-yellow-900 dark:text-yellow-300',
    border: 'border-yellow-200 dark:border-yellow-700',
  },
  gray: {
    bg: 'from-gray-50 to-gray-100 dark:from-gray-900/40 dark:to-gray-800/40',
    text: 'text-gray-900 dark:text-gray-300',
    border: 'border-gray-200 dark:border-gray-700',
  },
};

export default function MetricCard({
  label,
  value,
  subValue,
  tooltip,
  tooltipTitle,
  color = 'blue',
  dynamicColor = false,
  isPositive,
}: MetricCardProps) {
  // Determine color based on dynamic coloring
  const effectiveColor = dynamicColor
    ? (isPositive ? 'green' : 'red')
    : color;

  const colors = colorClasses[effectiveColor];

  return (
    <div className={`relative group bg-gradient-to-br ${colors.bg} p-4 rounded-lg border ${colors.border} ${tooltip ? 'cursor-help' : ''}`}>
      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors.text}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
          {subValue}
        </div>
      )}
      {tooltip && (
        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64">
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3">
            {tooltipTitle && <div className="font-semibold mb-1">{tooltipTitle}</div>}
            <div>{tooltip}</div>
            <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}

// Grid wrapper for metric cards
interface MetricCardGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4 | 5;
}

export function MetricCardGrid({ children, columns = 4 }: MetricCardGridProps) {
  const colClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
    5: 'md:grid-cols-5',
  }[columns];

  return (
    <div className={`mb-6 grid grid-cols-1 ${colClass} gap-4`}>
      {children}
    </div>
  );
}

// Smaller metric display for within sections
interface SmallMetricProps {
  label: string;
  value: ReactNode;
  subLabel?: string;
  tooltip?: string;
  tooltipTitle?: string;
  color?: MetricCardColor;
}

export function SmallMetric({ label, value, subLabel, tooltip, tooltipTitle, color = 'gray' }: SmallMetricProps) {
  const colors = colorClasses[color];

  return (
    <div className={`relative group bg-gradient-to-br ${colors.bg} p-3 rounded border ${colors.border} ${tooltip ? 'cursor-help' : ''}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-lg font-semibold ${colors.text}`}>{value}</div>
      {subLabel && <div className="text-xs text-gray-500 dark:text-gray-400">{subLabel}</div>}
      {tooltip && (
        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-56">
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-lg p-2">
            {tooltipTitle && <div className="font-semibold mb-1">{tooltipTitle}</div>}
            <div>{tooltip}</div>
            <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}
