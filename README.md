# Stock Viewer

A comprehensive stock analysis platform with support for multiple markets (A-shares, B-shares, Hong Kong, US indices, global indices, ETFs, futures), advanced technical indicators, backtesting, and portfolio management capabilities.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Python](https://img.shields.io/badge/Python-3.8+-green)

## Overview

StockViewer is a powerful Next.js application that enables you to:

- 📈 **Analyze** stocks from multiple markets with professional TradingView charts
- 🔧 **Create** custom technical indicators using Python and the MyTT library
- 🎯 **Backtest** trading strategies with realistic execution simulation
- 📊 **Manage** stock groups and portfolios for batch analysis
- 🔬 **Visualize** OHLC data with synchronized charts and real-time pie charts
- 📚 **Track** backtest history with batch management and comparison tools
- ✅ **Validate** data quality with automatic error detection
- 🌙 **Dark mode** support throughout the application

## Recent Improvements

🌙 **Dark Mode Support**
- Complete dark theme implementation across all pages and modals
- Theme toggle with persistence
- Proper hover effects and shadows in both modes

✨ **Enhanced Visualizations**
- Real-time pie charts showing portfolio composition (hover-responsive)
- Stacked area charts always anchored at 0 for better readability
- Visual indicators for stock allocation and cash holdings
- Constant reference lines for charts

🌐 **Multiple Data Sources**
- Support for A-shares, B-shares, Hong Kong, US indices, global indices
- ETFs, LOF funds, futures, and cryptocurrency data
- Multiple timeframes including minute-level data
- Symbol browser with batch add functionality

🔧 **Batch History Management**
- Select multiple backtest runs for bulk operations
- Star/unstar, delete, or compare multiple backtests at once
- Improved search and filtering capabilities

🛡️ **Data Validation & Error Handling**
- Automatic detection of negative or corrupted stock prices
- Smart handling of missing data using last-known prices
- Clear error messages with actionable solutions

⚙️ **Setup Automation**
- One-command setup with `npm run setup`
- Automatic directory structure creation
- Comprehensive setup guide in [SETUP.md](SETUP.md)

## Key Features

### 📊 Advanced Charting
- Triple synchronized chart layout (candlestick + 2 indicator charts)
- TradingView Lightweight Charts integration
- Real-time crosshair tracking with data panel
- Color-coded indicators with collapsible selectors
- Constant reference lines with custom values and labels
- Keyboard navigation with arrow keys and zoom controls
- Dark mode support with theme persistence

### 🔧 Custom Indicators
- Python-based indicator creation with Monaco editor (VS Code)
- MyTT library integration (60+ Chinese technical analysis indicators)
- Automatic dependency detection and topological sorting
- Group indicators with multiple outputs (e.g., MACD → DIF, DEA, MACD)
- External dataset support for cross-stock analysis
- Streaming progress updates when applying to multiple datasets
- Detailed error reporting with line numbers and tracebacks

### 🎯 Backtesting Engine
- **Single stock and portfolio backtesting** with realistic execution
- **Trade execution modes**: Same-day close vs next-day open
- **Comprehensive metrics**: Sharpe, Sortino, Calmar, max drawdown, etc.
- **Visual analysis**: Equity curves, drawdown charts, trade markers
- **Portfolio composition**: Real-time pie charts showing stock/cash allocation
- **Backtest history management**:
  - Auto-save all backtest runs
  - Batch operations (star, delete, compare multiple runs)
  - Search, filter, and organize with notes & tags
  - Re-run historical backtests with original parameters
- **Trade hover details**: See nearest trades when hovering on charts
- **Data validation**: Automatic detection of corrupted or negative price data

### 📈 Data Sources & Management
- **Multiple Markets**: A-shares, B-shares, Hong Kong stocks, CDR, US indices, global indices
- **Additional Assets**: ETFs, LOF funds, futures, cryptocurrency indicators
- **Multiple Timeframes**: Daily data and minute-level data (1/5/15/30/60 min)
- **Multiple Providers**: East Money, Sina Finance, Tencent for redundancy
- Symbol browser with search functionality and batch add support
- Auto-update detection with one-click refresh
- Group management for portfolio analysis
- Dataset organization by data source with custom naming

## Quick Start

**New to this project?** See [SETUP.md](SETUP.md) for detailed installation instructions.

### Fast Setup (5 minutes)

```bash
# 1. Clone and install
git clone <repository-url>
cd StockViewer
npm install

# 2. Run setup script
npm run setup

# 3. Set up Python (in project venv)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install pandas numpy

# 4. Set up AKTools (in separate terminal)
python -m venv aktools-env
source aktools-env/bin/activate
pip install aktools
python -m aktools  # Keep this running

# 5. Start dev server (in main terminal with venv activated)
npm run dev
# Open http://localhost:3000
```

See [SETUP.md](SETUP.md) for troubleshooting and detailed instructions.

## Usage

### Adding Stocks
1. Navigate to **Datasets** page
2. Click **"+ Add Stock"**
3. Enter 6-digit stock code (e.g., `000001`, `600000`)
4. Data fetches automatically with all indicators applied

### Creating Indicators
1. Go to **Viewer** page
2. Click **"Manage Indicators"**
3. Click **"+ Create New Indicator"**
4. Write Python code in Monaco editor
5. Validate and save

### Running Backtests
1. Navigate to **Backtest** page
2. Create or select a trading strategy
3. Choose stock, portfolio, or group
4. Configure parameters and date range
5. Click **"Run Backtest"**
6. Analyze results with metrics, charts, and trade history
7. Results are automatically saved to history

### Managing Backtest History
1. Click **"History"** button to open the history sidebar
2. Browse all past backtest runs with search and filters
3. Star important backtests for quick access
4. Click **"Batch Select"** for multi-select mode:
   - Select multiple backtests with checkboxes
   - Star/unstar selected entries in bulk
   - Delete multiple backtests at once
5. Click on any entry to view detailed results
6. Add notes and tags to organize your backtests
7. Re-run previous backtests with original parameters

### Managing Groups
1. Go to **Datasets** page
2. Click **"Manage Groups"**
3. Create groups and add stocks
4. Use groups for batch backtesting

### Understanding Backtest Visualizations

**Portfolio Composition Over Time**
- Stacked area chart showing how capital is allocated
- Each colored area represents a different stock's value
- Gray area at bottom shows cash holdings
- Always anchored at 0 for easy reading
- Hover to see exact values at any point in time

**Real-Time Pie Charts**
- Shows current portfolio composition
- Automatically updates when hovering over charts
- Displays percentage and value for each holding
- Helps visualize diversification at a glance

**Equity Curves**
- Track total portfolio value over time
- Compare against buy-and-hold strategy
- Identify periods of growth and drawdown
- See the impact of each trade on portfolio value

## Documentation

Comprehensive documentation is organized by topic:

- **[Indicators](docs/INDICATORS.md)** - Custom indicators, MyTT library, dependencies
- **[Backtesting](docs/BACKTESTING.md)** - Strategies, metrics, execution modes, slippage
- **[Charts & Visualization](docs/CHARTS.md)** - Triple chart layout, TradingView integration
- **[Datasets & Groups](docs/DATASETS.md)** - Data management, groups, auto-updates
- **[API Reference](docs/API.md)** - Complete API endpoint documentation
- **[Architecture](docs/ARCHITECTURE.md)** - Technical details, Python integration, data flow

## Technology Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Charts**: TradingView Lightweight Charts
- **Editor**: Monaco Editor (VS Code engine)
- **Theming**: Dark/Light mode with system preference detection
- **Backend**: Next.js API Routes, Node.js
- **Data Processing**: Python 3.8+, pandas, numpy, MyTT library
- **Data Sources**: AKShare API (aktools) for multi-market data
- **Storage**: CSV files, JSON (no database required)

## Project Structure

```
/app
  /api                  # API routes
    /datasets           # Dataset CRUD
    /indicators         # Indicator management
    /strategies         # Strategy management
    /groups             # Group management
    /backtest           # Backtesting engine
    /backtest-history   # Backtest history CRUD & rerun
  /viewer               # Stock viewer page
  /backtest             # Backtesting page
  /datasets             # Dataset management page
  page.tsx              # Homepage

/components             # React components
  ChartPanel.tsx        # Triple chart display
  BacktestResults.tsx   # Results visualization with pie charts
  IndicatorManager.tsx  # Indicator CRUD UI
  StrategyManager.tsx   # Strategy CRUD UI
  GroupManager.tsx      # Group management UI
  BacktestHistorySidebar.tsx      # History sidebar with batch ops
  BacktestHistoryDetailModal.tsx  # History detail/edit modal

/lib                    # Utilities & business logic
  csv.ts                # CSV operations
  python-executor.ts    # Python subprocess execution
  backtest-executor.ts  # Backtesting orchestration
  indicator-storage.ts  # Indicator persistence
  strategy-storage.ts   # Strategy persistence
  group-storage.ts      # Group persistence
  backtest-history-storage.ts  # Backtest history persistence
  dataset-metadata.ts   # Dataset metadata management

/data                   # Data storage
  /csv                  # Stock CSV files
  /indicators           # indicators.json
  /strategies           # strategies.json
  /groups               # groups.json
  /backtest-history     # history.json
  /datasets             # Dataset metadata
  /python               # Python execution scripts
    executor.py         # Indicator calculator
    backtest-executor.py # Backtesting engine with validation
    MyTT.py             # Technical analysis library
    requirements.txt    # Python dependencies

/scripts                # Automation scripts
  setup.js              # Automated project setup
```

## Configuration

Configure via `.env.local`:

```bash
# AKTools API
NEXT_PUBLIC_AKTOOLS_API_URL=http://127.0.0.1:8080

# Python execution
PYTHON_EXECUTABLE=python3
PYTHON_TIMEOUT_MS=300000  # 5 minutes

# Data directories
CSV_DIR=./data/csv
INDICATORS_FILE=./data/indicators/indicators.json
```

See [Architecture](docs/ARCHITECTURE.md) for complete configuration options.

## Security

- Python code validation blocks dangerous imports (`os`, `subprocess`, `eval`, `exec`)
- Process isolation with configurable timeouts
- Sandboxed execution environment
- No file system access from user code

See [Architecture](docs/ARCHITECTURE.md) for security details.

## Troubleshooting

### Python Not Found
```
Error: Python 3 required
```
**Solution**: Install Python 3.8+ and ensure it's in PATH

### AKTools API Connection Failed
```
Error: Failed to fetch stock data
```
**Solution**: Ensure aktools is running at http://127.0.0.1:8080
```bash
source aktools-env/bin/activate
python -m aktools
```

### Indicator Timeout
```
Error: Python execution timeout
```
**Solution**: Increase timeout in `.env.local`:
```bash
PYTHON_TIMEOUT_MS=600000  # 10 minutes
```

### Negative Stock Price Error
```
❌ DATA ERROR: Stock XXX has invalid price (-X.XX) on YYYY-MM-DD
```
**Solution**: The stock data is corrupted. Re-fetch the stock data from the Datasets page:
1. Navigate to **Datasets** page
2. Find the problematic stock
3. Click the refresh/update button
4. Data will be re-downloaded from aktools API

### Backtest Equity Curve Drops Suddenly
**Cause**: Missing stock data for certain dates (trading suspensions, delisting, data gaps)

**Solution**: The system now automatically uses the last known price when data is missing. Check the console for warnings:
```
Warning: Using last known price for XXXXXX on YYYY-MM-DD
```

If you see too many warnings, consider:
- Updating the stock data
- Excluding the problematic stock from your portfolio
- Adjusting your date range to avoid gaps

See [SETUP.md](SETUP.md) and individual documentation files for more troubleshooting.

## Performance Tips

1. **Limit Active Indicators**: Only enable indicators you're viewing
2. **Optimize Python Code**: Use vectorized pandas operations
3. **Batch Operations**: Apply indicators to multiple stocks at once
4. **Close Unused Datasets**: Reduces memory usage

## Contributing

This is a personal project. Feel free to fork and customize for your needs.

## License

MIT License - See LICENSE file for details

## Acknowledgments

- [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- [Next.js](https://nextjs.org/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [pandas](https://pandas.pydata.org/)
- [aktools](https://github.com/akfamily/akshare) - Chinese stock data API
