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

### 本地开发

全部以原生进程运行：Next.js、Python 数据服务和一个项目本地的 PostgreSQL。

```bash
# 1. 依赖
git clone <repository-url>
cd StockViewer
npm install

# 2. Python 环境（data-service 与指标/回测执行器共用）
python3 -m venv python-venv
./python-venv/bin/pip install -r data-service/requirements.txt
./python-venv/bin/pip install -r data/python/requirements.txt

# 3. 项目本地的 PostgreSQL 16
initdb -D .pgdata --encoding=UTF8 --locale=C
pg_ctl -D .pgdata -l .pgdata/server.log start
createdb stockviewer

# 4. 环境变量：复制模板，按其中注释逐个生成密钥
cp .env.local.example .env.local

# 5. 建表并创建管理员
npx prisma migrate deploy
npx tsx scripts/create-admin.ts <email> <password>

# 6. 启动数据服务
cd data-service && ../python-venv/bin/python -m app

# 7. 另开一个终端启动 web
npm run dev
# 访问 http://localhost:3000
```

两个服务也已注册在 local runtime 的 `dev` stack 里，可以一次性拉起。

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
- **Data Service**: Python FastAPI，多 provider 路由（独立服务）
- **Data Processing**: Python 3.8+, pandas, numpy, MyTT library
- **Database**: PostgreSQL 16 (用户、团队、数据集管理)
- **Deployment**: 单机运行，局域网访问

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     web      │────▶│ data-service │     │  PostgreSQL  │
│   (Next.js)  │     │   (FastAPI)  │     │  (项目本地)   │
│    :3000     │     │    :8000     │     │              │
└──────┬───────┘     └──────────────┘     └──────────────┘
       │                                          ▲
       └──────────────────────────────────────────┘
```

| 服务 | 端口 | 用途 | 启动 |
|------|------|------|------|
| **web** | 3000 | Next.js 主应用，局域网可访问 | `npm run dev` |
| **data-service** | 8000 | Python 数据服务，仅回环 | `python -m app` |
| **db** | 5432 | PostgreSQL，数据存于 `.pgdata/` | `pg_ctl start` |

data-service 只监听回环，由 web 服务端调用并携带 `DATA_SERVICE_TOKEN`；
浏览器不直接访问它。

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

## Data Folder Setup

**Important**: Before using StockViewer, you need to set up a folder for your CSV stock data files.

### Default Setup (Recommended for First-Time Users)

The application will automatically use `{project_root}/data/csv` as the default data folder. This folder is created automatically when you run `npm run setup`.

```bash
# Verify the data folder exists
ls data/csv
```

### Custom Data Folder

If you have existing stock CSV files in another location, configure the path in `.env.local`:

```bash
# Point to your existing CSV data folder
CSV_DATA_PATH=/path/to/your/stock-data
```

### Data Folder Structure

Your CSV data folder should contain stock CSV files with OHLC data:
- Files should have headers: `date`, `open`, `high`, `low`, `close`, `volume`
- Date format: `YYYY-MM-DD`
- One file per stock (e.g., `000001.csv`, `600519.csv`)

Example CSV format:
```csv
date,open,high,low,close,volume
2024-01-02,10.50,10.80,10.40,10.75,1234567
2024-01-03,10.75,11.00,10.60,10.90,2345678
```

### Storage Architecture

| Data Type | Storage Location |
|-----------|------------------|
| CSV files | Local folder (`CSV_DATA_PATH`) - shared |
| Indicators | Server database (per-user in database mode) |
| Strategies | Server database (per-user in database mode) |
| Dataset metadata | Server database (for restoration if files deleted) |

## Configuration

配置写在 `.env.local`（也可用 `.env`，两个文件 web 与 data-service 都会读取）：

```bash
# Data Service (股票数据服务)
DATA_SERVICE_URL=http://localhost:8000
DATA_SERVICE_TIMEOUT_MS=60000
DATA_SERVICE_RETRIES=2

# Python execution (指标计算)
PYTHON_EXECUTABLE=python3
PYTHON_TIMEOUT_MS=300000  # 5 minutes

# Storage mode: local | online | database
NEXT_PUBLIC_STORAGE_MODE=database

# Database (database 模式必需)
DATABASE_URL=postgresql://user:pass@localhost:5432/stockviewer

# Authentication (database 模式必需)
AUTH_SECRET=

# 服务间共享密钥，三者都必须生成 (openssl rand -hex 32)
DATA_SERVICE_TOKEN=
LOG_INGEST_SECRET=
CRON_SECRET=

# 加密数据库中存储的 provider API key (openssl rand -base64 32)
CREDENTIAL_ENCRYPTION_KEY=
```

完整清单见 [.env.local.example](.env.local.example)，其中每个密钥都附了生成命令。
其余配置项见 [Architecture](docs/ARCHITECTURE.md)。

## Security

用户编写的策略与指标是被真正执行的 Python，这是产品功能而非缺陷。因此这里
描述的是「它执行时能碰到什么」，并区分哪些是边界、哪些只是防手滑。

**边界（内核强制）**

- macOS 用 `sandbox-exec`，Linux 用 `bubblewrap`；两者都在启动时探测一次，
  确认「拒绝确实生效」后才启用，失败则降级并明确记录
- 阻止读取 `.env`、`.pgdata`、`.git`、`~/.ssh`、`~/.aws` 等，并禁用网络
- 子进程只获得白名单环境变量，不继承服务端环境

**尽力而为（非边界）**

- CPython 审计钩子作为全平台地板，拦截受保护路径的读取与枚举、子进程和网络。
  它在被约束的进程内部，`ctypes` 可以绕过——而 `ctypes` 无法禁用，因为 numpy
  导入时即调用它。这一层不应被当作沙箱
- 保存指标时以正则检查 `os`、`subprocess`、`eval` 等字样。这能挡住误用，
  挡不住刻意绕过

**资源**

- 并发执行数受信号量限制，队列超时返回 503
- 每次执行有可配置的超时上限

发布前可运行 `./scripts/check-repo-clean.sh` 确认仓库未携带任何密钥或数据。

See [Architecture](docs/ARCHITECTURE.md) for security details.

## Troubleshooting

### Data Service 连接失败
```
Error: Failed to fetch stock data
```
**Solution**: 确保 data-service 正在运行
```bash
cd data-service && ../python-venv/bin/python -m app
curl http://localhost:8000/api/v1/health
```

### Python Not Found
```
Error: Python 3 required
```
**Solution**: Install Python 3.8+ and ensure it's in PATH

### Indicator Timeout
```
Error: Python execution timeout
```
**Solution**: Increase timeout in `.env.local`:
```bash
PYTHON_TIMEOUT_MS=600000  # 10 minutes
```

### Database Connection Failed
```
Error: Can't reach database server
```
**Solution**: 检查 `.env.local` 里的 `DATABASE_URL` 是否指向可达的托管数据库

### Backtest Equity Curve Drops Suddenly
**Cause**: Missing stock data for certain dates (trading suspensions, delisting, data gaps)

**Solution**: The system now automatically uses the last known price when data is missing. Check the console for warnings.

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
- [FastAPI](https://fastapi.tiangolo.com/)
- [pandas](https://pandas.pydata.org/)
