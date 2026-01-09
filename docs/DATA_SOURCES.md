# Data Sources

This document describes all available historical data sources that can be imported into StockViewer.

## Overview

StockViewer now supports **30+ data sources** from AKShare, covering:
- A-Share stocks (daily and minute data)
- B-Share stocks
- CDR (Chinese Depositary Receipts)
- Hong Kong stocks
- Chinese, US, and global indices
- ETFs and funds
- Futures (domestic and foreign)

## Using Data Sources

### Via UI

1. Go to **Datasets** page
2. Click **Add Stock/Dataset**
3. Select a data source from the dropdown (organized by category)
4. Enter the symbol according to the format shown
5. Click **Add Stock(s)**

### Via API

```bash
POST /api/add-stock
Content-Type: application/json

{
  "symbol": "000001",
  "dataSource": "stock_zh_a_hist",
  "customParams": {
    "adjust": "qfq"
  }
}
```

## Available Data Sources

### A股 (A-Share Stocks)

#### stock_zh_a_hist (Recommended)
- **Description**: A股日线历史数据，支持前复权和后复权
- **Symbol Format**: 6位数字 (如: 000001)
- **Parameters**:
  - `period`: 'daily'/'weekly'/'monthly' (default: 'daily')
  - `adjust`: 'qfq'/'hfq' (default: 'qfq')
  - `start_date`: YYYYMMDD format
  - `end_date`: YYYYMMDD format

#### stock_zh_a_daily
- **Description**: A股日线历史数据 (新浪财经)，包含复权因子
- **Symbol Format**: sh/sz + 6位数字 (如: sh000001)

#### stock_zh_a_hist_tx
- **Description**: A股日线历史数据 (腾讯财经)
- **Symbol Format**: 6位数字 (如: 000001)

#### stock_zh_a_minute
- **Description**: A股分钟级历史数据 (1/5/15/30/60分钟)
- **Symbol Format**: sh/sz + 6位数字 (如: sh000001)
- **Parameters**: `period`: '1'/'5'/'15'/'30'/'60' (default: '60')

#### stock_zh_a_hist_min_em
- **Description**: A股分钟级历史数据 (东方财富)
- **Symbol Format**: 6位数字 (如: 000001)
- **Parameters**: `period`: minute interval

### B股 (B-Share Stocks)

#### stock_zh_b_daily
- **Description**: B股日线历史数据，包含复权因子
- **Symbol Format**: sh/sz + 6位数字 (如: sh900901)

#### stock_zh_b_minute
- **Description**: B股分钟级历史数据
- **Symbol Format**: sh/sz + 6位数字 (如: sh900901)

### CDR (Chinese Depositary Receipts)

#### stock_zh_a_cdr_daily
- **Description**: 存托凭证日线历史数据
- **Symbol Format**: 6位数字 (如: 688126)

### 港股 (Hong Kong Stocks)

#### stock_hk_daily
- **Description**: 香港股票日线历史数据
- **Symbol Format**: 5位数字 (如: 00700)

### 指数 (Indices)

#### index_zh_a_hist (Chinese Indices)
- **Description**: 中国股票指数历史数据 (东方财富)
- **Symbol Format**: 指数代码 (如: 000001 上证指数)
- **Common Indices**:
  - 000001: 上证指数
  - 399001: 深证成指
  - 399006: 创业板指
  - 000300: 沪深300
  - 000016: 上证50
  - 000905: 中证500

#### stock_zh_index_daily
- **Description**: 中国股票指数历史数据 (新浪财经)
- **Symbol Format**: sz/sh + 指数代码

#### stock_zh_index_daily_tx
- **Description**: 中国股票指数历史数据 (腾讯财经)
- **Symbol Format**: sh/sz + 指数代码

#### stock_zh_index_daily_em
- **Description**: 中国股票指数历史数据 (东方财富日线)
- **Symbol Format**: 指数代码

#### stock_hk_index_daily_sina (Hong Kong Indices)
- **Description**: 香港股票指数历史数据 (新浪)
- **Symbol Format**: 指数代码 (如: HSI 恒生指数)

#### stock_hk_index_daily_em
- **Description**: 香港股票指数历史数据 (东方财富)
- **Symbol Format**: 指数代码

#### index_us_stock_sina (US Indices)
- **Description**: 美国股票指数历史数据 (新浪)
- **Symbol Format**: 指数代码
- **Common Indices**:
  - .INX: S&P 500
  - .DJI: Dow Jones
  - .IXIC: NASDAQ

#### index_global_hist_em (Global Indices)
- **Description**: 全球股票指数历史数据 (东方财富)
- **Symbol Format**: 指数名称

#### index_global_hist_sina
- **Description**: 全球股票指数历史数据 (新浪，限1000条)
- **Symbol Format**: 指数名称

### 基金 (Funds & ETFs)

