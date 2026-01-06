# Indicators Documentation

Comprehensive guide to the custom indicator system in StockViewer.

## Table of Contents

- [Overview](#overview)
- [Indicator Types](#indicator-types)
- [Creating Indicators](#creating-indicators)
- [Monaco Code Editor](#monaco-code-editor)
- [MyTT Library](#mytt-library)
- [Dependencies](#dependencies)
- [Code Examples](#code-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

StockViewer supports two types of custom technical indicators:

1. **Custom Python Indicators** - Single output column with user-defined calculation
2. **MyTT Library Group Indicators** - Multiple related outputs from one calculation

All indicators:
- Are written in Python with access to pandas and numpy
- Execute in isolated sandboxed environments
- Auto-apply to new stocks when added/updated
- Support dependency chains (indicators can use other indicators)
- Persist across sessions in `data/indicators/indicators.json`

## Indicator Types

### 1. Custom Python Indicators

**Characteristics:**
- Single output column
- Full Python control over calculation
- Access to all existing columns (OHLC + indicators)
- Returns pandas Series

**Structure:**
```python
def calculate(data):
    """
    Args:
        data: pandas DataFrame with columns:
            - date (index)
            - open, high, low, close, volume (float)
            - turnover, amplitude, change_pct, change_amount, turnover_rate (float)
            - All previously calculated indicator columns

    Returns:
        pandas Series of same length as data
    """
    # Your calculation here
    return result_series
```

**Use Cases:**
- Simple moving averages (SMA, EMA)
- RSI, Bollinger Bands, ATR
- Custom formulas and combinations
- Derivative indicators based on other indicators

### 2. MyTT Library Group Indicators

**Characteristics:**
- Multiple outputs from one calculation
- Uses Chinese technical analysis library
- Outputs stored as `groupName:indicatorName` columns
- Returns dict of arrays/series

**Structure:**
```python
def calculate(data):
    """
    Returns:
        dict with indicator_name: values (numpy array or pandas Series)

    Example:
        {
            'DIF': array([...]),
            'DEA': array([...]),
            'MACD': array([...])
        }
    """
    # MyTT function call
    result1, result2, result3 = MACD(data['close'].values)

    return {
        'DIF': result1,
        'DEA': result2,
        'MACD': result3
    }
```

**Use Cases:**
- MACD (DIF, DEA, MACD histogram)
- KDJ (K, D, J values)
- BOLL (upper, middle, lower bands)
- Any indicator with multiple related outputs

**Column Naming:**
- Group name: `MACD`
- Outputs: `DIF`, `DEA`, `MACD`
- Stored columns: `MACD:DIF`, `MACD:DEA`, `MACD:MACD`
- Referenced as: `data['MACD:DIF']`

## Creating Indicators

### Step-by-Step Guide

1. **Open Indicator Manager**
   - Navigate to Viewer page
   - Click "Manage Indicators" button

2. **Create New Indicator**
   - Click "+ Create New Indicator"
   - Select indicator type (Custom Python or MyTT Group)

3. **Fill in Details**
   - **Name**: Unique identifier (e.g., `SMA_20`, `MACD`)
   - **Description**: What the indicator calculates
   - **Output Column** (Custom Python): Column name in CSV
   - **Group Name** (MyTT): Name for the indicator group
   - **Expected Outputs** (MyTT): Comma-separated output names

4. **Write Code**
   - Use Monaco editor with full IDE features
   - Insert template for quick start
   - Use syntax help for reference

5. **Validate**
   - Click "Validate Code" button
   - Fix any errors shown in editor
   - Validation checks syntax, security, and output format

6. **Save and Apply**
   - Click "Create" to save indicator
   - Select stocks to apply to (all by default)
   - Indicator calculates and adds columns to CSV files

### Monaco Code Editor

The editor provides VS Code-level functionality:

**Features:**
- **Syntax Highlighting**: Full Python color coding
- **Line Numbers**: Easy reference and navigation
- **IntelliSense**: Autocomplete for pandas, numpy, MyTT functions
- **Error Markers**: Real-time syntax error detection with red underlines
- **Parameter Hints**: Function signature popups
- **Code Folding**: Collapse/expand code blocks
- **Minimap**: Code overview on the right
- **Multi-cursor**: Alt+Click for multiple cursors
- **Find/Replace**: Ctrl+F / Ctrl+H
- **Auto-indentation**: Smart Python indenting
- **Bracket Matching**: Highlight matching brackets

**Shortcuts:**
- `Ctrl+Space`: Trigger autocomplete
- `Ctrl+F`: Find
- `Ctrl+H`: Replace
- `Alt+Up/Down`: Move line up/down
- `Ctrl+/`: Comment/uncomment line
- `Ctrl+Z`: Undo
- `Ctrl+Shift+Z`: Redo

**Templates:**
- Click "Insert Template" for basic structure
- Click "Insert MyTT Template" for MyTT indicator examples
- Templates include comments and examples

**File Upload:**
- Click "Upload .py File" to import existing code
- File content loads into editor
- Edit and save as new indicator

## MyTT Library

MyTT is a comprehensive Chinese technical analysis library with 60+ indicators.

### Available Functions

**Trend Indicators:**
- `MA(CLOSE, N)` - Moving Average
- `EMA(CLOSE, N)` - Exponential Moving Average
- `SMA(CLOSE, N, M)` - Simple Moving Average
- `WMA(CLOSE, N)` - Weighted Moving Average
- `DMA(CLOSE, N)` - Dynamic Moving Average

**Momentum Indicators:**
- `MACD(CLOSE, SHORT, LONG, M)` - Returns (DIF, DEA, MACD)
- `KDJ(CLOSE, HIGH, LOW, N, M1, M2)` - Returns (K, D, J)
- `RSI(CLOSE, N)` - Relative Strength Index
- `WR(CLOSE, HIGH, LOW, N)` - Williams %R
- `CCI(CLOSE, HIGH, LOW, N)` - Commodity Channel Index

**Volatility Indicators:**
- `BOLL(CLOSE, N, P)` - Returns (UPPER, MID, LOWER)
- `ATR(CLOSE, HIGH, LOW, N)` - Average True Range
- `STDDEV(CLOSE, N)` - Standard Deviation
- `VAR(CLOSE, N)` - Variance

**Volume Indicators:**
- `OBV(CLOSE, VOL)` - On-Balance Volume
- `MFI(CLOSE, HIGH, LOW, VOL, N)` - Money Flow Index
- `VROC(VOL, N)` - Volume Rate of Change
- `VWAP(CLOSE, HIGH, LOW, VOL)` - Volume Weighted Average Price

**Custom Functions:**
- `REF(SERIES, N)` - Reference N periods ago
- `MAX(SERIES, N)` - Max value in N periods
- `MIN(SERIES, N)` - Min value in N periods
- `SUM(SERIES, N)` - Sum of N periods
- `COUNT(COND, N)` - Count true conditions in N periods
- `CROSS(S1, S2)` - S1 crosses above S2
- `EVERY(COND, N)` - Condition true for all N periods
- `EXIST(COND, N)` - Condition true for any of N periods

### MyTT Usage Examples

**MACD Indicator:**
```python
def calculate(data):
    """MACD indicator with DIF, DEA, MACD histogram"""
    DIF, DEA, MACD_hist = MACD(data['close'].values, SHORT=12, LONG=26, M=9)

    return {
        'DIF': DIF,
        'DEA': DEA,
        'MACD': MACD_hist
    }
```

**KDJ Indicator:**
```python
def calculate(data):
    """KDJ stochastic indicator"""
    K, D, J = KDJ(
        data['close'].values,
        data['high'].values,
        data['low'].values,
        N=9, M1=3, M2=3
    )

    return {
        'K': K,
        'D': D,
        'J': J
    }
```

**Bollinger Bands:**
```python
def calculate(data):
    """Bollinger Bands with 20-period, 2 std dev"""
    UPPER, MID, LOWER = BOLL(data['close'].values, N=20, P=2)

    return {
        'UPPER': UPPER,
        'MID': MID,
        'LOWER': LOWER
    }
```

## Dependencies

### Automatic Dependency Detection

StockViewer automatically detects when indicators reference other indicators:

```python
def calculate(data):
    """This indicator depends on SMA_20"""
    sma = data['SMA_20']  # ← System detects this dependency
    price = data['close']
    return (price - sma) / sma * 100
```

**Detection includes:**
- Direct column references: `data['SMA_20']`
- Bracket notation: `data["SMA_20"]`
- Group indicators: `data['MACD:DIF']`
- Comments are ignored

### Dependency Management

**Calculation Order:**
- Dependencies calculated first via topological sorting
- Ensures data availability when indicator runs
- Prevents circular dependencies

**Cascade Deletion:**
- Deleting an indicator warns if others depend on it
- Option to cascade delete all dependent indicators
- Or cancel and keep dependencies intact

**Example Chain:**
```
Price Data (OHLC)
    ↓
SMA_20 (depends on close)
    ↓
SMA_Deviation (depends on SMA_20)
    ↓
Buy_Signal (depends on SMA_Deviation)
```

Deletion order: Must delete Buy_Signal before SMA_Deviation, before SMA_20.

### Circular Dependencies

**Not Allowed:**
```python
# Indicator A
def calculate(data):
    return data['IndicatorB'] * 2  # Depends on B

# Indicator B
def calculate(data):
    return data['IndicatorA'] / 2  # Depends on A ← ERROR!
```

**Error Message:**
```
Circular dependency detected for indicator: IndicatorA
Dependency chain: IndicatorA → IndicatorB → IndicatorA
```

## Code Examples

### Example 1: Simple Moving Average

```python
def calculate(data):
    """
    20-day Simple Moving Average

    Args:
        data: DataFrame with 'close' column

    Returns:
        Series with 20-period moving average
    """
    return data['close'].rolling(window=20).mean()
```

**Configuration:**
- Type: Custom Python
- Output Column: `SMA_20`

### Example 2: RSI (Relative Strength Index)

```python
def calculate(data):
    """
    14-day Relative Strength Index

    Formula:
        RSI = 100 - (100 / (1 + RS))
        RS = Average Gain / Average Loss
    """
    import pandas as pd

    delta = data['close'].diff()
    gain = delta.where(delta > 0, 0).rolling(14).mean()
    loss = -delta.where(delta < 0, 0).rolling(14).mean()

    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))

    return rsi
```

**Configuration:**
- Type: Custom Python
- Output Column: `RSI_14`

### Example 3: Exponential Moving Average

```python
def calculate(data):
    """
    12-day Exponential Moving Average

    Args:
        data: DataFrame with 'close' column

    Returns:
        Series with exponential moving average
    """
    return data['close'].ewm(span=12, adjust=False).mean()
```

**Configuration:**
- Type: Custom Python
- Output Column: `EMA_12`

### Example 4: MACD Using MyTT

```python
def calculate(data):
    """
    MACD indicator using MyTT library

    Parameters:
        SHORT=12, LONG=26, M=9

    Returns:
        dict with DIF, DEA, MACD values
    """
    DIF, DEA, MACD_hist = MACD(
        data['close'].values,
        SHORT=12,
        LONG=26,
        M=9
    )

    return {
        'DIF': DIF,
        'DEA': DEA,
        'MACD': MACD_hist
    }
```

**Configuration:**
- Type: MyTT Library Group
- Group Name: `MACD`
- Expected Outputs: `DIF, DEA, MACD`

**Resulting Columns:**
- `MACD:DIF`
- `MACD:DEA`
- `MACD:MACD`

### Example 5: Bollinger Bands

```python
def calculate(data):
    """
    Bollinger Bands (20-period, 2 std dev)

    Returns:
        dict with UPPER, MID, LOWER bands
    """
    UPPER, MID, LOWER = BOLL(
        data['close'].values,
        N=20,
        P=2
    )

    return {
        'UPPER': UPPER,
        'MID': MID,
        'LOWER': LOWER
    }
```

**Configuration:**
- Type: MyTT Library Group
- Group Name: `BOLL`
- Expected Outputs: `UPPER, MID, LOWER`

### Example 6: Using Dependencies

```python
def calculate(data):
    """
    MACD Signal (requires MACD group indicator)

    Returns 1 when DIF crosses above DEA (buy signal)
    Returns -1 when DIF crosses below DEA (sell signal)
    Returns 0 otherwise
    """
    import numpy as np

    dif = data['MACD:DIF']
    dea = data['MACD:DEA']

    # Detect crossovers
    signal = np.zeros(len(data))

    for i in range(1, len(data)):
        if dif.iloc[i-1] <= dea.iloc[i-1] and dif.iloc[i] > dea.iloc[i]:
            signal[i] = 1  # Golden cross (buy)
        elif dif.iloc[i-1] >= dea.iloc[i-1] and dif.iloc[i] < dea.iloc[i]:
            signal[i] = -1  # Death cross (sell)

    return signal
```

**Configuration:**
- Type: Custom Python
- Output Column: `MACD_Signal`
- Dependencies: `MACD` (auto-detected)

### Example 7: ATR (Average True Range)

```python
def calculate(data):
    """
    14-day Average True Range (volatility indicator)
    """
    import pandas as pd

    high = data['high']
    low = data['low']
    close = data['close']

    # True Range = max(H-L, |H-C_prev|, |L-C_prev|)
    hl = high - low
    hc = abs(high - close.shift(1))
    lc = abs(low - close.shift(1))

    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    atr = tr.rolling(14).mean()

    return atr
```

**Configuration:**
- Type: Custom Python
- Output Column: `ATR_14`

## Best Practices

### Performance Optimization

1. **Use Vectorized Operations**
   ```python
   # Good: Vectorized
   return data['close'].rolling(20).mean()

   # Bad: Loop (slow)
   result = []
   for i in range(len(data)):
       result.append(data['close'].iloc[max(0, i-20):i].mean())
   return result
   ```

2. **Avoid Loops When Possible**
   - Use pandas built-in functions (`.rolling()`, `.ewm()`, `.diff()`)
   - Use numpy array operations
   - MyTT functions are already optimized

3. **Cache Intermediate Results**
   ```python
   # Calculate once, use multiple times
   close_diff = data['close'].diff()
   gain = close_diff.where(close_diff > 0, 0)
   loss = -close_diff.where(close_diff < 0, 0)
   ```

### Code Quality

1. **Add Docstrings**
   - Explain what the indicator calculates
   - Document parameters and return values
   - Include formula or algorithm description

2. **Handle Edge Cases**
   ```python
   # Handle division by zero
   denominator = data['SMA_20']
   return np.where(denominator != 0, data['close'] / denominator, np.nan)
   ```

3. **Return Correct Type**
   - Custom Python: Return pandas Series
   - MyTT Group: Return dict with arrays/series

4. **Use Descriptive Names**
   - Good: `SMA_20`, `RSI_14`, `MACD`, `BOLL_20_2`
   - Bad: `ind1`, `myindicator`, `test`

### Security

1. **Never Import Dangerous Modules**
   - Blocked: `os`, `subprocess`, `sys`, `eval`, `exec`, `open`
   - Allowed: `pandas`, `numpy`, `MyTT functions`

2. **Stay Within Sandbox**
   - No file system access
   - No network requests
   - Only data processing

3. **Validate Before Saving**
   - Always click "Validate Code" button
   - Fix errors before creating indicator
   - Test on sample data

## Troubleshooting

### Common Errors

**1. Missing Required Function**
```
Error: Strategy must define a calculate(data) function
```
**Solution**: Ensure your code includes `def calculate(data):` function

**2. Wrong Return Type**
```
Error: calculate() must return a Series
```
**Solution**: Return pandas Series for Custom Python indicators
```python
return data['close'].rolling(20).mean()  # Returns Series ✓
```

**3. Wrong Return Type (Group)**
```
Error: Group indicator must return a dictionary
```
**Solution**: Return dict for MyTT Group indicators
```python
return {
    'DIF': dif_array,
    'DEA': dea_array,
    'MACD': macd_array
}  # Returns dict ✓
```

**4. Circular Dependency**
```
Error: Circular dependency detected
```
**Solution**: Remove circular references between indicators

**5. Security Violation**
```
Error: Code contains dangerous imports (os, subprocess, ...)
```
**Solution**: Remove blocked imports. Use only pandas, numpy, MyTT.

**6. Calculation Timeout**
```
Error: Python execution timeout (5 minutes)
```
**Solution**:
- Optimize code (use vectorized operations)
- Reduce dataset size
- Or increase timeout in `.env.local`:
  ```bash
  PYTHON_TIMEOUT_MS=600000  # 10 minutes
  ```

**7. Missing Dependency**
```
Error: KeyError: 'SMA_20'
```
**Solution**:
- Ensure `SMA_20` indicator exists
- Apply `SMA_20` to stock before applying dependent indicator
- Dependencies auto-calculate in correct order

### Debug Tips

1. **Test with Simple Data**
   - Create indicator
   - Apply to one stock first
   - Check CSV for new column

2. **Check Dependency Order**
   - View indicator list
   - Dependencies shown for each indicator
   - Calculation order is automatic

3. **Validate Incrementally**
   - Write basic version first
   - Validate and test
   - Add complexity gradually

4. **Use Print for Debugging** (won't work in production)
   - Better: Return intermediate results as separate indicators
   - Test each step independently

5. **Check MyTT Function Signatures**
   - Use syntax help in editor
   - Check parameter names (uppercase)
   - Verify return value count

## Next Steps

- **[Backtesting](BACKTESTING.md)** - Use indicators in trading strategies
- **[Charts](CHARTS.md)** - Visualize indicators on charts
- **[API Reference](API.md)** - Indicator API endpoints
- **[Architecture](ARCHITECTURE.md)** - How indicator execution works

---

**Need Help?** Check the troubleshooting section or review the code examples above.
