import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 text-gray-900 dark:text-white">
            Stock Viewer
          </h1>
          <p className="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            Analyze stock charts, create custom indicators, and backtest trading strategies with Python
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto mb-16">
          <Link
            href="/viewer"
            className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg dark:shadow-none dark:hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-shadow border border-gray-200 dark:border-gray-700 dark:hover:border-gray-500"
          >
            <div className="text-4xl mb-4">📊</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Viewer</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Visualize stock data with interactive charts and apply custom indicators
            </p>
          </Link>

          <Link
            href="/backtest"
            className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg dark:shadow-none dark:hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-shadow border border-gray-200 dark:border-gray-700 dark:hover:border-gray-500"
          >
            <div className="text-4xl mb-4">📈</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Backtest</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Test your trading strategies on historical data with detailed performance metrics
            </p>
          </Link>

          <Link
            href="/datasets"
            className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg dark:shadow-none dark:hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-shadow border border-gray-200 dark:border-gray-700 dark:hover:border-gray-500"
          >
            <div className="text-4xl mb-4">📁</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Datasets</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your stock datasets and organize them into groups
            </p>
          </Link>

          <Link
            href="/docs"
            className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md hover:shadow-lg dark:shadow-none dark:hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-shadow border border-gray-200 dark:border-gray-700 dark:hover:border-gray-500"
          >
            <div className="text-4xl mb-4">📖</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Docs</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Learn how to use all features with comprehensive documentation
            </p>
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-5xl mx-auto shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-2xl font-bold text-center mb-8 text-gray-900 dark:text-white">
            Features
          </h3>

          {/* Charting & Visualization */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
              Charting & Visualization
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Interactive Charts</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Triple synchronized chart layout with candlestick and indicator panels using TradingView Lightweight Charts
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Real-time Data Panel</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Crosshair tracking with OHLC data, indicator values, and metrics at any point
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Constant Lines</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Add horizontal reference lines to charts with custom values and labels
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Keyboard Navigation</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Arrow key navigation between candles with zoom and pan controls
                </p>
              </div>
            </div>
          </div>

          {/* Custom Indicators */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
              Custom Indicators
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Python Editor</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Monaco Editor (VS Code-like) for writing indicator code with syntax highlighting
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">MyTT Library</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  60+ built-in Chinese technical analysis indicators (SMA, EMA, MACD, RSI, etc.)
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Group Indicators</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Create multi-output indicators (e.g., MACD with DIF, DEA, histogram)
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Dependency Detection</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Automatic detection and topological sorting of indicator dependencies
                </p>
              </div>
            </div>
          </div>

          {/* Strategy Backtesting */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-orange-600 dark:text-orange-400 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
              Strategy Backtesting
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Portfolio Strategies</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Test single-stock or portfolio strategies with position limits and sizing constraints
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Performance Metrics</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Sharpe, Sortino, Calmar ratios, max drawdown, win rate, profit factor, and more
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Trade Execution Modes</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Same-day close or next-day open execution with slippage tracking
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Visual Analysis</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Equity curves, drawdown charts, trade markers, and portfolio composition pie charts
                </p>
              </div>
            </div>
          </div>

          {/* Data Sources */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-purple-600 dark:text-purple-400 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
              Data Sources
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Multiple Markets</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  A-shares, B-shares, Hong Kong stocks, US indices, global indices, ETFs, and futures
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Multiple Timeframes</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Daily data and minute-level data (1/5/15/30/60 min) from various providers
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Symbol Browser</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Browse and search available symbols for each data source with batch add support
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Auto-Update</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  One-click refresh to update datasets with latest market data
                </p>
              </div>
            </div>
          </div>

          {/* Organization & History */}
          <div>
            <h4 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
              Organization & History
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Stock Groups</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Organize stocks into portfolios, sectors, or custom groups for analysis
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Backtest History</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Auto-save all backtest runs with notes, tags, and star for favorites
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Search & Filter</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Filter datasets and backtests by group, symbol, name, tags, or starred status
                </p>
              </div>
              <div>
                <h5 className="font-medium text-gray-900 dark:text-white mb-1">Batch Operations</h5>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Bulk update, delete, or apply indicators to multiple datasets at once
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

