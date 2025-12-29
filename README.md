# Stock Dashboard

A Next.js stock dashboard application that reads CSV files and displays candlestick charts with indicator lines using TradingView Lightweight Charts.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create the data directory (if it doesn't exist):
```bash
mkdir -p data/csv
```

3. Place your CSV files in the `./data/csv` directory.

## CSV File Requirements

Each CSV file must contain the following columns (case-insensitive):
- `date` - Date/time string (parsed by JavaScript Date)
- `open` - Opening price (numeric)
- `high` - High price (numeric)
- `low` - Low price (numeric)
- `close` - Closing price (numeric)

Additional columns will be treated as indicators and can be displayed as line series on the chart.

### Example CSV Format

```csv
date,open,high,low,close,sma20,rsi
2024-01-01,100.0,105.0,99.0,104.0,102.5,65.0
2024-01-02,104.0,106.0,103.0,105.0,103.0,67.0
```

## Configuration

You can configure the CSV directory location using the `CSV_DIR` environment variable:

```bash
# .env.local
CSV_DIR=/path/to/your/csv/files
```

If not set, it defaults to `./data/csv` relative to the project root.

## Running the Application

### Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Features

- **Dataset Selection**: Dropdown to select from available CSV datasets
- **Candlestick Chart**: Displays OHLC data with date/time on x-axis
- **Indicator Lines**: Display multiple indicator columns as line series
- **Indicator Selector**: Checkbox list with search filter to enable/disable indicators
- **Auto-fit**: Chart automatically fits content after dataset load
- **Responsive**: Handles window resize events

## API Endpoints

- `GET /api/datasets` - List all available datasets
- `GET /api/dataset/[name]` - Load a specific dataset by name

## Technology Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **TradingView Lightweight Charts**
- **PapaParse** (CSV parsing)
- **Node.js** runtime for API routes