#### fund_etf_hist_sina
- **Description**: ETF基金历史数据 (新浪财经)
- **Symbol Format**: 基金代码 (如: 510300)
- **Common ETFs**:
  - 510300: 沪深300ETF
  - 510500: 中证500ETF
  - 159919: 沪深300ETF

#### fund_etf_hist_em
- **Description**: ETF基金历史数据 (东方财富)
- **Symbol Format**: 基金代码 (如: 510300)

#### fund_etf_hist_min_em
- **Description**: ETF基金分钟级历史数据 (东方财富)
- **Symbol Format**: 基金代码 (如: 510300)
- **Parameters**: `period`: minute interval

#### fund_lof_hist_em
- **Description**: LOF基金历史数据 (东方财富)
- **Symbol Format**: 基金代码 (如: 163402)

### 期货 (Futures)

#### futures_zh_daily_sina
- **Description**: 国内期货日线历史数据 (新浪)
- **Symbol Format**: 合约代码 (如: RB0)

#### futures_zh_minute_sina
- **Description**: 国内期货分钟级历史数据
- **Symbol Format**: 合约代码
- **Parameters**: `period`: minute interval

#### futures_foreign_hist
- **Description**: 国外期货历史数据
- **Symbol Format**: 合约代码 (如: CL for crude oil)

## Stock List API

Get a complete list of all available stocks (including delisted ones):

### GET /api/stock-list

**Query Parameters:**
- `source`: 'active' | 'delisted_sh' | 'delisted_sz' | 'all' (default: 'active')

**Response:**
```json
{
  "success": true,
  "count": 5234,
  "stocks": [
    {
      "code": "000001",
      "name": "平安银行",
      "status": "active"
    },
    {
      "code": "000002",
      "name": "万科A",
      "status": "active"
    }
  ]
}
```

**Example Usage:**
```bash
# Get all active stocks
curl "http://localhost:3000/api/stock-list?source=active"

# Get all stocks including delisted
curl "http://localhost:3000/api/stock-list?source=all"

# Get only Shanghai delisted stocks
curl "http://localhost:3000/api/stock-list?source=delisted_sh"
```

## Data Source Configuration

All data sources are configured in `lib/data-sources.ts`. Each data source includes:

- **id**: Unique identifier (matches AKShare function name)
- **name**: Display name in Chinese
- **category**: Group category
- **description**: What data it provides
- **apiEndpoint**: AKShare API endpoint name
- **defaultParams**: Default parameters
- **requiredParams**: Parameters that must be provided
- **symbolFormat**: Description of symbol format
- **exampleSymbol**: Example symbol for reference

## Adding New Data Sources

To add a new data source:

1. Edit `lib/data-sources.ts`
2. Add a new entry to the `DATA_SOURCES` array:

```typescript
{
  id: 'new_data_source',
  name: '新数据源名称',
  category: '分类',
  description: '数据源描述',
  apiEndpoint: 'new_data_source',
  defaultParams: {
    param1: 'default_value'
  },
  requiredParams: ['symbol', 'start_date'],
  symbolFormat: '格式说明',
  exampleSymbol: '示例'
}
```

3. The UI will automatically show the new data source in the dropdown

## Technical Details

### Column Mapping

Data from AKShare APIs typically uses Chinese column names. The system automatically maps them to English:

| Chinese | English |
|---------|---------|
| 日期 | date |
| 开盘 | open |
| 收盘 | close |
| 最高 | high |
| 最低 | low |
| 成交量 | volume |
| 成交额 | turnover |
| 振幅 | amplitude |
| 涨跌幅 | change_pct |
| 涨跌额 | change_amount |
| 换手率 | turnover_rate |

### Date Range

By default, the system fetches **all available historical data** (from 1900-01-01 to today). You can customize this by providing `start_date` and `end_date` in the `customParams`.

### Automatic Indicator Application

When a new dataset is imported, all saved indicators are automatically applied to it in dependency order.

## Limitations

1. **API Availability**: Some data sources require the AKTools API to be running locally
2. **Rate Limiting**: AKShare may rate-limit requests for certain data sources
3. **Data Quality**: Different data sources may have different data quality and completeness
4. **Symbol Formats**: Each data source has its own symbol format requirements

## Troubleshooting

### "No data available" Error
- Check that the symbol format is correct for the selected data source
- Verify the symbol exists (use the stock list API)
- Ensure AKTools API is running at http://127.0.0.1:8080

### "Invalid data source" Error
- The data source ID doesn't exist in the configuration
- Check `lib/data-sources.ts` for available data sources

### Missing Data
- Some data sources may not have complete historical data
- Try a different data source for the same asset type
- Check the AKShare documentation for data availability

## References

- [AKShare Documentation](https://akshare.akfamily.xyz/)
- [AKShare GitHub](https://github.com/akfamily/akshare)
- [Stock Data Documentation](https://akshare.akfamily.xyz/data/stock/stock.html)
