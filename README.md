# Stock Viewer

A comprehensive stock analysis dashboard built with Next.js that displays real-time Chinese A-share stock data with custom technical indicators and advanced charting capabilities.

## Features

### 📈 Stock Data Management
- **Add Stocks**: Fetch Chinese A-share stock data from local API (requires 6-digit stock code)
- **Automatic Updates**: Detects outdated data and provides one-click update functionality
- **Historical Data**: Fetches complete historical data (from 1900-01-01 to present)
- **Smart Detection**: Compares local data with API to detect when updates are needed
- **Multiple Data Sources**: Support for different data APIs (stock_zh_a_hist, etc.)

### 📊 Advanced Charting
- **Triple Chart Layout**:
  - Candlestick chart for OHLC data
  - Two separate indicator charts for custom technical analysis
- **TradingView Integration**: Professional-grade charts using TradingView Lightweight Charts
- **Synchronized Navigation**: All three charts sync time ranges automatically
- **Compact Display**: Optimized layout to view all charts simultaneously
- **Color Consistency**: Unified color scheme across all charts and selectors

### 🔧 Custom Python Indicators
- **Dual Indicator Modes**:
  - **Custom Python**: Single indicator with user-defined calculation
  - **MyTT Library Group**: Multiple related indicators from one calculation (e.g., MACD → DIF, DEA, MACD)
- **Indicator Manager**: Full CRUD interface for creating and managing custom indicators
- **Python Execution**: Write Python code to calculate custom technical indicators with MyTT library support
- **Professional Code Editor** (Monaco Editor - same as VS Code):
  - Full Python syntax highlighting with color coding
  - Line numbers and code folding
  - IntelliSense autocomplete and parameter hints
  - Real-time syntax checking with error markers
  - Minimap for code overview
  - Auto-indentation and bracket matching
  - Find/replace, multi-cursor editing
  - Format on paste/type
  - File upload for .py files
  - Code validation before saving
  - Expandable syntax help with examples
- **MyTT Library Integration**:
  - Built-in Chinese technical analysis library
  - 60+ indicator functions (MACD, KDJ, RSI, BOLL, etc.)
  - Group indicators return dict of multiple outputs
  - Stored as `groupName:indicatorName` columns (e.g., `MACD:DIF`)
- **Dependencies**:
  - Automatic dependency detection (indicators can use other indicators)
  - Support for group indicator column references (`MACD:DIF`)
  - Topological sorting ensures correct calculation order
  - Cascade deletion warnings when removing indicators with dependents
- **Auto-Apply**: Automatically applies all indicators when adding/updating stocks
- **Persistent Storage**: Indicators saved in JSON format and calculated values stored in CSV

### 🎯 Indicator Selection
- **Dual Selectors**: Independent indicator selection for each of the two indicator charts
- **Collapsible UI**: Minimize selectors to maximize chart space
- **Color-Coded Badges**: Visual indicator status with consistent color mapping
- **Base Indicators**: Access to volume, turnover, amplitude, change_pct, change_amount, turnover_rate
- **Smart Filtering**: Only shows available indicators (base + custom defined)

### 📋 Data Panel
- **Real-time Values**: Shows current OHLC values at crosshair position
- **Indicator Values**: Displays all enabled indicator values
- **Color Coding**: Matches chart line colors for easy identification
- **Hover Tracking**: Synchronized across all three charts

### 🔒 Security Features
- **Python Code Validation**: Blocks dangerous imports and functions (os, subprocess, eval, exec)
- **Process Isolation**: Python execution in separate child processes
- **Timeout Protection**: 5-minute timeout for indicator calculations
- **Safe Namespace**: Only pandas, numpy, and data exposed to user code

## Prerequisites

### Required Software
- **Node.js** 18+
- **Python 3.8+** with pip and virtualenv (pyenv recommended)
- **aktools** - Chinese stock market data API library

### Python Dependencies
The project requires two separate Python environments:

#### 1. AKTools API (for stock data fetching)
```bash
# Create a virtual environment for aktools
python -m venv aktools-env
source aktools-env/bin/activate  # On Windows: aktools-env\Scripts\activate

# Install aktools
pip install aktools
```

#### 2. Indicator Calculation (for custom indicators)
```bash
pip install pandas>=2.0.0 numpy>=1.24.0
```

## Setup

### 1. Install Node Dependencies
```bash
npm install
```

### 2. Create Data Directories
```bash
mkdir -p data/csv
mkdir -p data/indicators
mkdir -p data/python
```

### 3. Set Up Python Environment
Create `/data/python/requirements.txt`:
```txt
pandas>=2.0.0
numpy>=1.24.0
```

Install Python dependencies:
```bash
cd data/python
pip install -r requirements.txt
```

### 4. Configure Environment (Optional)
Create `.env.local` to customize settings:
```bash
CSV_DIR=/path/to/your/csv/files
```

### 5. Start AKTools API Server
The application requires the aktools API server running locally:

