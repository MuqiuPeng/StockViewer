# AKTools API Reference

This document lists **all AKShare functions accessible through AKTools** that are relevant for importing historical data into StockViewer.

## Base URL
```
http://127.0.0.1:8080/api/public/{function_name}
```

---

## 📋 Parameter Listing APIs (Get Available Symbols)

These APIs return lists of available symbols/codes to use with historical data APIs.

### Stocks

| Function | Description | Usage |
|----------|-------------|-------|
| `stock_info_a_code_name` | All A-share codes & names | No params |
| `stock_info_sh_name_code` | Shanghai stock list | No params |
| `stock_info_sz_name_code` | Shenzhen stock list | No params |
| `stock_info_bj_name_code` | Beijing stock list | No params |
| `stock_info_sh_delist` | Shanghai delisted stocks | `?symbol=全部` |
| `stock_info_sz_delist` | Shenzhen delisted stocks | `?symbol=终止上市公司` |
| `stock_hk_spot_em` | Hong Kong stock list | No params |
| `stock_us_spot_em` | US stock list | No params |

**Examples:**
```bash
# Get all A-share stocks
curl "http://127.0.0.1:8080/api/public/stock_info_a_code_name"

# Get HK stocks
curl "http://127.0.0.1:8080/api/public/stock_hk_spot_em"

# Get Shanghai delisted stocks
curl "http://127.0.0.1:8080/api/public/stock_info_sh_delist?symbol=全部"
```

### Indices

| Function | Description | Usage |
|----------|-------------|-------|
| `stock_zh_index_spot_em` | Chinese index list | No params or `?symbol=上证系列指数` |
| `stock_zh_index_spot_sina` | Chinese index list (Sina) | No params |
| `stock_hk_index_spot_em` | HK index list | No params |
| `stock_hk_index_spot_sina` | HK index list (Sina) | No params |
| `index_global_spot_em` | Global index list | No params |

**Examples:**
```bash
# Get all Chinese indices
curl "http://127.0.0.1:8080/api/public/stock_zh_index_spot_em"

# Get HK indices
curl "http://127.0.0.1:8080/api/public/stock_hk_index_spot_em"
```

### Funds & ETFs

| Function | Description | Usage |
|----------|-------------|-------|
| `fund_etf_spot_em` | ETF list | No params |
| `fund_lof_spot_em` | LOF fund list | No params |
| `fund_etf_category_sina` | ETF by category (Sina) | No params |

**Examples:**
```bash
# Get all ETFs
curl "http://127.0.0.1:8080/api/public/fund_etf_spot_em"

# Get LOF funds
curl "http://127.0.0.1:8080/api/public/fund_lof_spot_em"
```

### Futures

| Function | Description | Usage |
|----------|-------------|-------|
| `futures_zh_spot` | Domestic futures list | No params |
| `futures_symbol_mark` | Futures symbol marks | No params |

**Examples:**
```bash
# Get all futures contracts
curl "http://127.0.0.1:8080/api/public/futures_zh_spot"
```

---

## 📊 Historical Data APIs (Time Series)

These APIs return historical OHLCV data for specific symbols.

### A-Share Stocks (5 APIs)

| Function | Params | Example |
|----------|--------|---------|
| `stock_zh_a_hist` ⭐ | `symbol`, `start_date`, `end_date`, `period=daily`, `adjust=qfq` | `?symbol=000001&start_date=20230101&end_date=20231231&adjust=qfq` |
| `stock_zh_a_daily` | `symbol`, `start_date`, `end_date`, `adjust` | `?symbol=sh000001&start_date=2023-01-01&end_date=2023-12-31` |
| `stock_zh_a_hist_tx` | `symbol`, `start_date`, `end_date`, `adjust` | `?symbol=000001&start_date=20230101&end_date=20231231` |
| `stock_zh_a_minute` | `symbol`, `period=60`, `adjust` | `?symbol=sh000001&period=60` |
| `stock_zh_a_hist_min_em` | `symbol`, `start_date`, `end_date`, `period`, `adjust` | `?symbol=000001&period=60` |

**Example:**
```bash
curl "http://127.0.0.1:8080/api/public/stock_zh_a_hist?symbol=000001&start_date=20230101&end_date=20231231&adjust=qfq"
```

### B-Share Stocks (2 APIs)

| Function | Params | Example |
|----------|--------|---------|
| `stock_zh_b_daily` | `symbol`, `start_date`, `end_date`, `adjust` | `?symbol=sh900901&start_date=2023-01-01` |
| `stock_zh_b_minute` | `symbol`, `period`, `adjust` | `?symbol=sh900901&period=60` |

### CDR (1 API)

| Function | Params | Example |
|----------|--------|---------|
| `stock_zh_a_cdr_daily` | `symbol`, `start_date`, `end_date` | `?symbol=688126&start_date=20230101` |

### Hong Kong Stocks (1 API)

| Function | Params | Example |
|----------|--------|---------|
| `stock_hk_daily` | `symbol`, `start_date`, `end_date` | `?symbol=00700&start_date=20230101` |

### Chinese Indices (4 APIs)

