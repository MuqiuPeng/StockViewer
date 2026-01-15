'use client';

import { useState, useRef } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

type Section =
  | 'getting-started'
  | 'viewer'
  | 'indicators'
  | 'indicators-single'
  | 'indicators-group'
  | 'indicators-external'
  | 'indicators-dependencies'
  | 'backtest'
  | 'backtest-single'
  | 'backtest-portfolio'
  | 'backtest-metrics'
  | 'datasets'
  | 'datasets-sources'
  | 'datasets-groups';

interface NavItem {
  id: Section;
  title: string;
  level: number;
}

const navigation: NavItem[] = [
  { id: 'getting-started', title: 'Getting Started', level: 0 },
  { id: 'viewer', title: 'Chart Viewer', level: 0 },
  { id: 'indicators', title: 'Indicators', level: 0 },
  { id: 'indicators-single', title: 'Single Indicators', level: 1 },
  { id: 'indicators-group', title: 'Group Indicators', level: 1 },
  { id: 'indicators-external', title: 'External Datasets', level: 1 },
  { id: 'indicators-dependencies', title: 'Dependencies', level: 1 },
  { id: 'backtest', title: 'Backtesting', level: 0 },
  { id: 'backtest-single', title: 'Single Stock', level: 1 },
  { id: 'backtest-portfolio', title: 'Portfolio', level: 1 },
  { id: 'backtest-metrics', title: 'Metrics', level: 1 },
  { id: 'datasets', title: 'Datasets', level: 0 },
  { id: 'datasets-sources', title: 'Data Sources', level: 1 },
  { id: 'datasets-groups', title: 'Groups', level: 1 },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<Section>('getting-started');
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (sectionId: Section) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="flex">
        {/* Sidebar */}
        <aside className="fixed left-0 top-14 bottom-0 w-64 border-r border-gray-200 dark:border-gray-800 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <nav className="p-4">
            <div className="space-y-1">
              {navigation.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    item.level === 1 ? 'pl-6' : ''
                  } ${
                    activeSection === item.id
                      ? 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64">
          <div className="max-w-3xl mx-auto px-8 py-12" ref={contentRef}>

            {/* Getting Started */}
            <section id="getting-started" className="mb-16">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Getting Started</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
                Stock Viewer is a platform for stock analysis, custom indicator development, and strategy backtesting.
              </p>

              <div className="space-y-6">
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Quick Start</h3>
                  <ol className="space-y-3 text-gray-600 dark:text-gray-400">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm flex items-center justify-center font-medium">1</span>
                      <span><strong className="text-gray-900 dark:text-white">Add datasets</strong> — Import stock data from various sources or upload CSV files</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm flex items-center justify-center font-medium">2</span>
                      <span><strong className="text-gray-900 dark:text-white">Create indicators</strong> — Write custom technical indicators in Python</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm flex items-center justify-center font-medium">3</span>
                      <span><strong className="text-gray-900 dark:text-white">Visualize</strong> — View interactive charts with your indicators</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm flex items-center justify-center font-medium">4</span>
                      <span><strong className="text-gray-900 dark:text-white">Backtest</strong> — Test trading strategies on historical data</span>
                    </li>
                  </ol>
                </div>
              </div>
            </section>

            <Divider />

            {/* Viewer */}
            <section id="viewer" className="mb-16">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Chart Viewer</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                The Viewer displays interactive stock charts with three synchronized panels for candlesticks and indicators.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Chart Layout</h3>
              <Table
                headers={['Panel', 'Purpose', 'Example Indicators']}
                rows={[
                  ['Main Chart', 'Candlestick with price overlays', 'SMA, EMA, Bollinger Bands'],
                  ['Sub Chart 1', 'First indicator panel', 'Volume, MACD'],
                  ['Sub Chart 2', 'Second indicator panel', 'RSI, KDJ'],
                ]}
              />

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 mt-8">Keyboard Controls</h3>
              <Table
                headers={['Key', 'Action']}
                rows={[
                  ['← / →', 'Navigate between candles'],
                  ['Scroll', 'Zoom in/out'],
                  ['Drag', 'Pan chart'],
                ]}
              />

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 mt-8">Features</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li className="flex gap-2">
                  <span className="text-green-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">Crosshair Data Panel</strong> — Shows OHLCV and indicator values at cursor position</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">Constant Lines</strong> — Add horizontal reference lines with custom values</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">Indicator Selector</strong> — Toggle and assign indicators to chart panels</span>
                </li>
              </ul>
            </section>

            <Divider />

            {/* Indicators */}
            <section id="indicators" className="mb-16">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Indicators</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Create custom technical indicators using Python with full access to pandas, numpy, and the MyTT library.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Available Libraries</h3>
              <Table
                headers={['Variable', 'Description']}
                rows={[
                  ['data', 'pandas DataFrame with OHLCV columns and existing indicators'],
                  ['pd', 'pandas library'],
                  ['np', 'numpy library'],
                  ['MyTT', 'Chinese technical analysis library (60+ functions)'],
                ]}
              />
            </section>

            {/* Single Indicators */}
            <section id="indicators-single" className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Single Indicators</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                A single indicator returns one column of values. The function must be named <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">calculate</code> and accept a <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">data</code> parameter.
              </p>

              <CodeBlock
                title="20-day Simple Moving Average"
                code={`def calculate(data):
    """
    Calculate 20-day Simple Moving Average.

    Args:
        data: DataFrame with 'close' column

    Returns:
        pandas Series with SMA values
    """
    return data['close'].rolling(20).mean()`}
              />

              <CodeBlock
                title="Using MyTT Functions"
                code={`def calculate(data):
    """RSI using MyTT library."""
    # MyTT functions are available directly
    rsi = RSI(data['close'].values, N=14)
    return rsi`}
              />
            </section>

            {/* Group Indicators */}
            <section id="indicators-group" className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Group Indicators</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Group indicators return multiple columns. Return a dictionary where keys are output names and values are arrays. Columns are named as <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">GroupName:OutputName</code>.
              </p>

              <CodeBlock
                title="MACD Indicator Group"
                code={`def calculate(data):
    """
    Calculate MACD indicator group.

    Returns:
        dict with 'DIF', 'DEA', 'MACD' keys
        Columns will be: MACD:DIF, MACD:DEA, MACD:MACD
    """
    DIF, DEA, MACD_hist = MACD(
        data['close'].values,
        SHORT=12,
        LONG=26,
        M=9
    )

    return {
        'DIF': DIF,
        'DEA': DEA,
        'MACD': MACD_hist
    }`}
              />

              <Callout type="info" title="Naming Convention">
                When you create a group indicator with name &quot;MACD&quot; and outputs [&quot;DIF&quot;, &quot;DEA&quot;, &quot;MACD&quot;],
                the columns will be accessible as <code>data[&apos;MACD:DIF&apos;]</code>, <code>data[&apos;MACD:DEA&apos;]</code>, etc.
              </Callout>
            </section>

            {/* External Datasets */}
            <section id="indicators-external" className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">External Datasets</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Reference data from other datasets in your indicators. This is useful for relative strength calculations, pair trading, or market breadth indicators.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Setup</h3>
              <ol className="space-y-2 text-gray-600 dark:text-gray-400 mb-6">
                <li>1. In the indicator editor, click <strong className="text-gray-900 dark:text-white">&quot;+ Add External Dataset&quot;</strong></li>
                <li>2. Enter a parameter name (e.g., <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">index</code>)</li>
                <li>3. Select a group and dataset</li>
              </ol>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Single Dataset Mode</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                When selecting a specific dataset, access columns using <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">data[&apos;param@column&apos;]</code>:
              </p>

              <CodeBlock
                title="Relative Strength vs Index"
                code={`def calculate(data):
    """
    Calculate relative strength against market index.

    Setup: Add external dataset with parameter name 'index'
           pointing to a market index (e.g., 000001.csv)

    Access: data['index@close'] returns the index close price
    """
    # Get index close price (merged by date automatically)
    index_close = data['index@close']

    # Calculate relative strength
    relative_strength = data['close'] / index_close

    return relative_strength`}
              />

              <CodeBlock
                title="Using External Indicator Columns"
                code={`def calculate(data):
    """
    Use MACD from another dataset.

    If the external dataset has MACD indicator applied,
    you can access its columns.
    """
    # Access MACD:DIF from the external dataset
    index_dif = data['index@MACD:DIF']
    stock_dif = data['MACD:DIF']

    # Compare MACD DIF values
    divergence = stock_dif - index_dif

    return divergence`}
              />

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 mt-8">All Datasets Mode</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Select <strong>&quot;All&quot;</strong> to import all datasets from a group. Each column returns an array of values from all datasets:
              </p>

              <CodeBlock
                title="Market Breadth - Average of All Stocks"
                code={`def calculate(data):
    """
    Calculate average close price across all stocks in a group.

    Setup: Add external dataset with parameter name 'stocks'
           Select "All" instead of a specific dataset

    Access: data['stocks@close'] returns [val1, val2, val3, ...]
            where each value is from a different stock
    """
    # Get close prices from all stocks (array per row)
    all_closes = data['stocks@close']

    # Calculate mean across all stocks for each date
    avg_close = all_closes.apply(
        lambda arr: np.mean([v for v in arr if v is not None])
    )

    return avg_close`}
              />

              <CodeBlock
                title="Percentage Above Moving Average"
                code={`def calculate(data):
    """
    Calculate % of stocks above their 20-day MA.

    Requires: Each stock in the group has SMA_20 indicator applied
    """
    # Get SMA_20 values from all stocks
    all_sma = data['stocks@SMA_20']
    all_close = data['stocks@close']

    def pct_above_ma(row_idx):
        sma_arr = all_sma.iloc[row_idx]
        close_arr = all_close.iloc[row_idx]

        above = sum(1 for c, s in zip(close_arr, sma_arr)
                    if c and s and c > s)
        total = sum(1 for c, s in zip(close_arr, sma_arr)
                    if c and s)

        return above / total if total > 0 else 0

    result = [pct_above_ma(i) for i in range(len(data))]
    return result`}
              />

              <Callout type="warning" title="Performance Note">
                &quot;All Datasets&quot; mode loads every dataset in the group into memory.
                For large groups, this may be slow. Consider creating smaller focused groups.
              </Callout>
            </section>

            {/* Dependencies */}
            <section id="indicators-dependencies" className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Dependencies</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Indicators can depend on other indicators. The system automatically detects and manages these dependencies.
              </p>

              <CodeBlock
                title="Using Another Indicator"
                code={`def calculate(data):
    """
    Create buy signal based on MACD crossover.

    Dependency: Requires MACD indicator to be applied first
    """
    dif = data['MACD:DIF']
    dea = data['MACD:DEA']

    # Signal: 1 when DIF crosses above DEA
    signal = np.where(
        (dif > dea) & (dif.shift(1) <= dea.shift(1)),
        1,
        0
    )

    return signal`}
              />

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 mt-8">Auto-Fix Column Renames</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                When you rename an indicator&apos;s output column:
              </p>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li className="flex gap-2">
                  <span className="text-blue-500">1.</span>
                  <span>The system detects which indicators depend on the renamed column</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">2.</span>
                  <span>A confirmation dialog shows affected indicators</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">3.</span>
                  <span>Click &quot;Auto-Fix&quot; to automatically update all references</span>
                </li>
              </ul>
            </section>

            <Divider />

            {/* Backtesting */}
            <section id="backtest" className="mb-16">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Backtesting</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Test trading strategies on historical data with comprehensive performance metrics.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Parameters</h3>
              <Table
                headers={['Parameter', 'Description', 'Default']}
                rows={[
                  ['Initial Capital', 'Starting capital for the backtest', '100,000'],
                  ['Commission', 'Trading commission rate', '0.001 (0.1%)'],
                  ['Execution Mode', 'Same-day close or next-day open', 'Same-day'],
                  ['Max Positions', 'Maximum concurrent positions (portfolio)', '10'],
                  ['Position Size', 'Size per position as fraction of capital', '0.1 (10%)'],
                ]}
              />
            </section>

            {/* Single Stock */}
            <section id="backtest-single" className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Single Stock Strategy</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Return signals: <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">1</code> (buy), <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">-1</code> (sell), <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">0</code> (hold)
              </p>

              <CodeBlock
                title="MA Crossover Strategy"
                code={`def strategy(data):
    """
    Buy when 10-day MA crosses above 30-day MA.
    Sell when 10-day MA crosses below 30-day MA.
    """
    short_ma = data['close'].rolling(10).mean()
    long_ma = data['close'].rolling(30).mean()

    signal = np.where(
        (short_ma > long_ma) & (short_ma.shift(1) <= long_ma.shift(1)),
        1,  # Buy signal
        np.where(
            (short_ma < long_ma) & (short_ma.shift(1) >= long_ma.shift(1)),
            -1,  # Sell signal
            0   # Hold
        )
    )

    return pd.Series(signal, index=data.index)`}
              />
            </section>

            {/* Portfolio */}
            <section id="backtest-portfolio" className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Portfolio Strategy</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Return position sizes: <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">0</code> to <code className="text-sm bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">1</code> representing fraction of allocated capital.
              </p>

              <CodeBlock
                title="Momentum Portfolio"
                code={`def strategy(data):
    """
    Position sizing based on momentum.

    Returns:
        Series with values 0-1 representing position size
    """
    # Calculate 20-day momentum
    momentum = data['close'].pct_change(20)

    # Full position if momentum > 5%, else no position
    position = np.where(momentum > 0.05, 1.0, 0.0)

    return pd.Series(position, index=data.index)`}
              />
            </section>

            {/* Metrics */}
            <section id="backtest-metrics" className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Performance Metrics</h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Return Metrics</h4>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <li>Total Return</li>
                    <li>Annual Return (CAGR)</li>
                    <li>Benchmark Return</li>
                    <li>Alpha / Beta</li>
                  </ul>
                </div>
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Risk Metrics</h4>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <li>Max Drawdown</li>
                    <li>Volatility</li>
                    <li>Sharpe / Sortino / Calmar Ratios</li>
                  </ul>
                </div>
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Trade Metrics</h4>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <li>Win Rate</li>
                    <li>Profit Factor</li>
                    <li>Average Win / Loss</li>
                    <li>Total Trades</li>
                  </ul>
                </div>
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Visual Analysis</h4>
                  <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <li>Equity Curve</li>
                    <li>Drawdown Chart</li>
                    <li>Monthly Returns Heatmap</li>
                    <li>Trade Markers</li>
                  </ul>
                </div>
              </div>
            </section>

            <Divider />

            {/* Datasets */}
            <section id="datasets" className="mb-16">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Datasets</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Manage stock data and organize them into groups for analysis and backtesting.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Required Columns</h3>
              <Table
                headers={['Column', 'Type', 'Description']}
                rows={[
                  ['date', 'Date', 'Trading date (YYYY-MM-DD)'],
                  ['open', 'Float', 'Opening price'],
                  ['high', 'Float', 'High price'],
                  ['low', 'Float', 'Low price'],
                  ['close', 'Float', 'Closing price'],
                  ['volume', 'Float', 'Trading volume (optional)'],
                ]}
              />
            </section>

            {/* Data Sources */}
            <section id="datasets-sources" className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Data Sources</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Import data from various providers or upload your own CSV files.
              </p>

              <Table
                headers={['Source', 'Markets', 'Timeframes']}
                rows={[
                  ['AKShare', 'A-shares, Indices, ETFs', 'Daily, Minute'],
                  ['Yahoo Finance', 'US Stocks, Global Indices', 'Daily'],
                  ['Tushare', 'A-shares, Futures', 'Daily, Minute'],
                  ['CSV Upload', 'Any', 'Any'],
                ]}
              />
            </section>

            {/* Groups */}
            <section id="datasets-groups" className="mb-16">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Groups</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Organize datasets into groups for portfolio backtesting, sector analysis, or as external data sources for indicators.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Use Cases</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li className="flex gap-2">
                  <span className="text-green-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">Portfolio Backtest</strong> — Test strategies across multiple stocks</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">Sector Analysis</strong> — Group stocks by industry</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">External Data</strong> — Reference in indicators using &quot;All&quot; mode</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">Watchlist</strong> — Organize stocks you&apos;re monitoring</span>
                </li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 mt-8">Batch Operations</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li className="flex gap-2">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">Batch Apply</strong> — Apply indicators to multiple datasets</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">Batch Update</strong> — Refresh data for multiple datasets</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-gray-900 dark:text-white">Batch Delete</strong> — Remove multiple datasets</span>
                </li>
              </ul>
            </section>

          </div>
        </main>
      </div>
    </div>
  );
}

// Components

function Divider() {
  return <hr className="border-gray-200 dark:border-gray-800 my-12" />;
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            {headers.map((header, i) => (
              <th key={i} className="text-left py-3 pr-4 font-semibold text-gray-900 dark:text-white">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-800/50">
              {row.map((cell, j) => (
                <td key={j} className={`py-3 pr-4 ${j === 0 ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CodeBlock({ title, code, language = 'python' }: { title: string; code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-6 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
        <button
          onClick={copyToClipboard}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <Highlight theme={themes.nightOwl} code={code.trim()} language={language}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className="p-4 bg-gray-900 dark:bg-gray-950 overflow-x-auto" style={{ ...style, background: undefined }}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function Callout({ type, title, children }: { type: 'info' | 'warning'; title: string; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-900',
    warning: 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-900',
  };

  const iconStyles = {
    info: 'text-blue-500',
    warning: 'text-yellow-500',
  };

  return (
    <div className={`mb-6 p-4 rounded-lg border ${styles[type]}`}>
      <div className="flex gap-3">
        <div className={`flex-shrink-0 ${iconStyles[type]}`}>
          {type === 'info' ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <div>
          <h4 className="font-medium text-gray-900 dark:text-white mb-1">{title}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">{children}</p>
        </div>
      </div>
    </div>
  );
}