```bash
# Activate the aktools virtual environment
source aktools-env/bin/activate  # On Windows: aktools-env\Scripts\activate

# Start the API server on 127.0.0.1:8080
python -m aktools
```

The server provides the following endpoint for fetching Chinese A-share stock data:
```
GET http://127.0.0.1:8080/api/public/stock_zh_a_hist?symbol={6-digit-code}&start_date={YYYYMMDD}&end_date={YYYYMMDD}&adjust=qfq
```

**Note:** Keep this terminal running while using the application. The API must be accessible at `http://127.0.0.1:8080`.

## Running the Application

### Quick Start (3 terminals needed)

**Terminal 1: AKTools API Server**
```bash
source aktools-env/bin/activate
python -m aktools
# Keep running - provides stock data at http://127.0.0.1:8080
```

**Terminal 2: Next.js Development Server**
```bash
npm run dev
# Open http://localhost:3000
```

### Development Mode
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

**Prerequisites:** Ensure aktools API is running on `http://127.0.0.1:8080` before starting the Next.js server.

### Production Build
```bash
npm run build
npm start
```

**Prerequisites:** Ensure aktools API is running before starting production server.

## Usage Guide

### Adding Stocks
1. Click **"+ Add Stock"** button
2. Enter a 6-digit Chinese stock code (e.g., 000001, 600000)
3. Data is automatically fetched and all indicators are applied
4. Stock appears in the dataset dropdown

### Creating Custom Indicators

#### Example 1: Simple Moving Average (SMA)
```python
def calculate(data):
    """
    Calculate 20-day Simple Moving Average

    Args:
        data: pandas DataFrame with columns:
            - date, open, high, low, close, volume
            - All previously calculated indicators

    Returns:
        pandas Series of same length as data
    """
    return data['close'].rolling(window=20).mean()
```

#### Example 2: Relative Strength Index (RSI)
```python
def calculate(data):
    """Calculate 14-day RSI"""
    delta = data['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(14).mean()
    loss = -delta.where(delta < 0, 0).rolling(14).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))
```

#### Example 3: Using Other Indicators
```python
def calculate(data):
    """Calculate SMA crossover signal (requires SMA_20 indicator)"""
    # This indicator depends on SMA_20
    # System automatically detects the dependency
    sma = data['SMA_20']
    price = data['close']
    return (price - sma) / sma * 100  # Percentage above/below SMA
```

#### Example 4: MyTT Group Indicator (MACD)
```python
def calculate(data):
    """
    Calculate MACD indicator group using MyTT library

    Args:
        data: pandas DataFrame with OHLC data

    Returns:
        dict with indicator_name: values (numpy array or pandas Series)
    """
    # MyTT.MACD returns three arrays: DIF, DEA, MACD
    DIF, DEA, MACD_hist = MACD(data['close'].values, SHORT=12, LONG=26, M=9)

    return {
        'DIF': DIF,
        'DEA': DEA,
        'MACD': MACD_hist
    }
```

#### Example 5: Using Group Indicator Output
```python
def calculate(data):
    """Calculate buy signal from MACD crossover (requires MACD group)"""
    # Reference group indicator columns using groupName:indicatorName
    dif = data['MACD:DIF']
    dea = data['MACD:DEA']

    # Buy signal when DIF crosses above DEA
    return (dif > dea).astype(int)
```

### Managing Indicators
1. Click **"Manage Indicators"** button
2. **Create**: Click "+ Create New Indicator"
   - Select indicator type: Custom Python or MyTT Library Group
   - Enter name, description, and Python code in Monaco Editor
   - For groups: specify group name and expected outputs (e.g., DIF, DEA, MACD)
   - Use "Insert Template" or "Insert MyTT Template" for quick start
   - Real-time syntax checking shows errors as you type
   - Validate code before saving
3. **Apply**: Select stocks to apply indicator to (all selected by default)
4. **Edit**: Modify existing indicator code (type cannot be changed after creation)
5. **Delete**: Remove indicators (warns if other indicators depend on it)

### Viewing Charts
- **Select Dataset**: Choose stock from dropdown (grouped by data source)
- **Enable Indicators**: Check indicators in the two collapsible panels
- **Navigate**:
  - Scroll to zoom in/out on time axis
  - Drag to pan (on candlestick chart only)
  - Hover to see values in data panel
- **Collapse Selectors**: Click panel headers to maximize chart space

## Project Structure

```
/app
  /api
    /datasets          # List available stocks
    /dataset/[name]    # Get specific stock data
    /add-stock         # Add/update stock data
    /indicators        # Manage indicator definitions
    /indicators/[id]   # Single indicator CRUD
    /apply-indicator   # Apply indicators to stocks
/components
  ChartPanel.tsx       # Three-chart display
  IndicatorSelector.tsx # Collapsible indicator picker
  IndicatorManager.tsx  # Indicator CRUD UI
  IndicatorEditorModal.tsx # Indicator code editor
  ApplyIndicatorModal.tsx  # Apply to stocks UI
  AddStockModal.tsx    # Add stock UI
  DataPanel.tsx        # Current value display
  StockDashboard.tsx   # Main dashboard
/lib
  csv.ts               # CSV file operations
  csv-updater.ts       # Add columns to CSVs
  datasets.ts          # Dataset management
  indicator-storage.ts # Indicator persistence
  indicator-validator.ts # Python code validation
  indicator-dependencies.ts # Dependency tracking
  detect-dependencies.ts # Auto dependency detection
  python-executor.ts   # Python subprocess execution
/data
  /csv                 # Stock CSV files
  /indicators
    indicators.json    # Indicator definitions
  /python
    executor.py        # Python execution wrapper
    requirements.txt   # Python dependencies
```

