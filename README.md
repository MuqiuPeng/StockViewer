# Stock Viewer

A comprehensive stock analysis platform for Chinese A-share markets with advanced technical indicators, backtesting, and portfolio management capabilities.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Python](https://img.shields.io/badge/Python-3.8+-green)

## Overview

StockViewer is a powerful Next.js application that enables you to:

- 📈 **Analyze** Chinese A-share stocks with professional TradingView charts
- 🔧 **Create** custom technical indicators using Python and the MyTT library
- 🎯 **Backtest** trading strategies with realistic execution simulation
- 📊 **Manage** stock groups and portfolios for batch analysis
- 🔬 **Visualize** OHLC data with synchronized triple-chart layouts

## Key Features

### 📊 Advanced Charting
- Triple synchronized chart layout (candlestick + 2 indicator charts)
- TradingView Lightweight Charts integration
- Real-time crosshair tracking with data panel
- Color-coded indicators with collapsible selectors

### 🔧 Custom Indicators
- Python-based indicator creation with Monaco editor (VS Code)
- MyTT library integration (60+ Chinese technical analysis indicators)
- Automatic dependency detection and topological sorting
- Group indicators with multiple outputs (e.g., MACD → DIF, DEA, MACD)

### 🎯 Backtesting Engine
- Single stock and portfolio backtesting
- Realistic trade execution (same-day close vs next-day open)
- Comprehensive metrics (Sharpe, Sortino, Calmar, max drawdown, etc.)
- Slippage tracking and analysis
- Visual equity curves and trade markers

### 📈 Data Management
- Fetch Chinese A-share data from aktools API
- Auto-update detection with one-click refresh
- Group management for portfolio analysis
- Dataset organization by data source

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Python** 3.8+ with pip
- **aktools** - Chinese stock market data API

### Installation

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd StockViewer
npm install
```

2. **Set up Python environment**
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install pandas numpy
```

3. **Install and run aktools API**
```bash
# Create separate environment for aktools
python -m venv aktools-env
source aktools-env/bin/activate  # Windows: aktools-env\Scripts\activate

# Install aktools
pip install aktools

# Start API server (keep running)
python -m aktools
# Server runs at http://127.0.0.1:8080
```

4. **Create data directories**
```bash
mkdir -p data/csv data/indicators data/strategies data/groups data/python
```

5. **Start development server**
```bash
npm run dev
# Open http://localhost:3000
```

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
3. Choose stock or group
4. Configure parameters and date range
5. Click **"Run Backtest"**
6. Analyze results with metrics, charts, and trade history

### Managing Groups
1. Go to **Datasets** page
2. Click **"Manage Groups"**
3. Create groups and add stocks
4. Use groups for batch backtesting

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
- **Backend**: Next.js API Routes, Node.js
- **Data Processing**: Python 3.8+, pandas, numpy, MyTT library
- **Storage**: CSV files, JSON (no database)

## Project Structure

```
/app
  /api                  # API routes
    /datasets           # Dataset CRUD
    /indicators         # Indicator management
    /strategies         # Strategy management
    /groups             # Group management
    /backtest           # Backtesting engine
  /viewer               # Stock viewer page
  /backtest             # Backtesting page
  /datasets             # Dataset management page
  page.tsx              # Homepage

/components             # React components
  ChartPanel.tsx        # Triple chart display
  BacktestResults.tsx   # Results visualization
  IndicatorManager.tsx  # Indicator CRUD UI
  StrategyManager.tsx   # Strategy CRUD UI
  GroupManager.tsx      # Group management UI

/lib                    # Utilities & business logic
  csv.ts                # CSV operations
  python-executor.ts    # Python subprocess execution
  backtest-executor.ts  # Backtesting orchestration
  indicator-storage.ts  # Indicator persistence
  strategy-storage.ts   # Strategy persistence
  group-storage.ts      # Group persistence

/data                   # Data storage
  /csv                  # Stock CSV files
  /indicators           # indicators.json
  /strategies           # strategies.json
  /groups               # groups.json
  /python               # Python execution scripts
    executor.py         # Indicator calculator
    backtest-executor.py # Backtesting engine
    MyTT.py             # Technical analysis library
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

See individual documentation files for feature-specific troubleshooting.

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