| Function | Params | Example |
|----------|--------|---------|
| `index_zh_a_hist` ⭐ | `symbol`, `start_date`, `end_date`, `period=daily` | `?symbol=000001&start_date=20230101&end_date=20231231` |
| `stock_zh_index_daily` | `symbol` | `?symbol=sz399552` |
| `stock_zh_index_daily_tx` | `symbol` | `?symbol=sh000919` |
| `stock_zh_index_daily_em` | `symbol`, `start_date`, `end_date` | `?symbol=000001&start_date=20230101` |

**Example:**
```bash
# Get Shanghai Composite Index history
curl "http://127.0.0.1:8080/api/public/index_zh_a_hist?symbol=000001&start_date=20230101&end_date=20231231"
```

### Hong Kong Indices (2 APIs)

| Function | Params | Example |
|----------|--------|---------|
| `stock_hk_index_daily_sina` | `symbol` | `?symbol=HSI` |
| `stock_hk_index_daily_em` | `symbol` | `?symbol=HSI` |

### US Indices (1 API)

| Function | Params | Example |
|----------|--------|---------|
| `index_us_stock_sina` | `symbol` | `?symbol=.INX` |

**Example:**
```bash
# Get S&P 500 history
curl "http://127.0.0.1:8080/api/public/index_us_stock_sina?symbol=.INX"
```

### Global Indices (2 APIs)

| Function | Params | Example |
|----------|--------|---------|
| `index_global_hist_em` | `symbol` | `?symbol=标普500` |
| `index_global_hist_sina` | `symbol` | `?symbol=标普500` |

### Funds & ETFs (4 APIs)

| Function | Params | Example |
|----------|--------|---------|
| `fund_etf_hist_sina` | `symbol` | `?symbol=510300` |
| `fund_etf_hist_em` | `symbol`, `start_date`, `end_date` | `?symbol=510300&start_date=20230101` |
| `fund_etf_hist_min_em` | `symbol`, `period` | `?symbol=510300&period=60` |
| `fund_lof_hist_em` | `symbol`, `start_date`, `end_date` | `?symbol=163402&start_date=20230101` |

**Example:**
```bash
# Get CSI 300 ETF history
curl "http://127.0.0.1:8080/api/public/fund_etf_hist_em?symbol=510300&start_date=20230101&end_date=20231231"
```

### Futures (3 APIs)

| Function | Params | Example |
|----------|--------|---------|
| `futures_zh_daily_sina` | `symbol` | `?symbol=RB0` |
| `futures_zh_minute_sina` | `symbol`, `period` | `?symbol=RB0&period=60` |
| `futures_foreign_hist` | `symbol`, `start_date`, `end_date` | `?symbol=CL&start_date=20230101` |

**Example:**
```bash
# Get rebar futures history
curl "http://127.0.0.1:8080/api/public/futures_zh_daily_sina?symbol=RB0"
```

---

## 📝 Summary

### Total APIs: 33

**Parameter Listing (Get Symbols): 16 APIs**
- Stocks: 8 APIs
- Indices: 5 APIs
- Funds: 3 APIs
- Futures: 2 APIs (futures_zh_spot is the primary one)

**Historical Data (Time Series): 25 APIs**
- A-Shares: 5 APIs
- B-Shares: 2 APIs
- CDR: 1 API
- HK Stocks: 1 API
- Indices: 9 APIs (Chinese, HK, US, Global)
- Funds/ETFs: 4 APIs
- Futures: 3 APIs

---

## 🔗 StockViewer API Wrappers

StockViewer provides convenient wrapper APIs:

| StockViewer API | AKTools Functions Used | Purpose |
|-----------------|------------------------|---------|
| `GET /api/stock-list` | `stock_info_a_code_name`, `stock_info_sh_delist`, `stock_info_sz_delist` | Get A-share stock list |
| `GET /api/index-list` | `stock_zh_index_spot_em`, `stock_hk_index_spot_em`, etc. | Get index list |
| `GET /api/fund-list` | `fund_etf_spot_em`, `fund_lof_spot_em` | Get fund/ETF list |
| `GET /api/futures-list` | `futures_zh_spot` | Get futures contract list |
| `GET /api/hk-stock-list` | `stock_hk_spot_em` | Get HK stock list |
| `GET /api/us-stock-list` | `stock_us_spot_em` | Get US stock list |
| `POST /api/add-dataset` | Any `*_hist` or `*_daily` function | Import historical data |

---

## 🚀 Usage Workflow

1. **Get available symbols** using parameter listing APIs:
   ```bash
   curl "http://localhost:3000/api/index-list?source=zh"
   # Returns: [{"code": "000001", "name": "上证指数"}, ...]
   ```

2. **Import historical data** using the symbol:
   ```bash
   curl -X POST "http://localhost:3000/api/add-dataset" \
     -H "Content-Type: application/json" \
     -d '{
       "symbol": "000001",
       "dataSource": "index_zh_a_hist"
     }'
   ```

3. **Data is now available** in the Viewer for analysis and backtesting!

---

## 📚 References

- [AKShare Documentation](https://akshare.akfamily.xyz/)
- [AKShare GitHub](https://github.com/akfamily/akshare)
- [AKTools Installation](https://github.com/akfamily/aktools)