## API Endpoints

### Stock Data
- `GET /api/datasets` - List all available stocks
- `GET /api/dataset/[name]` - Get stock data with indicators
- `POST /api/add-stock` - Add or update stock data
  ```json
  { "symbol": "000001" }
  ```

### Indicators
- `GET /api/indicators` - List all indicators
- `POST /api/indicators` - Create new indicator
  ```json
  {
    "name": "SMA_20",
    "description": "20-day Simple Moving Average",
    "pythonCode": "def calculate(data):\n    return data['close'].rolling(20).mean()",
    "outputColumn": "SMA_20"
  }
  ```
- `GET /api/indicators/[id]` - Get single indicator
- `PUT /api/indicators/[id]` - Update indicator
- `DELETE /api/indicators/[id]?cascade=true` - Delete indicator (cascade deletes dependents)
- `POST /api/apply-indicator` - Apply indicator to stocks
  ```json
  {
    "indicatorId": "uuid",
    "stockSymbols": ["000001", "600000"]
  }
  ```

## Data Formats

### CSV Structure
Stock data CSVs contain OHLC data plus calculated indicators:
```csv
date,open,high,low,close,volume,turnover,amplitude,change_pct,change_amount,turnover_rate,SMA_20,RSI_14
2024-01-01,10.0,10.5,9.8,10.2,1000000,10200000,7.0,2.0,0.2,0.5,10.1,65.5
```

### Indicator JSON
Indicators are stored in `/data/indicators/indicators.json`:
```json
{
  "indicators": [
    {
      "id": "uuid-here",
      "name": "SMA_20",
      "description": "20-day Simple Moving Average",
      "pythonCode": "def calculate(data):\n    return data['close'].rolling(20).mean()",
      "outputColumn": "SMA_20",
      "dependencies": [],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## Technology Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **UI Framework**: Tailwind CSS
- **Charts**: TradingView Lightweight Charts
- **Code Editor**: Monaco Editor (@monaco-editor/react) - VS Code editor
- **Data Processing**:
  - PapaParse (CSV parsing)
  - Python (indicator calculation via child_process)
  - pandas, numpy (Python data processing)
  - MyTT (Chinese technical analysis library)
- **Runtime**: Node.js (API routes, Python subprocess)

## Security Considerations

### Python Code Validation
The system blocks dangerous patterns in user-provided Python code:
- Import restrictions: `os`, `subprocess`, `sys`
- Function restrictions: `eval()`, `exec()`, `open()`, `__import__`
- Process isolation with timeouts

### Recommendations
- Run the application in a sandboxed environment
- Review indicator code before execution
- Keep Python dependencies updated
- Monitor Python process resource usage

## Troubleshooting

### Python Not Found
```
Error: Python 3 required. Install Python 3.8+
```
**Solution**: Install Python 3.8 or higher and ensure it's in PATH

### Indicator Calculation Timeout
```
Error: Calculation timeout. Optimize your code.
```
**Solution**: Simplify indicator logic or increase timeout in `/lib/python-executor.ts`

### Missing Dependencies
```
Error: No module named 'pandas'
```
**Solution**: `pip install pandas numpy`

### API Connection Failed
```
Error: Failed to fetch stock data
```
**Solution**:
1. Ensure aktools API is running: `python -m aktools`
2. Check that the API is accessible at http://127.0.0.1:8080
3. Verify aktools is installed: `pip list | grep aktools`
4. Test the API endpoint:
   ```bash
   curl "http://127.0.0.1:8080/api/public/stock_zh_a_hist?symbol=000001&start_date=20240101&end_date=20240201&adjust=qfq"
   ```

### Circular Dependencies
```
Error: Circular dependency detected for indicator: X
```
**Solution**: Remove circular references between indicators (A depends on B, B depends on A)

## Performance Tips

1. **Limit Enabled Indicators**: Only enable indicators you're actively viewing
2. **Optimize Python Code**: Use vectorized pandas operations instead of loops
3. **Batch Apply**: Apply indicators to multiple stocks at once
4. **Close Unused Stocks**: Fewer datasets = faster load times

## Contributing

This is a personal project. Feel free to fork and customize for your needs.

## License

MIT License - See LICENSE file for details

## Acknowledgments

- [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/)
- [Next.js](https://nextjs.org/)
- [PapaParse](https://www.papaparse.com/)
- [pandas](https://pandas.pydata.org/)
