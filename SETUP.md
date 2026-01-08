# StockViewer Setup Guide

This guide will help you set up StockViewer from scratch.

## Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** 18 or higher ([Download](https://nodejs.org/))
- **Python** 3.8 or higher ([Download](https://www.python.org/downloads/))
- **Git** ([Download](https://git-scm.com/downloads))

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd StockViewer
```

### 2. Install Node.js Dependencies

```bash
npm install
```

### 3. Run Setup Script

This will create all necessary data directories and initialize JSON files:

```bash
npm run setup
```

### 4. Set up Python Virtual Environment

Create a virtual environment for the application:

```bash
# Create virtual environment
python -m venv venv

# Activate it
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install Python dependencies
pip install pandas numpy
```

### 5. Install and Run AKTools API

AKTools provides Chinese stock market data. Set it up in a separate environment:

```bash
# Create separate environment for aktools
python -m venv aktools-env

# Activate it
# On macOS/Linux:
source aktools-env/bin/activate
# On Windows:
aktools-env\Scripts\activate

# Install aktools
pip install aktools

# Start the API server (keep this running in a separate terminal)
python -m aktools
```

The AKTools API will run at `http://127.0.0.1:8080`

### 6. Start the Development Server

In a new terminal (with the main venv activated):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## What Gets Created

The setup script creates the following directory structure:

```
/data
  /csv              # Stock CSV data files (auto-generated)
  /indicators       # Indicator definitions (JSON)
  /strategies       # Trading strategies (JSON)
  /groups           # Stock groups (JSON)
  /backtest-history # Backtest history (JSON)
  /datasets         # Dataset metadata
  /python           # Python execution scripts (committed to git)
    MyTT.py         # Technical analysis library
    executor.py     # Indicator calculator
    backtest-executor.py  # Backtesting engine
    requirements.txt      # Python dependencies
```

## Troubleshooting

### Python Not Found

**Error**: `Python 3 required`

**Solution**: Make sure Python 3.8+ is installed and in your PATH. Run `python --version` to check.

### AKTools API Not Running

**Error**: `Failed to fetch stock data`

**Solution**:
1. Make sure aktools is installed: `pip install aktools`
2. Start the API server: `python -m aktools`
3. Verify it's running at http://127.0.0.1:8080

### Port Already in Use

**Error**: `Port 3000 is already in use`

**Solution**:
```bash
# Find and kill the process using port 3000
# On macOS/Linux:
lsof -ti:3000 | xargs kill -9

# On Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Module Not Found Errors

**Error**: `Cannot find module 'xyz'`

**Solution**: Re-install dependencies:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Python Import Errors

**Error**: `ModuleNotFoundError: No module named 'pandas'`

**Solution**: Make sure you're in the virtual environment and reinstall:
```bash
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install pandas numpy
```

## Environment Variables

Create a `.env.local` file in the root directory to customize settings:

```bash
# AKTools API URL (default: http://127.0.0.1:8080)
NEXT_PUBLIC_AKTOOLS_API_URL=http://127.0.0.1:8080

# Python executable path (default: python3)
PYTHON_EXECUTABLE=python3

# Python execution timeout in milliseconds (default: 300000 = 5 minutes)
PYTHON_TIMEOUT_MS=300000
```

## Next Steps

Once everything is running:

1. **Add Stock Data**: Navigate to the Datasets page and add Chinese A-share stocks
2. **Create Indicators**: Go to the Viewer page to create custom technical indicators
3. **Create Strategies**: Design trading strategies using your indicators
4. **Run Backtests**: Test your strategies on historical data
5. **Review History**: Access past backtest results from the history sidebar

## Getting Help

- Check the main [README.md](README.md) for feature documentation
- Review the [docs/](docs/) folder for detailed guides
- Report issues on the GitHub repository

## Development Tips

- **Hot Reload**: The Next.js dev server supports hot reload - changes appear immediately
- **Python Changes**: Restart the backtest after modifying Python files
- **Clear Cache**: Delete `.next/` folder if you encounter build issues
- **Data Reset**: Delete JSON files in `data/` subdirectories to reset application data
