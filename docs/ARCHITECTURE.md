# Architecture Documentation

Technical guide to StockViewer's architecture, implementation, and design decisions.

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Architecture Layers](#architecture-layers)
- [Python Integration](#python-integration)
- [Data Flow](#data-flow)
- [Storage](#storage)
- [Security](#security)
- [Configuration](#configuration)
- [Performance](#performance)
- [Development](#development)
- [Deployment](#deployment)

## Overview

StockViewer is a full-stack Next.js application with Python backend integration for data processing.

**Architecture Pattern:** Layered Architecture
- Presentation Layer (React components)
- API Layer (Next.js API routes)
- Business Logic Layer (TypeScript modules)
- Python Execution Layer (subprocess)
- Data Storage Layer (CSV/JSON files)

**Key Characteristics:**
- **No Database**: File-based storage (CSV + JSON)
- **Python Subprocess**: Sandboxed Python execution
- **Type-Safe**: Full TypeScript throughout
- **Modular**: Clear separation of concerns
- **Stateless API**: No session management

## Technology Stack

### Frontend

**Core:**
- **Next.js 14**: React framework with App Router
- **React 18**: UI library with hooks
- **TypeScript 5**: Type safety
- **Tailwind CSS**: Utility-first styling

**Libraries:**
- **TradingView Lightweight Charts**: Professional charting
- **Monaco Editor**: VS Code-powered code editor
- **PapaParse**: CSV parsing
- **date-fns**: Date manipulation

### Backend

**Runtime:**
- **Node.js 18+**: JavaScript runtime
- **Next.js API Routes**: RESTful endpoints

**Data Processing:**
- **Python 3.8+**: Indicator/strategy execution
- **pandas**: DataFrame operations
- **numpy**: Numerical computing
- **MyTT**: Chinese technical analysis library

**Storage:**
- **CSV Files**: Stock data and indicators
- **JSON Files**: Indicators, strategies, groups
- **File System**: No database

### Development

- **ESLint**: Code linting
- **Prettier**: Code formatting (optional)
- **Git**: Version control

## Project Structure

```
/app                          # Next.js App Router
  /api                        # API routes
    /datasets                 # Dataset CRUD endpoints
      route.ts                # GET /api/datasets
      /[name]/route.ts        # GET /api/dataset/[name]
    /add-stock/route.ts       # POST /api/add-stock
    /indicators               # Indicator management
      route.ts                # GET, POST /api/indicators
      /[id]/route.ts          # GET, PUT, DELETE /api/indicators/[id]
    /apply-indicator/route.ts # POST /api/apply-indicator
    /validate-indicator/route.ts # POST /api/validate-indicator
    /strategies               # Strategy management
      route.ts                # GET, POST /api/strategies
      /[id]/route.ts          # GET, PUT, DELETE /api/strategies/[id]
    /validate-strategy/route.ts # POST /api/validate-strategy
    /groups                   # Group management
      route.ts                # GET, POST, PUT, DELETE /api/groups
      /[id]/route.ts          # GET /api/groups/[id]
    /backtest/route.ts        # POST /api/backtest

  /viewer/page.tsx            # Stock viewer page
  /backtest/page.tsx          # Backtesting page
  /datasets/page.tsx          # Dataset management page
  page.tsx                    # Homepage
  layout.tsx                  # Root layout
  globals.css                 # Global styles

/components                   # React components
  AddStockModal.tsx           # Add stock UI
  ApplyIndicatorModal.tsx     # Apply indicator UI
  BacktestPage.tsx            # Backtest page container
  BacktestPanel.tsx           # Backtest configuration
  BacktestResults.tsx         # Results visualization
  ChartPanel.tsx              # Triple chart display
  DataPanel.tsx               # OHLC + indicator values
  DatasetManagement.tsx       # Dataset list and management
  GroupEditorModal.tsx        # Group edit UI
  GroupManager.tsx            # Group CRUD UI
  IndicatorEditorModal.tsx    # Indicator code editor
  IndicatorManager.tsx        # Indicator CRUD UI
  IndicatorSelector.tsx       # Chart indicator picker
  RunBacktestModal.tsx        # Backtest configuration modal
  StockDashboard.tsx          # Main viewer dashboard
  StrategyEditorModal.tsx     # Strategy code editor
  StrategyManager.tsx         # Strategy CRUD UI

/lib                          # Business logic and utilities
  backtest-executor.ts        # Backtest orchestration
  csv.ts                      # CSV file operations
  csv-updater.ts              # Add columns to CSV files
  datasets.ts                 # Dataset metadata extraction
  detect-dependencies.ts      # Indicator dependency detection
  env.ts                      # Centralized configuration
  group-storage.ts            # Group persistence
  indicator-dependencies.ts   # Dependency graph management
  indicator-storage.ts        # Indicator CRUD operations
  indicator-validator.ts      # Indicator code validation
  python-executor.ts          # Python subprocess execution
  strategy-storage.ts         # Strategy CRUD operations

/data                         # Data storage
  /csv                        # Stock CSV files
    {symbol}_{datasource}.csv
  /indicators
    indicators.json           # Indicator definitions
  /strategies
    strategies.json           # Strategy definitions
  /groups
    groups.json               # Group definitions
  /python                     # Python execution scripts
    executor.py               # Indicator calculator
    backtest-executor.py      # Backtest engine
    MyTT.py                   # Technical analysis library

/public                       # Static assets

/node_modules                 # Node.js dependencies

package.json                  # Node.js dependencies
tsconfig.json                 # TypeScript configuration
next.config.js                # Next.js configuration
tailwind.config.js            # Tailwind CSS configuration
.env.local                    # Environment variables (not committed)
```

## Architecture Layers

### 1. Presentation Layer

**Components** (`/components/`)

Responsibilities:
- Render UI elements
- Handle user interactions
- Manage local state
- Call API endpoints
- Display loading/error states

**Example Flow:**
```typescript
// User clicks "Create Indicator" button
// → IndicatorEditorModal component
// → Validates input
// → Calls POST /api/indicators
// → Shows success/error message
// → Refreshes indicator list
```

**Design Patterns:**
- React hooks for state management
- Controlled components for forms
- Composition over inheritance
- Props for component configuration

### 2. API Layer

**Next.js API Routes** (`/app/api/`)

Responsibilities:
- Handle HTTP requests
- Validate parameters
- Call business logic layer
- Return JSON responses
- Handle errors

**Example:**
```typescript
// app/api/indicators/route.ts
export async function POST(request: Request) {
  const body = await request.json()

  // Validate
  if (!body.name || !body.pythonCode) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    )
  }

  // Call business logic
  const indicator = await createIndicator(body)

  return NextResponse.json({ success: true, indicator })
}
```

**Conventions:**
- Use Next.js 14 App Router conventions
- Return `NextResponse.json()`
- Status codes: 200 (OK), 201 (Created), 400 (Bad Request), 404 (Not Found), 500 (Error)
- Consistent error format

### 3. Business Logic Layer

**TypeScript Modules** (`/lib/`)

Responsibilities:
- Core business logic
- File system operations
- Data validation
- Dependency resolution
- Python subprocess management

**Modules:**

**csv.ts**: CSV file operations
- `readCSV(filepath)`: Parse CSV to array
- `getCSVMetadata(filepath)`: Extract metadata
- `listCSVFiles()`: List all CSVs

**indicator-storage.ts**: Indicator CRUD
- `getIndicators()`: Load all indicators
- `createIndicator(data)`: Create new indicator
- `updateIndicator(id, data)`: Update indicator
- `deleteIndicator(id)`: Delete indicator

**python-executor.ts**: Python subprocess
- `executePython(script, data)`: Run Python code
- Spawn process, send stdin, read stdout
- Timeout handling
- Error capture

**detect-dependencies.ts**: Dependency analysis
- `detectDependencies(code)`: Parse code for column references
- Regex-based detection
- Group indicator support

### 4. Python Execution Layer

**Python Scripts** (`/data/python/`)

Responsibilities:
- Execute user code in sandboxed environment
- Calculate indicators
- Generate trading signals
- Run backtests

**executor.py**: Indicator calculator
```python
# Read JSON from stdin
input_data = json.load(sys.stdin)

# Execute user code
exec(user_code, namespace)

# Call calculate function
result = namespace['calculate'](df)

# Return JSON to stdout
print(json.dumps({'success': True, 'values': result.tolist()}))
```

**backtest-executor.py**: Backtesting engine
```python
# Read backtest config from stdin
config = json.load(sys.stdin)

# Execute strategy to get signals
signals = execute_strategy(df, strategy_code, parameters)

# Run backtest simulation
metrics, equity, trades = manual_backtest(df, signals, initial_cash, commission)

# Return results to stdout
print(json.dumps({
  'success': True,
  'metrics': metrics,
  'equityCurve': equity,
  'tradeMarkers': trades
}))
```

**MyTT.py**: Technical analysis library
- 60+ indicator functions
- Pure Python implementation
- Numpy-based calculations

### 5. Data Storage Layer

**File System** (`/data/`)

**CSV Files** (`/data/csv/`):
- Stock OHLC data
- Calculated indicators
- Format: `{symbol}_{datasource}.csv`
- Columns: date, open, high, low, close, volume, [indicators]

**JSON Files**:
- `/data/indicators/indicators.json`: Indicator definitions
- `/data/strategies/strategies.json`: Strategy definitions
- `/data/groups/groups.json`: Group definitions

**File Operations:**
- Read: `fs.readFileSync()`, `fs.promises.readFile()`
- Write: `fs.writeFileSync()`, `fs.promises.writeFile()`
- Delete: `fs.unlinkSync()`, `fs.promises.unlink()`
- List: `fs.readdirSync()`, `fs.promises.readdir()`

## Python Integration

### Subprocess Execution

**python-executor.ts:**
```typescript
import { spawn } from 'child_process'

export async function executePython(
  scriptPath: string,
  inputData: any
): Promise<any> {
  return new Promise((resolve, reject) => {
    // Spawn Python process
    const pythonProcess = spawn(pythonExecutable, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    // Capture output
    pythonProcess.stdout.on('data', data => {
      stdout += data.toString()
    })

    pythonProcess.stderr.on('data', data => {
      stderr += data.toString()
    })

    // Handle completion
    pythonProcess.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr || 'Python execution failed'))
      } else {
        resolve(JSON.parse(stdout))
      }
    })

    // Send input via stdin
    pythonProcess.stdin.write(JSON.stringify(inputData))
    pythonProcess.stdin.end()

    // Timeout
    setTimeout(() => {
      pythonProcess.kill()
      reject(new Error('Python execution timeout'))
    }, TIMEOUT_MS)
  })
}
```

### Python Executable Detection

**Preference Order:**
1. Environment variable: `PYTHON_EXECUTABLE`
2. Local venv: `./venv/bin/python` (or `./venv/Scripts/python.exe` on Windows)
3. System Python: `python3`

**Code:**
```typescript
// lib/env.ts
export const PYTHON_CONFIG = {
  EXECUTABLE: process.env.PYTHON_EXECUTABLE || 'python3',
  TIMEOUT_MS: parseInt(process.env.PYTHON_TIMEOUT_MS || '300000')
}

// python-executor.ts
function getPythonExecutable(): string {
  if (PYTHON_CONFIG.EXECUTABLE !== 'python3') {
    return PYTHON_CONFIG.EXECUTABLE
  }

  const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python')
  if (existsSync(venvPython)) {
    return venvPython
  }

  return 'python3'
}
```

### Data Exchange Format

**TypeScript → Python:**
```json
{
  "code": "def calculate(data):\n    return data['close'].rolling(20).mean()",
  "data": [
    {"date": "2024-01-01", "open": 10.0, "close": 10.2},
    {"date": "2024-01-02", "open": 10.2, "close": 10.5}
  ],
  "parameters": {"window": 20}
}
```

**Python → TypeScript:**
```json
{
  "success": true,
  "values": [10.1, 10.3, 10.5],
  "metadata": {}
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "KeyError: 'SMA_20'",
  "traceback": "Traceback (most recent call last):\n  ..."
}
```

## Data Flow

### Adding a Stock

```
User Input (symbol)
  → AddStockModal component
  → POST /api/add-stock
    → Fetch from aktools API
    → Save to CSV (/data/csv/{symbol}_{source}.csv)
    → Load all indicators (indicator-storage.ts)
    → For each indicator (in dependency order):
      → python-executor.ts
        → spawn Python
        → executor.py
        → execute indicator code
        → return values
      → csv-updater.ts
        → add column to CSV
    → Return success
  → Refresh dataset list
  → Show success message
```

### Creating an Indicator

```
User Code
  → IndicatorEditorModal component
  → Click "Validate"
    → POST /api/validate-indicator
      → indicator-validator.ts
        → Check dangerous imports
        → Check function signature
      → python-executor.ts
        → Run on sample data
      → Return validation result
  → Click "Create"
    → POST /api/indicators
      → detect-dependencies.ts
        → Parse code for column references
        → Extract dependencies
      → indicator-storage.ts
        → Add to indicators.json
        → Save file
      → Return indicator
  → User selects stocks
    → POST /api/apply-indicator
      → For each stock:
        → Load CSV
        → python-executor.ts
          → execute indicator
        → csv-updater.ts
          → add column
        → Save CSV
  → Show success message
```

### Running a Backtest

```
User Config
  → RunBacktestModal component
  → POST /api/backtest
    → strategy-storage.ts
      → Load strategy code
    → csv.ts
      → Load dataset(s)
    → Optional: Filter by date range
    → backtest-executor.ts
      → spawn Python
        → backtest-executor.py
          → Execute strategy → signals
          → Run manual backtest
          → Calculate metrics
          → Return results
    → Return to frontend
  → BacktestResults component
    → Display metrics
    → Render equity curve
    → Show trade markers
    → Display trade history
```

### Viewing Charts

```
User selects dataset
  → StockDashboard component
  → GET /api/dataset/[name]
    → csv.ts
      → Read CSV file
      → Parse with PapaParse
      → Return data + columns
  → ChartPanel component
    → Create candlestick chart (TradingView)
    → Create indicator chart 1
    → Create indicator chart 2
    → Add data series
    → Sync charts
  → User hovers
    → Crosshair updates
    → DataPanel shows values
```

## Storage

### CSV Storage

**Location:** `/data/csv/`

**Filename Convention:**
- With datasource: `{symbol}_{datasource}.csv`
- Without: `{symbol}.csv`
- Example: `000001_stock_zh_a_hist.csv`

**Structure:**
```csv
date,open,high,low,close,volume,turnover,amplitude,change_pct,change_amount,turnover_rate,SMA_20,RSI_14
2024-01-01,10.0,10.5,9.8,10.2,1000000,10200000,7.0,2.0,0.2,0.5,10.15,65.5
```

**Operations:**
- Read: PapaParse (`Papa.parse()`)
- Write: Serialize and `fs.writeFile()`
- Update: Read → Modify → Write (no in-place update)
- Delete: `fs.unlink()`

### JSON Storage

**Indicators** (`/data/indicators/indicators.json`):
```json
{
  "indicators": [
    {
      "id": "uuid",
      "name": "SMA_20",
      "pythonCode": "...",
      "outputColumn": "SMA_20",
      "dependencies": [],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Strategies** (`/data/strategies/strategies.json`):
```json
{
  "strategies": [
    {
      "id": "uuid",
      "name": "MACD Crossover",
      "pythonCode": "...",
      "parameters": {},
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Groups** (`/data/groups/groups.json`):
```json
{
  "groups": [
    {
      "id": "group_timestamp_random",
      "name": "Tech Stocks",
      "datasetNames": ["000001.csv"],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Operations:**
- Read: `JSON.parse(fs.readFileSync())`
- Write: `fs.writeFileSync(JSON.stringify(data, null, 2))`
- Update: Read → Modify → Write (atomic)

## Security

### Python Code Validation

**Blocked Imports:**
```python
os, sys, subprocess, eval, exec, open, __import__,
compile, globals, locals, vars, dir, getattr, setattr,
delattr, input, raw_input
```

**Validation Process:**
1. Check for dangerous imports (regex)
2. Check for blocked functions (`eval(`, `exec(`)
3. Verify `calculate` function exists
4. Test execution on sample data

**Code:**
```typescript
// lib/indicator-validator.ts
const DANGEROUS_IMPORTS = ['os', 'sys', 'subprocess', ...]

function validateIndicatorCode(code: string): boolean {
  for (const dangerous of DANGEROUS_IMPORTS) {
    const regex = new RegExp(
      `(import\\s+${dangerous}|from\\s+${dangerous}|${dangerous}\\()`,
      'i'
    )
    if (regex.test(code)) {
      throw new Error(`Dangerous import detected: ${dangerous}`)
    }
  }

  if (!code.includes('def calculate(')) {
    throw new Error('Missing calculate function')
  }

  return true
}
```

### Process Isolation

**Sandboxing:**
- Python runs in separate child process
- Limited namespace (only `pd`, `np`, `MyTT`)
- No file system access from user code
- No network access
- Timeout protection

**Namespace:**
```python
namespace = {
  'pd': pd,
  'np': np,
  'data': df,
  'parameters': params,
  # MyTT functions available globally
}

exec(user_code, namespace)
result = namespace['calculate'](df, params)
```

### Timeout Protection

- Default: 5 minutes (300,000 ms)
- Configurable via `PYTHON_TIMEOUT_MS`
- Process killed on timeout
- Error returned to user

## Configuration

### Environment Variables

**Location:** `.env.local` (not committed)

**Available Variables:**

**API Configuration:**
```bash
NEXT_PUBLIC_AKTOOLS_API_URL=http://127.0.0.1:8080
```

**Python Execution:**
```bash
PYTHON_EXECUTABLE=/usr/local/bin/python3
PYTHON_TIMEOUT_MS=300000  # 5 minutes
```

**Data Storage:**
```bash
CSV_DIR=./data/csv
MAX_CSV_SIZE_MB=50
INDICATORS_FILE=./data/indicators/indicators.json
```

**Development:**
```bash
DEBUG=true
LOG_LEVEL=info  # error, warn, info, debug
LOG_DIR=./logs
```

### Centralized Config Module

**lib/env.ts:**
```typescript
export const API_CONFIG = {
  AKTOOLS_URL: process.env.NEXT_PUBLIC_AKTOOLS_API_URL || 'http://127.0.0.1:8080',
}

export const PYTHON_CONFIG = {
  EXECUTABLE: process.env.PYTHON_EXECUTABLE || 'python3',
  TIMEOUT_MS: parseInt(process.env.PYTHON_TIMEOUT_MS || '300000'),
}

export const DATA_CONFIG = {
  CSV_DIR: process.env.CSV_DIR || path.join(process.cwd(), 'data', 'csv'),
  MAX_CSV_SIZE_MB: parseInt(process.env.MAX_CSV_SIZE_MB || '50'),
  INDICATORS_FILE: process.env.INDICATORS_FILE ||
    path.join(process.cwd(), 'data', 'indicators', 'indicators.json'),
}
```

**Usage:**
```typescript
import { PYTHON_CONFIG } from '@/lib/env'

const timeout = setTimeout(() => {
  process.kill()
}, PYTHON_CONFIG.TIMEOUT_MS)
```

## Performance

### Optimization Strategies

**1. Indicator Calculation:**
- Vectorized operations (pandas, numpy)
- Avoid Python loops
- Cache intermediate results
- Parallel execution (future)

**2. CSV Operations:**
- Stream large files (future)
- Lazy loading (load on demand)
- Pagination for large datasets

**3. Chart Rendering:**
- Limit visible indicators (3-5 per chart)
- Use TradingView's built-in optimizations
- Debounce crosshair updates

**4. API Responses:**
- Minimize data transferred
- Compress responses (future)
- Cache frequently accessed data

### Bottlenecks

**Known Performance Issues:**

1. **Large CSV Files:**
   - Reading/parsing 10MB+ CSVs is slow
   - Mitigation: Use date range filtering

2. **Python Subprocess:**
   - Spawning process has overhead (~100ms)
   - Mitigation: Batch operations when possible

3. **Indicator Application:**
   - Applying to many stocks takes time
   - Mitigation: Show progress, allow cancellation

4. **Group Backtests:**
   - Sequential execution (no parallelism)
   - Mitigation: Future parallel execution

## Development

### Getting Started

1. **Clone repository**
```bash
git clone <repo-url>
cd StockViewer
```

2. **Install dependencies**
```bash
npm install
pip install pandas numpy
```

3. **Create data directories**
```bash
mkdir -p data/csv data/indicators data/strategies data/groups data/python
```

4. **Start development**
```bash
# Terminal 1: AKTools API
python -m aktools

# Terminal 2: Next.js dev server
npm run dev
```

### Development Workflow

1. **Create feature branch**
```bash
git checkout -b feature/new-feature
```

2. **Make changes**
- Edit components, API routes, lib modules
- Add TypeScript types
- Follow existing patterns

3. **Test locally**
- Run `npm run dev`
- Test in browser
- Check console for errors

4. **Build**
```bash
npm run build
```

5. **Commit and push**
```bash
git add .
git commit -m "Add new feature"
git push origin feature/new-feature
```

### Code Conventions

**TypeScript:**
- Use interfaces for data structures
- Prefer `async/await` over `.then()`
- Use `const` over `let`
- Explicit return types for functions

**React:**
- Functional components only
- Hooks for state management
- Props destructuring
- Meaningful component names

**API Routes:**
- Validate all inputs
- Consistent error format
- Use appropriate status codes
- Handle errors gracefully

**Python:**
- Follow PEP 8
- Use type hints where possible
- Docstrings for functions
- Return JSON to stdout

## Deployment

### Production Build

```bash
npm run build
npm start
```

### Environment Setup

1. **Production `.env.local`:**
```bash
NEXT_PUBLIC_AKTOOLS_API_URL=http://production-api:8080
PYTHON_EXECUTABLE=/usr/bin/python3
PYTHON_TIMEOUT_MS=600000
```

2. **Python Dependencies:**
```bash
pip install pandas numpy
# Copy MyTT.py to data/python/
```

3. **Data Directories:**
```bash
mkdir -p data/{csv,indicators,strategies,groups,python}
chmod 755 data
```

### Deployment Options

**1. Docker (Recommended):**

```dockerfile
FROM node:18-alpine

# Install Python
RUN apk add --no-cache python3 py3-pip

# Install Python deps
RUN pip3 install pandas numpy

# Copy app
WORKDIR /app
COPY . .

# Install Node deps
RUN npm install
RUN npm run build

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]
```

**2. VPS:**
- Install Node.js 18+
- Install Python 3.8+
- Install dependencies
- Run with PM2:
  ```bash
  pm2 start npm --name "stockviewer" -- start
  ```

**3. Serverless:**
- Not recommended (Python subprocess doesn't work well)
- Consider separating Python execution to Lambda/Cloud Functions

### Monitoring

**Logging:**
```typescript
// lib/logger.ts
export function log(level: string, message: string, data?: any) {
  if (DEBUG) {
    console.log(`[${level}] ${message}`, data)
  }
  // Future: Write to file, send to logging service
}
```

**Health Check:**
```typescript
// app/api/health/route.ts
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
}
```

**Error Tracking:**
- Console errors in development
- Future: Sentry, LogRocket, etc.

## Next Steps

- **[Indicators](INDICATORS.md)** - Learn about indicator system
- **[Backtesting](BACKTESTING.md)** - Understand backtesting engine
- **[API Reference](API.md)** - Complete API documentation
- **[Datasets & Groups](DATASETS.md)** - Data management details

---

**Questions?** Check the other documentation files or review the code in `/lib/` for implementation details.
