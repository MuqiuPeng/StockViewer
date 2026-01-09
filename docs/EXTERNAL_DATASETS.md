# Using External Datasets in Strategies and Indicators

External datasets allow you to incorporate data from other stocks/indices into your indicators and strategies. This is useful for:
- Comparing stocks against an index (e.g., 上证指数)
- Using reference data from one stock while trading another
- Creating relative strength indicators
- Building pairs trading strategies
- Comparing against sector benchmarks

## How It Works

Instead of calling a function in your code, you configure external datasets through the UI when creating or editing a strategy/indicator. These datasets are automatically loaded and passed to your `calculate` function via the `parameters` argument.

## Configuration

### Step 1: Open Strategy/Indicator Editor

When creating or editing a strategy or indicator, you'll see an "External Datasets (Optional)" section.

### Step 2: Add External Dataset

1. Click "+ Add External Dataset"
2. Enter a parameter name (e.g., `index_data`, `reference_stock`)
3. Select the group containing the dataset
4. Select the specific dataset from that group

### Step 3: Access in Your Code

The external dataset will be available as a pandas DataFrame via `parameters['your_parameter_name']`.

## Examples

### Example 1: Indicator - Compare Stock Against Index

**UI Configuration:**
- Parameter Name: `index`
- Group: "Market Indices"
- Dataset: "000001_stock_zh_a_hist.csv" (上证指数)

**Code:**
```python
def calculate(data, parameters):
    """
    Calculate relative strength against index.

    Args:
        data: Main stock DataFrame
        parameters: Dict containing external datasets

    Returns:
        pandas Series of relative strength values
    """
    # Access the index data
    index_data = parameters['index']

    # Merge on date to align the data
    merged = data.merge(index_data[['date', 'close']], on='date', how='left', suffixes=('', '_index'))

    # Calculate relative strength
    relative_strength = merged['close'] / merged['close_index']

    return relative_strength
```

### Example 2: Strategy - Pairs Trading

**UI Configuration:**
- Parameter Name: `pair_stock`
- Group: "Bank Stocks"
- Dataset: "600000_stock_zh_a_hist.csv" (浦发银行)

**Code:**
```python
def calculate(data, parameters):
    """
    Pairs trading strategy.

    Args:
        data: Main stock DataFrame (e.g., 平安银行)
        parameters: Dict containing pair stock data

    Returns:
        List of trading signals
    """
    import pandas as pd

    # Get pair stock data
    pair_data = parameters['pair_stock']

    # Merge data
    merged = data.merge(pair_data[['date', 'close']], on='date', how='left', suffixes=('', '_pair'))

    signals = []

    for i in range(20, len(merged)):
        # Calculate spread
        spread = merged['close'].iloc[i] - merged['close_pair'].iloc[i]

        # Calculate rolling mean of spread
        spread_mean = (merged['close'].iloc[i-20:i].mean() -
                      merged['close_pair'].iloc[i-20:i].mean())

        # Generate signals based on spread deviation
        if spread < spread_mean - 5:
            signals.append({
                'date': merged['date'].iloc[i],
                'type': 'v',
                'amount': 10000,
                'execution': 'close'
            })
        elif spread > spread_mean + 5:
            signals.append({
                'date': merged['date'].iloc[i],
                'type': 'v',
                'amount': -10000,
                'execution': 'close'
            })

    return signals
```

### Example 3: Strategy - Index-Relative Moving Average

**UI Configuration:**
- Parameter Name: `market_index`
- Group: "Market Indices"
- Dataset: "000001_stock_zh_a_hist.csv"

