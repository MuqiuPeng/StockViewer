'use client';

import { useState, useMemo } from 'react';
import { TradeMarker, TradeSortField, SortDirection, TradeFilterType } from './types';
import { sortTrades, filterTrades, formatNumber } from './utils';

interface TradeTableProps {
  trades: TradeMarker[];
  showSymbol?: boolean;
  symbols?: string[];
  getStockDisplayName?: (symbol: string) => string;
  initialPerPage?: number;
}

export default function TradeTable({
  trades,
  showSymbol = false,
  symbols = [],
  getStockDisplayName,
  initialPerPage = 25,
}: TradeTableProps) {
  const [sortField, setSortField] = useState<TradeSortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [typeFilter, setTypeFilter] = useState<TradeFilterType>('all');
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [tradesPerPage, setTradesPerPage] = useState(initialPerPage);
  const [currentPage, setCurrentPage] = useState(1);

  // Process trades: filter and sort
  const processedTrades = useMemo(() => {
    let result = [...trades];

    // Filter by type
    result = filterTrades(result, typeFilter);

    // Filter by symbol if applicable
    if (showSymbol && symbolFilter) {
      result = result.filter(t => t.symbol === symbolFilter);
    }

    // Sort
    result = sortTrades(result, sortField, sortDirection);

    return result;
  }, [trades, typeFilter, symbolFilter, showSymbol, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(processedTrades.length / tradesPerPage);
  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * tradesPerPage;
    return processedTrades.slice(start, start + tradesPerPage);
  }, [processedTrades, currentPage, tradesPerPage]);

  // Handle sort click
  const handleSort = (field: TradeSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'date' ? 'asc' : 'desc');
    }
  };

  // Reset to page 1 when filters change
  const handleFilterChange = (filter: TradeFilterType) => {
    setTypeFilter(filter);
    setCurrentPage(1);
  };

  const handleSymbolFilterChange = (symbol: string) => {
    setSymbolFilter(symbol);
    setCurrentPage(1);
  };

  const SortIndicator = ({ field }: { field: TradeSortField }) => (
    sortField === field ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''
  );

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
          <select
            value={typeFilter}
            onChange={(e) => handleFilterChange(e.target.value as TradeFilterType)}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">All Trades</option>
            <option value="buy">Buy Only</option>
            <option value="sell">Sell Only</option>
          </select>
        </div>

        {showSymbol && symbols.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Symbol:</span>
            <select
              value={symbolFilter}
              onChange={(e) => handleSymbolFilterChange(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">All Symbols</option>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {getStockDisplayName ? getStockDisplayName(symbol) : symbol}
                </option>
              ))}
            </select>
          </div>
        )}

        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
          {processedTrades.length} trades
        </span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th
                  className="text-left py-3 px-4 font-semibold text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => handleSort('date')}
                >
                  Date<SortIndicator field="date" />
                </th>
                {showSymbol && (
                  <th className="text-left py-3 px-4 font-semibold text-sm text-gray-900 dark:text-white">
                    Symbol
                  </th>
                )}
                <th className="text-left py-3 px-4 font-semibold text-sm text-gray-900 dark:text-white">
                  Type
                </th>
                <th className="text-right py-3 px-4 font-semibold text-sm text-gray-900 dark:text-white">
                  Price
                </th>
                <th
                  className="text-right py-3 px-4 font-semibold text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => handleSort('size')}
                >
                  Size<SortIndicator field="size" />
                </th>
                <th
                  className="text-right py-3 px-4 font-semibold text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => handleSort('value')}
                >
                  Value<SortIndicator field="value" />
                </th>
                <th className="text-right py-3 px-4 font-semibold text-sm text-gray-900 dark:text-white">
                  Commission
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedTrades.length === 0 ? (
                <tr>
                  <td
                    colSpan={showSymbol ? 7 : 6}
                    className="py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    No trades to display
                  </td>
                </tr>
              ) : (
                paginatedTrades.map((trade, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-white">
                      {trade.execution_date || trade.date}
                    </td>
                    {showSymbol && (
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                        {getStockDisplayName && trade.symbol
                          ? getStockDisplayName(trade.symbol)
                          : trade.symbol || 'N/A'}
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                          trade.type === 'buy'
                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                        }`}
                      >
                        {trade.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-900 dark:text-white">
                      {trade.price !== undefined ? `¥${trade.price.toFixed(2)}` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-900 dark:text-white">
                      {trade.size !== undefined
                        ? trade.size.toLocaleString()
                        : trade.amount
                        ? formatNumber(trade.amount)
                        : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-900 dark:text-white">
                      {trade.value !== undefined ? `¥${formatNumber(trade.value)}` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-500 dark:text-gray-400">
                      {trade.commission !== undefined ? `¥${formatNumber(trade.commission)}` : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {processedTrades.length > 0 && (
        <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Showing {(currentPage - 1) * tradesPerPage + 1} to{' '}
              {Math.min(currentPage * tradesPerPage, processedTrades.length)} of{' '}
              {processedTrades.length} trades
            </span>
            <select
              value={tradesPerPage}
              onChange={(e) => {
                setTradesPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm text-gray-900 dark:text-white">
              Page {currentPage} of {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact trade list for panels/modals
interface CompactTradeListProps {
  trades: TradeMarker[];
  maxItems?: number;
  showSymbol?: boolean;
}

export function CompactTradeList({ trades, maxItems = 10, showSymbol = false }: CompactTradeListProps) {
  const displayTrades = trades.slice(0, maxItems);

  return (
    <div className="space-y-2">
      {displayTrades.map((trade, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded text-sm"
        >
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded ${
                trade.type === 'buy'
                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                  : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              }`}
            >
              {trade.type.toUpperCase()}
            </span>
            <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
              {trade.execution_date || trade.date}
            </span>
            {showSymbol && trade.symbol && (
              <span className="text-gray-900 dark:text-white font-medium">{trade.symbol}</span>
            )}
          </div>
          <div className="text-right">
            <span className="font-mono text-gray-900 dark:text-white">
              ¥{trade.price?.toFixed(2)}
            </span>
            <span className="text-gray-500 dark:text-gray-400 ml-2">
              x{trade.size}
            </span>
          </div>
        </div>
      ))}
      {trades.length > maxItems && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
          +{trades.length - maxItems} more trades
        </div>
      )}
    </div>
  );
}
