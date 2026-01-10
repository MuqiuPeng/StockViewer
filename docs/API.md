# API Reference

Complete API endpoint documentation for StockViewer.

## Table of Contents

- [Overview](#overview)
- [Dataset Endpoints](#dataset-endpoints)
- [Indicator Endpoints](#indicator-endpoints)
- [Strategy Endpoints](#strategy-endpoints)
- [Group Endpoints](#group-endpoints)
- [Backtest Endpoints](#backtest-endpoints)
- [Backtest History Endpoints](#backtest-history-endpoints)
- [Validation Endpoints](#validation-endpoints)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

## Overview

StockViewer uses Next.js API Routes for all backend functionality.

**Base URL:** `http://localhost:3000/api` (development)

**Response Format:** JSON

**Authentication:** None (local application)

**Common Headers:**
```
Content-Type: application/json
Accept: application/json
```

## Dataset Endpoints

### GET /api/datasets

List all available stock datasets with metadata.

**Request:**
```http
GET /api/datasets
```

**Response:**
```json
{
  "datasets": [
    {
      "name": "000001_stock_zh_a_hist.csv",
      "symbol": "000001",
      "datasource": "stock_zh_a_hist",
      "firstDate": "2000-01-01",
      "lastDate": "2024-01-15",
      "rowCount": 5000,
      "columns": ["date", "open", "high", "low", "close", "volume", "SMA_20", "RSI_14"]
    }
  ]
}
```

**Response Fields:**
- `name` (string): CSV filename
- `symbol` (string): Stock symbol
- `datasource` (string): Data source identifier
- `firstDate` (string): Earliest date in dataset
- `lastDate` (string): Latest date in dataset
- `rowCount` (number): Number of rows
- `columns` (string[]): Available columns (OHLC + indicators)

**Status Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Failed to read datasets

---

### GET /api/dataset/[name]

Get complete data for a specific dataset.

**Request:**
```http
GET /api/dataset/000001_stock_zh_a_hist.csv
```

**Response:**
```json
{
  "name": "000001_stock_zh_a_hist.csv",
  "data": [
    {
      "date": "2024-01-01",
      "open": 10.0,
      "high": 10.5,
      "low": 9.8,
      "close": 10.2,
      "volume": 1000000,
      "turnover": 10200000,
      "amplitude": 7.0,
      "change_pct": 2.0,
      "change_amount": 0.2,
      "turnover_rate": 0.5,
      "SMA_20": 10.15,
      "RSI_14": 65.5
    }
  ],
  "columns": ["date", "open", "high", "low", "close", "volume", "SMA_20", "RSI_14"]
}
```

**Response Fields:**
- `name` (string): Dataset filename
- `data` (object[]): Array of data rows
- `columns` (string[]): Column names

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Dataset doesn't exist
- `500 Internal Server Error`: Failed to read file

---

### POST /api/add-dataset

Add a new stock or update existing stock data.

**Request:**
```http
POST /api/add-dataset
Content-Type: application/json

{
  "symbol": "000001",
  "startDate": "1900-01-01",
  "endDate": "2024-12-31",
  "datasource": "stock_zh_a_hist"
}
```

**Request Fields:**
- `symbol` (string, required): 6-digit stock code
- `startDate` (string, optional): Start date (YYYY-MM-DD), default: `1900-01-01`
- `endDate` (string, optional): End date (YYYY-MM-DD), default: today
- `datasource` (string, optional): Data source, default: `stock_zh_a_hist`

**Response:**
```json
{
  "success": true,
  "message": "Stock data fetched and saved successfully",
  "filename": "000001_stock_zh_a_hist.csv",
  "rowCount": 5000
}
```

**Status Codes:**
- `200 OK`: Stock added/updated successfully
- `400 Bad Request`: Missing or invalid parameters
- `500 Internal Server Error`: Failed to fetch or save data

**Process:**
1. Fetch data from aktools API
2. Save to CSV file
3. Apply all existing indicators
4. Return success with metadata

---

### DELETE /api/datasets

Delete a dataset by name.

**Request:**
```http
DELETE /api/datasets?name=000001_stock_zh_a_hist.csv
```

**Query Parameters:**
- `name` (string, required): Dataset filename to delete

**Response:**
```json
{
  "success": true,
  "message": "Dataset deleted successfully"
}
```

**Status Codes:**
- `200 OK`: Dataset deleted
- `400 Bad Request`: Missing name parameter
- `404 Not Found`: Dataset not found
- `500 Internal Server Error`: Failed to delete file

---

## Indicator Endpoints

### GET /api/indicators

List all custom indicators.

**Request:**
```http
GET /api/indicators
```

**Response:**
```json
{
  "indicators": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "SMA_20",
      "description": "20-day Simple Moving Average",
      "pythonCode": "def calculate(data):\n    return data['close'].rolling(20).mean()",
      "outputColumn": "SMA_20",
      "dependencies": [],
      "isGroup": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Response Fields:**
- `id` (string): Unique UUID
- `name` (string): Display name
- `description` (string): Description
- `pythonCode` (string): Calculation code
- `outputColumn` (string): Column name (Custom Python only)
- `groupName` (string): Group name (MyTT Group only)
- `expectedOutputs` (string[]): Output names (MyTT Group only)
- `dependencies` (string[]): Indicator dependencies
- `isGroup` (boolean): True for MyTT Group indicators
- `createdAt` (string): Creation timestamp (ISO-8601)
- `updatedAt` (string): Last update timestamp (ISO-8601)

**Status Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Failed to read indicators

---

### POST /api/indicators

Create a new indicator.

**Request:**
```http
POST /api/indicators
Content-Type: application/json

{
  "name": "SMA_20",
  "description": "20-day Simple Moving Average",
  "pythonCode": "def calculate(data):\n    return data['close'].rolling(20).mean()",
  "outputColumn": "SMA_20",
  "isGroup": false
}
```

**Request Fields (Custom Python):**
- `name` (string, required): Indicator name
- `description` (string, required): Description
- `pythonCode` (string, required): Calculation code
- `outputColumn` (string, required): Column name
- `isGroup` (boolean, required): Must be `false`

**Request Fields (MyTT Group):**
- `name` (string, required): Indicator name
- `description` (string, required): Description
- `pythonCode` (string, required): Calculation code
- `groupName` (string, required): Group name
- `expectedOutputs` (string[], required): Output names
- `isGroup` (boolean, required): Must be `true`

**Response:**
```json
{
  "success": true,
  "indicator": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "SMA_20",
    ...
  }
}
```

**Status Codes:**
- `201 Created`: Indicator created successfully
- `400 Bad Request`: Validation failed
- `500 Internal Server Error`: Failed to save

**Validation:**
- Checks for dangerous imports (`os`, `subprocess`, etc.)
- Requires `calculate` function
- Detects dependencies automatically

---

### GET /api/indicators/[id]

Get a single indicator by ID.

**Request:**
```http
GET /api/indicators/550e8400-e29b-41d4-a716-446655440000
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "SMA_20",
  "description": "20-day Simple Moving Average",
  "pythonCode": "def calculate(data):\n    return data['close'].rolling(20).mean()",
  "outputColumn": "SMA_20",
  "dependencies": [],
  "isGroup": false,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Indicator not found
- `500 Internal Server Error`: Failed to read

---

### PUT /api/indicators/[id]

Update an existing indicator.

**Request:**
```http
PUT /api/indicators/550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "name": "SMA_20",
  "description": "Updated description",
  "pythonCode": "def calculate(data):\n    return data['close'].rolling(20).mean()"
}
```

**Request Fields:**
- Same as POST, but `isGroup` and `outputColumn`/`groupName` cannot be changed

**Response:**
```json
{
  "success": true,
  "indicator": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    ...
    "updatedAt": "2024-01-16T12:00:00.000Z"
  }
}
```

**Status Codes:**
- `200 OK`: Updated successfully
- `400 Bad Request`: Validation failed
- `404 Not Found`: Indicator not found
- `500 Internal Server Error`: Failed to save

---

### DELETE /api/indicators/[id]

Delete an indicator.

**Request:**
```http
DELETE /api/indicators/550e8400-e29b-41d4-a716-446655440000?cascade=false
```

**Query Parameters:**
- `cascade` (boolean, optional): If `true`, delete dependent indicators too. Default: `false`

**Response:**
```json
{
  "success": true,
  "message": "Indicator deleted successfully"
}
```

**Response (with dependents, cascade=false):**
```json
{
  "success": false,
  "error": "Cannot delete indicator",
  "dependents": ["SMA_Deviation", "Buy_Signal"]
}
```

**Status Codes:**
- `200 OK`: Deleted successfully
- `400 Bad Request`: Has dependents and cascade not set
- `404 Not Found`: Indicator not found
- `500 Internal Server Error`: Failed to delete

---

### POST /api/apply-indicator

Apply an indicator to selected stocks.

**Request:**
```http
POST /api/apply-indicator
Content-Type: application/json

{
  "indicatorId": "550e8400-e29b-41d4-a716-446655440000",
  "datasetNames": ["000001_stock_zh_a_hist.csv", "600000_stock_zh_a_hist.csv"]
}
```

**Request Fields:**
- `indicatorId` (string, required): Indicator UUID
- `datasetNames` (string[], required): CSV filenames to apply to

**Response:**
```json
{
  "success": true,
  "message": "Indicator applied to 2 dataset(s) successfully",
  "results": [
    {
      "dataset": "000001_stock_zh_a_hist.csv",
      "success": true
    },
    {
      "dataset": "600000_stock_zh_a_hist.csv",
      "success": true
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Applied successfully (even if some failed)
- `400 Bad Request`: Missing parameters
- `500 Internal Server Error`: Complete failure

**Process:**
1. Load indicator code
2. For each dataset:
   - Load CSV data
   - Execute Python code
   - Add indicator column(s)
   - Save updated CSV
3. Return individual results

---

## Strategy Endpoints

### GET /api/strategies

List all trading strategies.

**Request:**
```http
GET /api/strategies
```

**Response:**
```json
{
  "strategies": [
    {
      "id": "strategy-uuid",
      "name": "MACD Crossover",
      "description": "Buy on golden cross, sell on death cross",
      "pythonCode": "def calculate(data, parameters):\n    ...",
      "parameters": {},
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Failed to read strategies

---

### POST /api/strategies

Create a new strategy.

**Request:**
```http
POST /api/strategies
Content-Type: application/json

{
  "name": "MACD Crossover",
  "description": "Buy on golden cross, sell on death cross",
  "pythonCode": "def calculate(data, parameters):\n    signals = []\n    # ... logic ...\n    return signals",
  "parameters": {
    "short_window": 10,
    "long_window": 30
  }
}
```

**Request Fields:**
- `name` (string, required): Strategy name
- `description` (string, required): Description
- `pythonCode` (string, required): Signal generation code
- `parameters` (object, optional): Default parameters

**Response:**
```json
{
  "success": true,
  "strategy": {
    "id": "strategy-uuid",
    ...
  }
}
```

**Status Codes:**
- `201 Created`: Strategy created
- `400 Bad Request`: Validation failed
- `500 Internal Server Error`: Failed to save

---

### GET /api/strategies/[id]

Get a single strategy.

**Request:**
```http
GET /api/strategies/strategy-uuid
```

**Response:**
```json
{
  "id": "strategy-uuid",
  "name": "MACD Crossover",
  ...
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Strategy not found
- `500 Internal Server Error`: Failed to read

---

### PUT /api/strategies/[id]

Update a strategy.

**Request:**
```http
PUT /api/strategies/strategy-uuid
Content-Type: application/json

{
  "name": "MACD Crossover v2",
  "description": "Updated strategy",
  "pythonCode": "...",
  "parameters": {...}
}
```

**Response:**
```json
{
  "success": true,
  "strategy": {...}
}
```

**Status Codes:**
- `200 OK`: Updated successfully
- `400 Bad Request`: Validation failed
- `404 Not Found`: Strategy not found
- `500 Internal Server Error`: Failed to save

---

### DELETE /api/strategies/[id]

Delete a strategy.

**Request:**
```http
DELETE /api/strategies/strategy-uuid
```

**Response:**
```json
{
  "success": true,
  "message": "Strategy deleted successfully"
}
```

**Status Codes:**
- `200 OK`: Deleted successfully
- `404 Not Found`: Strategy not found
- `500 Internal Server Error`: Failed to delete

---

## Group Endpoints

### GET /api/groups

List all stock groups.

**Request:**
```http
GET /api/groups
```

**Response:**
```json
{
  "groups": [
    {
      "id": "group_1704067200000_abc123",
      "name": "Tech Stocks",
      "description": "Technology sector stocks",
      "datasetNames": ["000001_stock_zh_a_hist.csv", "600000_stock_zh_a_hist.csv"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Failed to read groups

---

### POST /api/groups

Create a new group.

**Request:**
```http
POST /api/groups
Content-Type: application/json

{
  "name": "Tech Stocks",
  "description": "Technology sector stocks",
  "datasetNames": ["000001_stock_zh_a_hist.csv", "600000_stock_zh_a_hist.csv"]
}
```

**Request Fields:**
- `name` (string, required): Group name
- `description` (string, optional): Description
- `datasetNames` (string[], required): CSV filenames

**Response:**
```json
{
  "success": true,
  "group": {
    "id": "group_1704067200000_abc123",
    ...
  }
}
```

**Status Codes:**
- `201 Created`: Group created
- `400 Bad Request`: Invalid parameters
- `500 Internal Server Error`: Failed to save

---

### PUT /api/groups

Update a group.

**Request:**
```http
PUT /api/groups
Content-Type: application/json

{
  "id": "group_1704067200000_abc123",
  "name": "Tech Stocks Updated",
  "description": "Updated description",
  "datasetNames": ["000001_stock_zh_a_hist.csv"]
}
```

**Request Fields:**
- `id` (string, required): Group ID
- `name` (string, required): Updated name
- `description` (string, optional): Updated description
- `datasetNames` (string[], required): Updated dataset list

**Response:**
```json
{
  "success": true,
  "group": {...}
}
```

**Status Codes:**
- `200 OK`: Updated successfully
- `400 Bad Request`: Invalid parameters
- `404 Not Found`: Group not found
- `500 Internal Server Error`: Failed to save

---

### DELETE /api/groups

Delete a group.

**Request:**
```http
DELETE /api/groups?id=group_1704067200000_abc123
```

**Query Parameters:**
- `id` (string, required): Group ID to delete

**Response:**
```json
{
  "success": true,
  "message": "Group deleted successfully"
}
```

**Status Codes:**
- `200 OK`: Deleted successfully
- `400 Bad Request`: Missing ID parameter
- `404 Not Found`: Group not found
- `500 Internal Server Error`: Failed to delete

---

## Backtest Endpoints

### POST /api/backtest

Run a backtest on single stock or group.

**Request (Single Stock):**
```http
POST /api/backtest
Content-Type: application/json

{
  "strategyId": "strategy-uuid",
  "mode": "single",
  "datasetName": "000001_stock_zh_a_hist.csv",
  "initialCash": 100000,
  "commission": 0.001,
  "parameters": {},
  "startDate": "2023-01-01",
  "endDate": "2023-12-31"
}
```

**Request (Group):**
```http
POST /api/backtest
Content-Type: application/json

{
  "strategyId": "strategy-uuid",
  "mode": "group",
  "groupId": "group_1704067200000_abc123",
  "initialCash": 100000,
  "commission": 0.001,
  "parameters": {},
  "startDate": "2023-01-01",
  "endDate": "2023-12-31"
}
```

**Request Fields:**
- `strategyId` (string, required): Strategy UUID
- `mode` (string, required): `"single"` or `"group"`
- `datasetName` (string, required if mode=single): CSV filename
- `groupId` (string, required if mode=group): Group ID
- `initialCash` (number, optional): Starting capital, default: 100000
- `commission` (number, optional): Commission rate (0.001 = 0.1%), default: 0.001
- `parameters` (object, optional): Strategy parameters, default: {}
- `startDate` (string, optional): Filter start date (YYYY-MM-DD)
- `endDate` (string, optional): Filter end date (YYYY-MM-DD)

**Response (Single Stock):**
```json
{
  "success": true,
  "results": {
    "metrics": {
      "totalReturn": 20000,
      "totalReturnPct": 20.0,
      "finalValue": 120000,
      "initialValue": 100000,
      "maxDrawdown": -5000,
      "maxDrawdownPct": -10.0,
      "sharpeRatio": 1.5,
      "sortinoRatio": 2.0,
      "calmarRatio": 2.0,
      "winRate": 60.0,
      "avgWin": 500,
      "avgLoss": -300,
      "profitFactor": 1.67,
      "tradeCount": 20,
      "wonTrades": 12,
      "lostTrades": 8,
      "avgSlippagePct": 0.5,
      "totalSlippageCost": 200,
      "sameDayTrades": 10,
      "nextOpenTrades": 10
    },
    "equityCurve": [
      {"date": "2023-01-01", "value": 100000},
      {"date": "2023-01-02", "value": 101000},
      ...
    ],
    "tradeMarkers": [
      {
        "signal_date": "2023-01-15",
        "execution_date": "2023-01-16",
        "date": "2023-01-16",
        "type": "buy",
        "price": 102.5,
        "signal_price": 100.0,
        "amount": 100,
        "value": 10250,
        "commission": 10.25,
        "execution_mode": "next_open"
      },
      ...
    ]
  }
}
```

**Response (Group):**
```json
{
  "success": true,
  "results": {
    "aggregated": {
      "metrics": {
        "totalReturn": 15000,  // Mean across stocks
        "totalReturnPct": 15.0,
        ...
      }
    },
    "individual": [
      {
        "datasetName": "000001_stock_zh_a_hist.csv",
        "success": true,
        "metrics": {...}
      },
      {
        "datasetName": "600000_stock_zh_a_hist.csv",
        "success": true,
        "metrics": {...}
      }
    ]
  }
}
```

**Status Codes:**
- `200 OK`: Backtest completed (even if strategy failed)
- `400 Bad Request`: Invalid parameters
- `404 Not Found`: Strategy, dataset, or group not found
- `500 Internal Server Error`: Execution error

**Notes:**
- Backtest can succeed but strategy can fail (check `results.success`)
- Group mode returns aggregated metrics + individual results
- Trade markers only in single stock mode
- Equity curve only in single stock mode

---

## Backtest History Endpoints

### GET /api/backtest-history

Retrieve all backtest history entries with optional filtering.

**Request:**
```http
GET /api/backtest-history
GET /api/backtest-history?starred=true
GET /api/backtest-history?strategyId=abc123
GET /api/backtest-history?tags=optimized,final
```

**Query Parameters:**
- `starred` (optional): Filter by starred status (`true` or `false`)
- `strategyId` (optional): Filter by strategy ID
- `tags` (optional): Comma-separated list of tags

**Response:**
```json
{
  "entries": [
    {
      "id": "hist-uuid-1",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "strategyId": "strat-123",
      "strategyName": "MA Crossover",
      "strategyType": "single",
      "target": {
        "type": "single",
        "datasetName": "平安银行"
      },
      "parameters": {
        "initialCash": 100000,
        "commission": 0.001,
        "startDate": "2023-01-01",
        "endDate": "2023-12-31",
        "strategyParameters": {}
      },
      "result": {
        "success": true,
        "metrics": { ... },
        "equityCurve": [ ... ],
        "tradeMarkers": [ ... ]
      },
      "starred": false,
      "notes": "Best performance so far",
      "tags": ["optimized", "final"],
      "summary": {
        "totalReturn": 15000,
        "totalReturnPct": 15.0,
        "sharpeRatio": 1.8,
        "tradeCount": 42,
        "duration": 1234
      }
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Database error

---

### GET /api/backtest-history/[id]

Get details of a specific backtest history entry.

**Request:**
```http
GET /api/backtest-history/hist-uuid-1
```

**Response:**
```json
{
  "entry": {
    "id": "hist-uuid-1",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "strategyId": "strat-123",
    "strategyName": "MA Crossover",
    "target": { ... },
    "parameters": { ... },
    "result": { ... },
    "starred": false,
    "notes": "...",
    "tags": ["tag1"],
    "summary": { ... }
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Entry not found
- `500 Internal Server Error`: Database error

---

### PATCH /api/backtest-history/[id]

Update backtest history entry metadata (notes, tags, starred status).

**Request:**
```http
PATCH /api/backtest-history/hist-uuid-1
Content-Type: application/json

{
  "starred": true,
  "notes": "Updated notes about this backtest",
  "tags": ["optimized", "final", "production"]
}
```

**Request Body:**
- `starred` (optional): Boolean to star/unstar
- `notes` (optional): String with user notes
- `tags` (optional): Array of tag strings

**Response:**
```json
{
  "entry": {
    "id": "hist-uuid-1",
    "starred": true,
    "notes": "Updated notes about this backtest",
    "tags": ["optimized", "final", "production"],
    ...
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Entry not found
- `500 Internal Server Error`: Update error

---

### DELETE /api/backtest-history/[id]

Delete a backtest history entry.

**Request:**
```http
DELETE /api/backtest-history/hist-uuid-1
```

**Response:**
```json
{
  "success": true,
  "message": "Backtest history entry deleted"
}
```

**Status Codes:**
- `200 OK`: Successfully deleted
- `404 Not Found`: Entry not found
- `500 Internal Server Error`: Deletion error

---

### POST /api/backtest-history/[id]/rerun

Re-execute a backtest with the same parameters as a previous run.

**Request:**
```http
POST /api/backtest-history/hist-uuid-1/rerun
```

**Response:**
```json
{
  "result": {
    "success": true,
    "metrics": { ... },
    "equityCurve": [ ... ],
    "tradeMarkers": [ ... ],
    "type": "single",
    "datasetName": "平安银行",
    "dateRange": { ... }
  }
}
```

**Status Codes:**
- `200 OK`: Backtest completed successfully
- `404 Not Found`: Original entry not found
- `400 Bad Request`: Invalid parameters or strategy deleted
- `500 Internal Server Error`: Execution error

**Notes:**
- Creates a new history entry for the re-run
- Uses original strategy, target, and parameters
- Fails if original strategy has been deleted
- Returns same format as `/api/backtest` endpoint

---

## Validation Endpoints

### POST /api/validate-indicator

Validate indicator code before saving.

**Request:**
```http
POST /api/validate-indicator
Content-Type: application/json

{
  "pythonCode": "def calculate(data):\n    return data['close'].rolling(20).mean()",
  "isGroup": false
}
```

**Request Fields:**
- `pythonCode` (string, required): Code to validate
- `isGroup` (boolean, required): Indicator type

**Response (Valid):**
```json
{
  "valid": true,
  "message": "Indicator code is valid",
  "valueCount": 100
}
```

**Response (Invalid):**
```json
{
  "valid": false,
  "error": "Syntax Error in indicator code",
  "details": "Line 2: invalid syntax"
}
```

**Status Codes:**
- `200 OK`: Validation completed (check `valid` field)
- `400 Bad Request`: Missing parameters
- `500 Internal Server Error`: Validation process failed

**Validation Checks:**
- Security: Blocks dangerous imports
- Syntax: Checks Python syntax
- Structure: Requires `calculate` function
- Execution: Runs on sample data
- Output: Validates return type

---

### POST /api/validate-strategy

Validate strategy code before saving.

**Request:**
```http
POST /api/validate-strategy
Content-Type: application/json

{
  "pythonCode": "def calculate(data, parameters):\n    signals = []\n    return signals"
}
```

**Request Fields:**
- `pythonCode` (string, required): Code to validate

**Response (Valid):**
```json
{
  "valid": true,
  "message": "Strategy code is valid",
  "signalCount": 5
}
```

**Response (Invalid):**
```json
{
  "valid": false,
  "error": "Strategy must define calculate(data, parameters) function"
}
```

**Status Codes:**
- `200 OK`: Validation completed
- `400 Bad Request`: Missing code parameter
- `500 Internal Server Error`: Validation failed

**Validation Checks:**
- Security: Blocks dangerous imports
- Syntax: Checks Python syntax
- Structure: Requires `calculate(data, parameters)` function
- Execution: Runs on sample data
- Signals: Validates signal format

---

## Error Handling

### Standard Error Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "Short error message",
  "details": "Detailed error information (optional)",
  "code": "ERROR_CODE (optional)"
}
```

### Common Error Codes

**400 Bad Request:**
- Missing required parameters
- Invalid parameter format
- Validation failures

**404 Not Found:**
- Resource doesn't exist (indicator, strategy, dataset, group)

**500 Internal Server Error:**
- File system errors
- Python execution failures
- JSON parsing errors
- Unexpected exceptions

### Error Examples

**Missing Parameter:**
```json
{
  "success": false,
  "error": "Missing required field: symbol"
}
```

**Validation Error:**
```json
{
  "valid": false,
  "error": "Security violation",
  "details": "Code contains dangerous imports (os, subprocess, ...)"
}
```

**Python Execution Error:**
```json
{
  "success": false,
  "error": "Python execution failed",
  "details": "Traceback (most recent call last):\n  File ...\nKeyError: 'SMA_20'"
}
```

## Rate Limiting

**Current:** No rate limiting

**Future Implementation:**
- 60 requests per minute per IP (planned)
- Configurable via environment variables
- Headers:
  ```
  X-RateLimit-Limit: 60
  X-RateLimit-Remaining: 45
  X-RateLimit-Reset: 1704067200
  ```

## Best Practices

1. **Error Handling:**
   - Always check `success` field
   - Handle both `error` and `details`
   - Log errors for debugging

2. **Validation:**
   - Validate code before creating indicators/strategies
   - Show validation errors to users
   - Don't assume validation passes

3. **Large Datasets:**
   - Use date range filters for backtests
   - Apply indicators in batches
   - Consider pagination for large responses

4. **Timeouts:**
   - Implement client-side timeouts (2-5 minutes)
   - Show loading states during long operations
   - Allow users to cancel long-running requests

5. **Caching:**
   - Cache dataset lists
   - Cache indicator/strategy lists
   - Invalidate cache on create/update/delete

## Next Steps

- **[Architecture](ARCHITECTURE.md)** - Understand how APIs work internally
- **[Indicators](INDICATORS.md)** - Using indicator endpoints
- **[Backtesting](BACKTESTING.md)** - Using backtest endpoints
- **[Datasets & Groups](DATASETS.md)** - Using dataset/group endpoints

---

**Need Help?** Check individual feature documentation or the troubleshooting sections.