**Code:**
```python
def calculate(data, parameters):
    """
    Trade based on relative performance vs market index.
    """
    import pandas as pd

    index_data = parameters['market_index']

    # Merge data
    merged = data.merge(index_data[['date', 'close']], on='date', how='left', suffixes=('', '_index'))

    # Calculate relative price
    merged['relative_price'] = merged['close'] / merged['close_index']

    # Calculate MA of relative price
    merged['relative_ma20'] = merged['relative_price'].rolling(window=20).mean()

    signals = []

    for i in range(20, len(merged)):
        row = merged.iloc[i]
        prev = merged.iloc[i-1]

        # Buy when relative price crosses above its MA
        if prev['relative_price'] < prev['relative_ma20'] and row['relative_price'] > row['relative_ma20']:
            signals.append({
                'date': row['date'],
                'type': 'v',
                'amount': 10000,
                'execution': 'next_open'
            })

        # Sell when relative price crosses below its MA
        elif prev['relative_price'] > prev['relative_ma20'] and row['relative_price'] < row['relative_ma20']:
            signals.append({
                'date': row['date'],
                'type': 'v',
                'amount': -10000,
                'execution': 'next_open'
            })

    return signals
```

### Example 4: Multiple External Datasets

You can add multiple external datasets:

**UI Configuration:**
- Parameter 1: `sh_index` → "Market Indices" → "000001_stock_zh_a_hist.csv"
- Parameter 2: `sz_index` → "Market Indices" → "399001_stock_zh_a_hist.csv"

**Code:**
```python
def calculate(data, parameters):
    """
    Market breadth indicator using multiple indices.
    """
    import pandas as pd

    sh_index = parameters['sh_index']
    sz_index = parameters['sz_index']

    # Merge both indices
    merged = data.merge(sh_index[['date', 'close']], on='date', how='left', suffixes=('', '_sh'))
    merged = merged.merge(sz_index[['date', 'close']], on='date', how='left', suffixes=('', '_sz'))

    # Calculate if stock outperforms both indices
    outperforms_sh = merged['close'] > merged['close_sh']
    outperforms_sz = merged['close'] > merged['close_sz']

    # Market strength indicator
    strength = (outperforms_sh.astype(int) + outperforms_sz.astype(int)) / 2

    return strength
```

## Important Notes

### Function Signature

For **indicators**:
```python
def calculate(data, parameters):
    # parameters contains external datasets
    external_data = parameters['your_parameter_name']
    ...
```

For **strategies**:
```python
def calculate(data, parameters):
    # parameters contains external datasets
    external_data = parameters['your_parameter_name']
    ...
```

### Backward Compatibility

Indicators that don't use external datasets can still use the old signature:
```python
def calculate(data):
    # Works fine without parameters
    ...
```

The system automatically detects which signature your function uses.

### Data Alignment

External datasets are loaded as separate DataFrames. You need to merge them with your main data on the `date` column:

```python
merged = data.merge(external_data[['date', 'close']], on='date', how='left')
```

Use `how='left'` to keep all dates from the main dataset.

### Handling Missing Data

When dates don't match between datasets, NaN values may appear. Always check for them:

```python
import pandas as pd

merged = data.merge(external_data[['date', 'close']], on='date', how='left', suffixes=('', '_ext'))

# Check for NaN
if pd.notna(merged['close_ext'].iloc[i]):
    # Safe to use the value
    relative_price = merged['close'].iloc[i] / merged['close_ext'].iloc[i]
```

### Available Columns

External datasets have the same structure as the main data:
- `date` - Date of the data point
- `open` - Opening price
- `high` - Highest price
- `low` - Lowest price
- `close` - Closing price
- `volume` - Trading volume (if available)
- Any applied indicators

## Best Practices

1. **Use Descriptive Names**: Name your parameters clearly (e.g., `market_index`, `peer_stock`, `sector_benchmark`)

2. **Merge Early**: Merge external data at the beginning of your function for cleaner code

3. **Check Data Availability**: Always verify that merged data doesn't have NaN values before using it

4. **Use Left Join**: Use `how='left'` when merging to keep all dates from your main dataset

5. **Suffix Columns**: When merging, use `suffixes` parameter to avoid column name conflicts:
   ```python
   merged = data.merge(external[['date', 'close']], on='date', how='left', suffixes=('', '_index'))
   ```

## Common Use Cases

1. **Index Comparison**: Compare individual stocks against market indices (上证指数, 深证成指)
2. **Sector Rotation**: Track multiple stocks in the same sector
3. **Pairs Trading**: Trade based on price relationships between correlated stocks
4. **Relative Strength**: Identify stocks outperforming the market or sector
5. **Market Timing**: Use index data to confirm signals in individual stocks
