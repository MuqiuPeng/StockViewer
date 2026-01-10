# Datasets & Groups Documentation

Comprehensive guide to dataset and group management in StockViewer.

## Table of Contents

- [Overview](#overview)
- [Dataset Management](#dataset-management)
- [Adding Stocks](#adding-stocks)
- [Updating Stocks](#updating-stocks)
- [Deleting Stocks](#deleting-stocks)
- [Stock Groups](#stock-groups)
- [Data Format](#data-format)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

StockViewer manages stock data through:

- **Datasets**: Individual stock CSV files with OHLC + indicators
- **Groups**: Named collections of stocks for portfolio analysis
- **Auto-update**: Detects when data is outdated and provides one-click refresh
- **Multi-source**: Supports different data APIs (stock_zh_a_hist, etc.)

**Storage:**
- CSV files: `/data/csv/{symbol}_{datasource}.csv`
- Groups JSON: `/data/groups/groups.json`

## Dataset Management

### Dataset List Page

Access via **Datasets** navigation link from homepage.

**Features:**
- View all datasets with metadata
- Group by data source
- See last update date
- Detect outdated data
- One-click update
- Delete datasets
- Manage groups

### Dataset Card

Each dataset shows:

**Basic Info:**
- **Stock Symbol**: 6-digit code (e.g., 000001, 600000)
- **Data Source**: API used (e.g., stock_zh_a_hist)
- **Date Range**: First date → Last date

**Status:**
- **Up to date**: Local data matches API latest date (green)
- **Update available**: API has newer data (orange badge)

**Actions:**
- **Update**: Fetch latest data and re-apply all indicators
- **Delete**: Remove dataset (with confirmation)

### Grouping by Data Source

Datasets are organized by their source API:

```
📁 stock_zh_a_hist
  📄 000001 (平安银行)
  📄 600000 (浦发银行)
  📄 600519 (贵州茅台)

📁 index_zh_a_hist
  📄 000001 (上证指数)
  📄 399001 (深证成指)
```

**Benefits:**
- Easy to see which API was used
- Organize by data type (stocks vs indices)
- Identify data source for troubleshooting

## Adding Stocks

### Step-by-Step

1. **Open Add Stock Modal**
   - Navigate to Datasets page
   - Click **"+ Add Stock"** button

2. **Enter Stock Symbol**
   - 6-digit Chinese stock code
   - Examples: `000001`, `600000`, `600519`
   - System auto-detects data source

3. **Configure (optional)**
   - Start date (default: `1900-01-01` for all historical data)
   - End date (default: today)
   - Adjust type (default: `qfq` for forward-adjusted)

4. **Click Add**
   - Fetches data from aktools API
   - Saves to CSV file
   - Auto-applies all existing indicators
   - Shows progress messages

5. **Dataset Ready**
   - Appears in dataset list
   - Available in dropdowns (Viewer, Backtest)
   - Ready for analysis

### Data Sources

**stock_zh_a_hist** (Chinese A-shares):
- Shanghai Stock Exchange: 600xxx, 601xxx, 603xxx
- Shenzhen Stock Exchange: 000xxx, 001xxx, 002xxx, 300xxx
- Forward-adjusted prices (前复权)

**Other Sources:**
- index_zh_a_hist: Market indices
- fund_etf_hist: ETF funds
- (Add more as needed via API configuration)

### Initial Indicator Application

When adding a stock, all existing indicators are automatically applied:

**Process:**
1. Fetch OHLC data from API
2. Save base CSV with standard columns
3. Load all indicators from `indicators.json`
4. Calculate indicators in dependency order
5. Add indicator columns to CSV
6. Save updated CSV

**Why Auto-Apply?**
- Consistency: All stocks have same indicators
- Convenience: No manual application needed
- Immediate use: Stock ready for analysis right away

## Updating Stocks

### Auto-Update Detection

System compares local data with API:

**Check Process:**
1. Read last date from local CSV
2. Fetch latest available date from API
3. Compare dates

**Status:**
- **Match**: "Up to date" (no action needed)
- **Mismatch**: "Update available" badge (orange)

### One-Click Update

1. Click **"Update"** button on dataset card
2. System fetches missing dates from API
3. Appends new data to CSV
4. Re-applies all indicators to new data
5. Updates dataset metadata
6. Shows success message

**What Gets Updated:**
- New OHLC rows for missing dates
- All indicator values for new dates
- Last update timestamp

**What Stays Same:**
- Historical data (unchanged)
- Existing indicator columns
- File location and name

### Manual Update

If auto-detect misses an update:

1. Delete the dataset
2. Re-add with same symbol
3. Fetches all data fresh
4. Re-applies all indicators

## Deleting Stocks

### Deletion Process

1. Click **"Delete"** button on dataset card
2. Confirmation modal appears:
   ```
   Are you sure you want to delete dataset "000001_stock_zh_a_hist.csv"?
   This action cannot be undone.
   ```
3. Click **"Delete"** to confirm or **"Cancel"** to abort
4. CSV file is permanently removed
5. Dataset disappears from list

### Impact

**What Gets Deleted:**
- CSV file from `/data/csv/`
- Dataset from dropdown menus
- Cannot view charts for this stock
- Cannot backtest on this stock

**What Remains:**
- Indicators (unaffected)
- Groups (stock removed from groups automatically)
- Strategies (unaffected)

**Recovery:**
- Re-add the stock using "Add Stock" button
- Data fetches fresh from API
- Indicators re-apply automatically

### Bulk Deletion

**Not yet implemented.**

Planned feature:
- Select multiple datasets
- Delete all at once
- Useful for cleaning up unused stocks

## Stock Groups

### What Are Groups?

Named collections of stocks for:

- **Portfolio backtesting**: Test strategy across multiple stocks
- **Organization**: Group by sector, strategy, watchlist
- **Batch operations**: Apply changes to all stocks in group

**Examples:**
- "Tech Stocks" - 000001, 600000, 600519
- "Banking Sector" - All bank stocks
- "Momentum Watchlist" - High-momentum stocks
- "Blue Chips" - Large-cap stable stocks

### Creating Groups

1. **Open Group Manager**
   - Navigate to Datasets page
   - Click **"Manage Groups"** button

2. **Create New Group**
   - Click **"+ Create New Group"**
   - Enter group name (e.g., "Tech Stocks")
   - Enter description (optional)

3. **Add Stocks**
   - Select stocks from available list
   - Stocks must already be added as datasets
   - Can add/remove stocks later

4. **Save Group**
   - Click **"Create"**
   - Group appears in group list
   - Available for backtesting

### Editing Groups

1. Click **"Edit"** on group card
2. Modify name, description, or stock list
3. Click **"Update"** to save changes

**Editable:**
- Group name
- Description
- Stock list (add/remove stocks)

**Not Editable:**
- Group ID (auto-generated)
- Creation timestamp

### Deleting Groups

1. Click **"Delete"** on group card
2. Confirm deletion
3. Group removed from list

**Impact:**
- Only the group is deleted
- Stocks remain in dataset list
- No data is lost

### Using Groups

**In Backtesting:**
1. Navigate to Backtest page
2. Select "Group" mode
3. Choose group from dropdown
4. Run backtest
5. Strategy tests on all stocks in group
6. See aggregated metrics

**Future Uses:**
- Batch indicator application
- Group comparison charts
- Portfolio optimization
- Correlation analysis

### Group Storage

Groups stored in `/data/groups/groups.json`:

```json
{
  "groups": [
    {
      "id": "group_1704067200000_abc123",
      "name": "Tech Stocks",
      "description": "Technology sector stocks",
      "datasetNames": [
        "000001_stock_zh_a_hist.csv",
        "600000_stock_zh_a_hist.csv",
        "600519_stock_zh_a_hist.csv"
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Fields:**
- `id`: Unique identifier (timestamp + random)
- `name`: Display name
- `description`: Optional description
- `datasetNames`: Array of CSV filenames
- `createdAt`: Creation timestamp (ISO-8601)
- `updatedAt`: Last modification timestamp

## Data Format

### CSV File Structure

**Filename:**
- Format: `{symbol}_{datasource}.csv`
- Example: `000001_stock_zh_a_hist.csv`

**Columns:**

**Base Columns** (from API):
- `date`: Date string (YYYY-MM-DD)
- `open`: Opening price
- `high`: Highest price
- `low`: Lowest price
- `close`: Closing price
- `volume`: Trading volume
- `turnover`: Turnover amount
- `amplitude`: Price amplitude percentage
- `change_pct`: Daily change percentage
- `change_amount`: Daily change amount
- `turnover_rate`: Turnover rate percentage

**Indicator Columns** (added by system):
- Custom indicators: `SMA_20`, `RSI_14`, etc.
- Group indicators: `MACD:DIF`, `MACD:DEA`, `MACD:MACD`, etc.

**Example CSV:**
```csv
date,open,high,low,close,volume,turnover,amplitude,change_pct,change_amount,turnover_rate,SMA_20,RSI_14,MACD:DIF,MACD:DEA,MACD:MACD
2024-01-01,10.00,10.50,9.80,10.20,1000000,10200000,7.00,2.00,0.20,0.50,10.15,65.50,0.15,0.10,0.05
2024-01-02,10.20,10.60,10.00,10.40,1200000,12480000,5.88,1.96,0.20,0.60,10.18,68.20,0.18,0.12,0.06
```

### Data Types

**Price Fields:**
- Type: Float
- Precision: 2 decimal places
- Currency: CNY (¥)

**Volume Fields:**
- Type: Integer or Float
- Units: Shares or CNY

**Percentage Fields:**
- Type: Float
- Format: Percentage (2.5 means 2.5%)

**Date Field:**
- Type: String
- Format: `YYYY-MM-DD`
- Used as index for charts and calculations

### Data Quality

**Requirements:**
- No missing dates (within trading days)
- No NULL values in OHLC columns
- Sorted by date (oldest to newest)
- Valid numeric values

**Handling Missing Data:**
- Indicator calculations may produce NaN for initial periods
- Charts skip NaN values (don't render)
- Backtest skips signals on NaN dates

## Best Practices

### Dataset Organization

1. **Consistent Naming**
   - Let system auto-generate filenames
   - Don't manually rename CSV files
   - Use groups for logical organization

2. **Regular Updates**
   - Check for updates weekly or daily
   - Keep data current for accurate analysis
   - Use auto-update detection

3. **Backup Data**
   - Backup `/data/csv/` directory periodically
   - Backup `/data/groups/groups.json`
   - Store backups outside project directory

### Group Management

1. **Meaningful Names**
   - Use descriptive group names ("Tech Stocks", not "Group 1")
   - Add descriptions to explain purpose

2. **Logical Grouping**
   - Group by sector, industry, strategy type
   - Keep groups focused (not too broad)
   - Create multiple groups for different purposes

3. **Maintain Groups**
   - Remove delisted stocks
   - Add new stocks as discovered
   - Update descriptions as purpose evolves

### Performance

1. **Limit Dataset Count**
   - Only add stocks you'll actively use
   - Delete unused datasets
   - Large dataset count slows dropdown loading

2. **Group Size**
   - Groups of 5-20 stocks are manageable
   - Very large groups (&gt;50) may slow backtests
   - Split large groups if needed

3. **Update Timing**
   - Update during off-hours (not while analyzing)
   - Update one stock at a time for large datasets
   - Batch updates can take time

## Troubleshooting

### Adding Stocks

**API Connection Failed**
```
Error: Failed to fetch stock data
```
**Solutions:**
1. Ensure aktools API is running (`python -m aktools`)
2. Check API URL in `.env.local`
3. Verify stock symbol is valid (6-digit code)
4. Test API endpoint manually:
   ```bash
   curl "http://127.0.0.1:8080/api/public/stock_zh_a_hist?symbol=000001&start_date=20240101&end_date=20240201&adjust=qfq"
   ```

**Stock Symbol Not Found**
```
Error: Symbol not found
```
**Solutions:**
1. Verify symbol is correct (check exchange website)
2. Ensure symbol is A-share (not Hong Kong H-share)
3. Try different data source if available

**Timeout During Add**
```
Error: Request timeout
```
**Solutions:**
1. Reduce date range (fetch less historical data)
2. Check network connection
3. Increase timeout in `.env.local`:
   ```bash
   PYTHON_TIMEOUT_MS=600000
   ```

### Updating Stocks

**Update Not Detected**
```
Shows "Up to date" but data seems old
```
**Solutions:**
1. Check last date in CSV file manually
2. Verify API has newer data (test endpoint)
3. Delete and re-add stock to fetch fresh data

**Update Fails**
```
Error during update process
```
**Solutions:**
1. Check API connection (same as adding stocks)
2. Verify CSV file isn't locked/open in another program
3. Check disk space (ensure room for new data)
4. Try deleting and re-adding stock

### Indicators Not Applying

**New Stock Has No Indicators**
```
Added stock but indicator columns missing
```
**Solutions:**
1. Check if indicators exist in Indicator Manager
2. Manually apply indicators via Indicator Manager
3. Verify no errors in indicator code
4. Check indicator validation status

**Indicators Fail on Update**
```
Update succeeds but indicators not calculated for new rows
```
**Solutions:**
1. Re-apply indicators manually
2. Check indicator dependencies
3. Verify indicator code still valid
4. Delete and re-add stock if persistent

### Groups

**Stock Not in Group Dropdown**
```
Can't find stock when adding to group
```
**Solutions:**
1. Ensure stock is added as dataset first
2. Refresh datasets page
3. Check dataset wasn't deleted

**Group Backtest Fails**
```
Error when running backtest on group
```
**Solutions:**
1. Verify all stocks in group have required indicators
2. Check if any stocks were deleted
3. Update group to remove missing stocks
4. Test strategy on individual stocks first

### File System

**Permission Denied**
```
Error: EACCES permission denied
```
**Solutions:**
1. Check file permissions on `/data/` directory
2. Ensure Node.js process has write access
3. Run with appropriate user permissions (avoid root)

**Disk Full**
```
Error: ENOSPC no space left on device
```
**Solutions:**
1. Free up disk space
2. Delete unused datasets
3. Archive old backups
4. Move data directory to larger drive (update `.env.local`)

**File Locked**
```
Error: File is locked
```
**Solutions:**
1. Close any programs with CSV open (Excel, text editor)
2. Check for zombie Node.js processes
3. Restart development server

## Advanced Topics

### Data Source Configuration

**Adding Custom Data Sources:**

1. Update API endpoint configuration in `lib/env.ts`
2. Modify fetch logic in `app/api/add-dataset/route.ts`
3. Handle different response formats
4. Test thoroughly with sample data

**Example:**
```typescript
// lib/env.ts
export const DATA_SOURCES = {
  stock_zh_a_hist: 'http://127.0.0.1:8080/api/public/stock_zh_a_hist',
  index_zh_a_hist: 'http://127.0.0.1:8080/api/public/index_zh_a_hist',
  // Add custom source here
}
```

### Bulk Import

**Import Multiple Stocks:**

Not yet implemented, but planned:

```bash
# CSV file with stock symbols
# symbols.csv
000001
600000
600519

# Script to bulk import
node scripts/bulk-import.js symbols.csv
```

### Data Migration

**Moving Data Directory:**

1. Copy `/data/` to new location
2. Update `.env.local`:
   ```bash
   CSV_DIR=/new/path/to/csv
   INDICATORS_FILE=/new/path/to/indicators/indicators.json
   ```
3. Restart server
4. Verify datasets load correctly

### Custom Data Import

**Import from External CSV:**

Not yet implemented, but planned:

1. Upload CSV file
2. Map columns to required format
3. Validate data
4. Import into system
5. Apply indicators

## Next Steps

- **[Indicators](INDICATORS.md)** - Create indicators for your datasets
- **[Charts](CHARTS.md)** - Visualize your stock data
- **[Backtesting](BACKTESTING.md)** - Test strategies on your datasets
- **[API Reference](API.md)** - Dataset API endpoints

---

**Need Help?** Check the troubleshooting section or review best practices above.
