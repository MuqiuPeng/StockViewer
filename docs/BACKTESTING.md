# Backtesting Documentation

Comprehensive guide to backtesting trading strategies in StockViewer.

## Table of Contents

- [Overview](#overview)
- [Trading Strategies](#trading-strategies)
- [Execution Modes](#execution-modes)
- [Signal Types](#signal-types)
- [Running Backtests](#running-backtests)
- [Performance Metrics](#performance-metrics)
- [Results Analysis](#results-analysis)
- [Group Backtesting](#group-backtesting)
- [Backtest History](#backtest-history)
- [Best Practices](#best-practices)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

StockViewer's backtesting engine allows you to:

- Test trading strategies on historical data
- Simulate realistic trade execution with slippage
- Analyze comprehensive performance metrics
- Backtest on single stocks or portfolios
- Visualize equity curves and trade markers
- Compare strategy performance across multiple stocks

**Key Features:**
- Manual backtesting (no event-driven complexity)
- Two execution modes (same-day close vs next-day open)
- Commission calculation
- Slippage tracking
- Portfolio management (cash + shares)
- Comprehensive risk-adjusted metrics

## Trading Strategies

### Strategy Structure

Strategies are Python functions that generate trading signals:

```python
def calculate(data, parameters):
    """
    Generate trading signals from stock data.

    Args:
        data: pandas DataFrame with columns:
            - date (datetime index)
            - open, high, low, close, volume (float)
            - All calculated indicators

        parameters: dict of configurable parameters
            Example: {'short_window': 10, 'long_window': 30}

    Returns:
        list of dicts with format:
        [
            {
                'date': '2024-01-15',
                'type': 'v' or 'a',
                'amount': 10000,
                'execution': 'close' or 'next_open'  # Optional
            },
            ...
        ]
    """
    signals = []

    # Your strategy logic here

    return signals
```

### Signal Format

Each signal is a dictionary with required and optional fields:

**Required Fields:**
- `date` (str): Signal date in `YYYY-MM-DD` format
- `type` (str): `'v'` (value-based) or `'a'` (amount-based)
- `amount` (float): Trade size (positive = buy, negative = sell)

**Optional Fields:**
- `execution` (str): `'close'` (default) or `'next_open'`

### Creating Strategies

1. Navigate to **Backtest** page
2. Click **"Manage Strategies"**
3. Click **"+ Create New Strategy"**
4. Fill in details:
   - Name
   - Description
   - Python code (use Monaco editor)
5. Click **"Validate Code"** to check syntax and security
6. Click **"Create"** to save

## Execution Modes

### Same-Day Close Execution

```python
signals.append({
    'date': '2024-01-15',
    'type': 'v',
    'amount': 10000,
    'execution': 'close'  # Execute at same day's close price
})
```

**Characteristics:**
- **Immediate Execution**: Trade fills at signal day's closing price
- **No Slippage**: Signal price = execution price
- **Optimistic**: Assumes you can act on close price immediately
- **Use Case**: Quick strategies, intraday execution assumptions

**Timeline:**
```
Day 1: Signal generated at close → Execute at close
        Signal Price = $100
        Execution Price = $100
        Slippage = 0%
```

### Next-Day Open Execution

```python
signals.append({
    'date': '2024-01-15',
    'type': 'v',
    'amount': 10000,
    'execution': 'next_open'  # Execute at next day's open price
})
```

**Characteristics:**
- **Realistic Execution**: Trade fills at next day's opening price
- **Slippage Tracking**: Gap between close and next open
- **Overnight Risk**: Accounts for gap risk
- **Use Case**: End-of-day strategies, realistic simulation

**Timeline:**
```
Day 1: Signal generated at close → Wait overnight
        Signal Price = $100 (Day 1 close)

Day 2: Execute at open
        Execution Price = $102 (Day 2 open)
        Slippage = +2.0%
```

### Slippage Calculation

```
Slippage % = (Execution Price - Signal Price) / Signal Price × 100

Positive slippage = Worse fill (buy higher, sell lower)
Negative slippage = Better fill (buy lower, sell higher)
```

**Example: Buy Signal**
```
Signal: Buy at Day 1 close = $100
Execute: Next day open = $102
Slippage = ($102 - $100) / $100 = +2.0% (worse fill)
```

**Example: Sell Signal**
```
Signal: Sell at Day 1 close = $100
Execute: Next day open = $98
Slippage = ($98 - $100) / $100 = -2.0% (worse fill, you sold lower)
```

## Signal Types

### Value-Based Signals (`type: 'v'`)

Trade a fixed dollar amount:

```python
signals.append({
    'date': '2024-01-15',
    'type': 'v',
    'amount': 10000,  # Buy $10,000 worth
})

signals.append({
    'date': '2024-02-15',
    'type': 'v',
    'amount': -5000,  # Sell $5,000 worth
})
```

**Calculation:**
```
Shares = Dollar Amount / Execution Price

Example:
  Amount = $10,000
  Price = $100
  Shares = 10,000 / 100 = 100 shares
```

**Use Cases:**
- Fixed capital allocation per trade
- Position sizing based on portfolio percentage
- Dollar-cost averaging strategies

### Amount-Based Signals (`type: 'a'`)

Trade a specific number of shares:

```python
signals.append({
    'date': '2024-01-15',
    'type': 'a',
    'amount': 100,  # Buy 100 shares
})

signals.append({
    'date': '2024-02-15',
    'type': 'a',
    'amount': -50,  # Sell 50 shares
})
```

**Calculation:**
```
Dollar Amount = Shares × Execution Price

Example:
  Shares = 100
  Price = $100
  Amount = 100 × 100 = $10,000
```

**Use Cases:**
- Fixed share quantities
- Strategies based on specific lot sizes
- Partial position exits

## Running Backtests

### Single Stock Backtest

1. Navigate to **Backtest** page
2. Select a strategy from dropdown
3. Choose **"Single Stock"** mode
4. Select stock from dropdown
5. Configure parameters:
   - **Initial Capital**: Starting cash (default: ¥100,000)
   - **Commission Rate**: % per trade (default: 0.1%)
   - **Date Range**: Start and end dates (optional)
6. Click **"Run Backtest"**

### Group Backtest

1. Navigate to **Backtest** page
2. Select a strategy from dropdown
3. Choose **"Group"** mode
4. Select group from dropdown
5. Configure parameters (same as single stock)
6. Click **"Run Backtest"**
7. View aggregated metrics across all stocks

**How It Works:**
- Strategy runs on each stock independently
- Metrics are aggregated (mean, sum, or max as appropriate)
- Individual stock results shown in table
- Compare performance across portfolio

## Performance Metrics

### Summary Metrics

**Initial Capital**
- Starting cash available for trading
- Set in backtest configuration

**Final Value**
- Portfolio value at end: `cash + (shares × last_price)`
- Includes unrealized gains/losses

**Total Return**
- Absolute profit/loss: `Final Value - Initial Capital`
- Example: ¥100,000 → ¥120,000 = ¥20,000 return

**Total Return %**
- Percentage gain/loss: `(Final Value - Initial Capital) / Initial Capital × 100%`
- Example: ¥20,000 / ¥100,000 = 20%

**Buy & Hold Return %**
- Return if you bought at start and held to end
- Comparison benchmark for strategy

**Total Trades**
- Number of executed trades (buy + sell)

### Risk-Adjusted Metrics

**Max Drawdown**
- Largest peak-to-trough decline in equity
- Measures worst-case loss from any high point
- Formula: `(Trough Value - Peak Value) / Peak Value × 100%`
- Lower is better (less drawdown)

**Sharpe Ratio**
- Risk-adjusted return metric
- Formula: `(Mean Return - Risk-Free Rate) / Std Dev of Returns`
- Interpretation:
  - &gt; 1: Good
  - &gt; 2: Very good
  - &gt; 3: Excellent
- Higher is better

**Sortino Ratio**
- Like Sharpe but only penalizes downside volatility
- Formula: `(Mean Return - Risk-Free Rate) / Downside Std Dev`
- Better for strategies with asymmetric returns
- Higher is better

**Calmar Ratio**
- Return per unit of drawdown risk
- Formula: `Annual Return / Max Drawdown`
- Interpretation:
  - &gt; 3: Good
  - &gt; 5: Excellent
- Higher is better

**Profit Factor**
- Ratio of gross profit to gross loss
- Formula: `Sum(Winning Trades) / Sum(Losing Trades)`
- Interpretation:
  - &gt; 1.5: Good
  - &gt; 2: Very good
  - &lt; 1: Losing strategy
- Higher is better

### Trade Statistics

**Winning Trades**
- Number of profitable trades
- Trade is winning if exit value &gt; entry value

**Losing Trades**
- Number of unprofitable trades

**Win Rate**
- Percentage of profitable trades
- Formula: `Winning Trades / Total Trades × 100%`
- &gt; 50% is good, but not sufficient alone

**Average Win**
- Mean profit per winning trade
- Higher is better

**Average Loss**
- Mean loss per losing trade
- Lower (less negative) is better

### Execution & Slippage Metrics

**Same-Day Trades**
- Count of trades executed at same-day close
- No slippage for these trades

**Next-Day Trades**
- Count of trades executed at next-day open
- Subject to overnight slippage

**Average Slippage %**
- Mean slippage across all next-day trades
- Formula: `Mean((Execution Price - Signal Price) / Signal Price × 100%)`
- Positive = worse fills, negative = better fills

**Total Slippage Cost**
- Cumulative monetary impact of slippage
- Formula: `Sum(|Execution Price - Signal Price| × Shares)`
- Lower is better

### Advanced Metrics

**Expectancy**
- Average profit/loss per trade
- Formula: `(Avg Win × Win Rate) - (Avg Loss × Loss Rate)`
- Positive means profitable long-term
- Higher is better

**Recovery Factor**
- How quickly strategy recovers from drawdowns
- Formula: `Total Return / Max Drawdown`
- Higher is better

**Payoff Ratio**
- Average win vs average loss
- Formula: `Avg Win / Avg Loss`
- &gt; 2 is good
- Can be profitable with low win rate if this is high

**Max Win Streak**
- Longest consecutive winning trades
- Indicates strategy consistency

**Max Loss Streak**
- Longest consecutive losing trades
- Risk indicator for drawdown periods

## Results Analysis

### Equity Curve Chart

**What It Shows:**
- Portfolio value over time
- Visual representation of strategy performance
- Peak and trough points

**How to Read:**
- **Upward trend**: Strategy is profitable
- **Flat periods**: No trades or break-even trades
- **Sharp drops**: Significant losses
- **Smooth curve**: Consistent performance
- **Volatile curve**: High risk/reward variation

### Trade Markers on Chart

**Visualization:**
- Green triangles: Buy signals (▲)
- Red triangles: Sell signals (▼)
- Positioned on price chart at execution date

**Information Displayed:**
- Signal date
- Execution date
- Signal price (close at signal time)
- Execution price
- Slippage percentage
- Trade size and value

### Trade History Table

**Columns:**
- **Signal Date**: When signal was generated
- **Exec Date**: When trade executed
- **Type**: Buy or Sell
- **Signal Price**: Close price at signal time
- **Exec Price**: Actual fill price
- **Slippage %**: Price difference percentage
- **Size**: Number of shares
- **Value**: Total trade value
- **Commission**: Fee paid

**Badges:**
- "Next Day" badge for `next_open` executions

**Sorting & Pagination:**
- Click column headers to sort
- Paginated for large trade counts
- Export option (future feature)

## Group Backtesting

### How Group Backtest Works

1. **Strategy Execution**
   - Strategy runs on each stock in group independently
   - Same initial capital for each stock
   - Same commission rate and parameters

2. **Individual Results**
   - Each stock gets its own metrics
   - Trade history per stock
   - Equity curve per stock

3. **Aggregated Metrics**
   - **Mean**: Avg return %, win rate, Sharpe, etc.
   - **Sum**: Total trades, total return (dollar)
   - **Max**: Max drawdown (worst case)
   - **Weighted**: By initial capital or trade count

4. **Results Display**
   - Summary shows aggregated metrics
   - Table shows per-stock performance
   - Sort by any metric
   - Identify best/worst performers

### Use Cases

**Portfolio Diversification**
- Test strategy across sector
- Measure consistency
- Identify which stocks work best

**Robustness Testing**
- Does strategy work on different stocks?
- Or is it overfit to one stock?

**Risk Management**
- Aggregate drawdown
- Correlation between stocks
- Portfolio-level metrics

## Best Practices

### Strategy Development

1. **Start Simple**
   - Test basic moving average crossover
   - Add complexity gradually
   - Validate each addition

2. **Use Indicators**
   - Create custom indicators first
   - Reference them in strategy
   - Reuse across multiple strategies

3. **Define Clear Entry/Exit**
   - Explicit conditions for buy/sell
   - Avoid ambiguous logic
   - Handle edge cases

4. **Test Multiple Timeframes**
   - Bull markets
   - Bear markets
   - Sideways markets

5. **Account for Slippage**
   - Use `next_open` execution for realism
   - Check slippage metrics
   - Adjust strategy if slippage is high

### Risk Management

1. **Position Sizing**
   - Don't risk entire capital on one trade
   - Use value-based signals with fixed allocation
   - Consider portfolio percentage rules

2. **Stop Losses**
   - Implement exit signals
   - Limit maximum loss per trade
   - Protect against large drawdowns

3. **Diversification**
   - Test on multiple stocks (group backtest)
   - Don't overfit to single stock
   - Verify robustness across portfolio

### Performance Evaluation

1. **Don't Focus Only on Return**
   - High return with high drawdown is risky
   - Consider risk-adjusted metrics (Sharpe, Sortino)
   - Evaluate consistency (win streaks, equity curve)

2. **Compare to Benchmark**
   - Buy & Hold return
   - Market index
   - Other strategies

3. **Check Trade Count**
   - Too few trades: Not enough data, may be luck
   - Too many trades: High commission costs
   - Balance frequency with profitability

4. **Analyze Slippage**
   - High slippage erodes profits
   - Optimize entry/exit timing
   - Consider market liquidity

## Examples

### Example 1: Simple Moving Average Crossover

```python
def calculate(data, parameters):
    """
    Buy when short MA crosses above long MA
    Sell when short MA crosses below long MA
    """
    signals = []

    short_window = parameters.get('short_window', 10)
    long_window = parameters.get('long_window', 30)

    data['short_ma'] = data['close'].rolling(short_window).mean()
    data['long_ma'] = data['close'].rolling(long_window).mean()

    for i in range(1, len(data)):
        prev_short = data['short_ma'].iloc[i-1]
        prev_long = data['long_ma'].iloc[i-1]
        curr_short = data['short_ma'].iloc[i]
        curr_long = data['long_ma'].iloc[i]

        # Golden cross: buy signal
        if prev_short <= prev_long and curr_short > curr_long:
            signals.append({
                'date': data.index[i].strftime('%Y-%m-%d'),
                'type': 'v',
                'amount': 10000,  # Buy ¥10,000 worth
                'execution': 'next_open'
            })

        # Death cross: sell signal
        elif prev_short >= prev_long and curr_short < curr_long:
            signals.append({
                'date': data.index[i].strftime('%Y-%m-%d'),
                'type': 'v',
                'amount': -10000,  # Sell ¥10,000 worth
                'execution': 'next_open'
            })

    return signals
```

### Example 2: RSI Mean Reversion

```python
def calculate(data, parameters):
    """
    Buy when RSI < 30 (oversold)
    Sell when RSI > 70 (overbought)

    Requires: RSI_14 indicator
    """
    signals = []

    rsi_oversold = parameters.get('rsi_oversold', 30)
    rsi_overbought = parameters.get('rsi_overbought', 70)
    position_size = parameters.get('position_size', 5000)

    rsi = data['RSI_14']

    for i in range(1, len(data)):
        # Buy when RSI crosses below oversold threshold
        if rsi.iloc[i-1] >= rsi_oversold and rsi.iloc[i] < rsi_oversold:
            signals.append({
                'date': data.index[i].strftime('%Y-%m-%d'),
                'type': 'v',
                'amount': position_size,
                'execution': 'next_open'
            })

        # Sell when RSI crosses above overbought threshold
        elif rsi.iloc[i-1] <= rsi_overbought and rsi.iloc[i] > rsi_overbought:
            signals.append({
                'date': data.index[i].strftime('%Y-%m-%d'),
                'type': 'v',
                'amount': -position_size,
                'execution': 'next_open'
            })

    return signals
```

### Example 3: MACD with Confirmation

```python
def calculate(data, parameters):
    """
    Buy when:
      - MACD DIF crosses above DEA (golden cross)
      - Price is above 50-day MA (uptrend confirmation)

    Sell when:
      - MACD DIF crosses below DEA (death cross)

    Requires: MACD group indicator, SMA_50 indicator
    """
    signals = []

    dif = data['MACD:DIF']
    dea = data['MACD:DEA']
    ma50 = data['SMA_50']
    close = data['close']

    for i in range(1, len(data)):
        # MACD golden cross
        if dif.iloc[i-1] <= dea.iloc[i-1] and dif.iloc[i] > dea.iloc[i]:
            # Confirm with price above 50 MA
            if close.iloc[i] > ma50.iloc[i]:
                signals.append({
                    'date': data.index[i].strftime('%Y-%m-%d'),
                    'type': 'v',
                    'amount': 15000,
                    'execution': 'next_open'
                })

        # MACD death cross
        elif dif.iloc[i-1] >= dea.iloc[i-1] and dif.iloc[i] < dea.iloc[i]:
            signals.append({
                'date': data.index[i].strftime('%Y-%m-%d'),
                'type': 'v',
                'amount': -15000,
                'execution': 'next_open'
            })

    return signals
```

### Example 4: Bollinger Band Breakout

```python
def calculate(data, parameters):
    """
    Buy when price breaks above upper Bollinger Band
    Sell when price breaks below lower Bollinger Band

    Requires: BOLL group indicator
    """
    signals = []

    upper = data['BOLL:UPPER']
    lower = data['BOLL:LOWER']
    close = data['close']

    for i in range(1, len(data)):
        # Breakout above upper band
        if close.iloc[i-1] <= upper.iloc[i-1] and close.iloc[i] > upper.iloc[i]:
            signals.append({
                'date': data.index[i].strftime('%Y-%m-%d'),
                'type': 'a',
                'amount': 100,  # Buy 100 shares
                'execution': 'close'  # Immediate execution
            })

        # Breakdown below lower band
        elif close.iloc[i-1] >= lower.iloc[i-1] and close.iloc[i] < lower.iloc[i]:
            signals.append({
                'date': data.index[i].strftime('%Y-%m-%d'),
                'type': 'a',
                'amount': -100,  # Sell 100 shares
                'execution': 'close'
            })

    return signals
```

## Backtest History

StockViewer automatically saves all backtest runs to a persistent history, allowing you to review, organize, and compare past results.

### Auto-Save

Every successful backtest is automatically saved with:
- Complete backtest configuration (strategy, parameters, date range)
- Full results (metrics, equity curve, trades)
- Target information (stock name, portfolio symbols, or group)
- Execution metadata (timestamp, duration)

**Storage Location:** `data/backtest-history/history.json`

### History Sidebar

Access backtest history through the sidebar:

**Opening the Sidebar:**
1. Click the **"History"** button (top-right of backtest page)
2. Sidebar slides in from the right

**Features:**
- Chronological list of all backtest runs (newest first)
- Quick metrics preview (total return %, Sharpe ratio, trade count)
- Search and filter capabilities
- Star/favorite important backtests
- Delete unwanted entries

**Display Format:**
```
Strategy Name
📊 Stock Name (Code)  or  📈 Portfolio (X stocks)  or  📁 Group: Name
Date & Time
Return: +15.23% (color-coded green/red)
Tags: [tag1] [tag2]
```

### Search and Filtering

**Text Search:**
- Searches strategy names and user notes
- Real-time filtering as you type
- Case-insensitive matching

**Filters:**
- **Starred Only:** Show only favorited backtests
- Combine with text search for refined results

**Usage:**
```
1. Enter search term in search box
2. Check "Starred only" to show favorites
3. Results update instantly
4. Clear search to see all entries
```

### Organizing Backtests

**Starring/Favoriting:**
- Click the star icon (☆/★) on any entry
- Starred backtests can be filtered separately
- Use to mark important results or successful strategies

**Notes:**
- Add custom notes to any backtest
- Searchable text for documentation
- Example: "Best performance on bull market", "Optimized parameters"

**Tags:**
- Add multiple tags to categorize backtests
- Examples: `ma-crossover`, `trending`, `optimization`, `final`
- Searchable and filterable
- Helps organize related backtests

### Viewing Details

Click any history entry to open the detail modal:

**Detail View Shows:**
- Full strategy name and target information
- Complete performance metrics
- Backtest parameters (initial cash, commission, date range)
- User notes (editable)
- Tags (add/remove)

**Actions Available:**
- **Re-run:** Execute the same backtest with original parameters
- **Edit Notes:** Add or update documentation
- **Manage Tags:** Add/remove tags for organization
- **Save Changes:** Persist notes and tags updates

### Re-running Backtests

Quickly re-execute previous backtests:

**Steps:**
1. Open backtest detail modal
2. Click **"Re-run Backtest"** button
3. System executes with same:
   - Strategy
   - Target (stock/portfolio/group)
   - Parameters (cash, commission)
   - Date range (if specified)
4. New results appear
5. New entry auto-saved to history

**Use Cases:**
- Verify previous results
- Test after code changes
- Compare with updated data

### Trade Hover Details

When viewing backtest results, hover over the price chart to see detailed trade information:

**Features:**
- **Previous Trade Panel (Left):** Shows the most recent trade before the hover position
- **Next Trade Panel (Right):** Shows the upcoming trade after the hover position
- **Always Visible:** Panels remain visible with placeholders when no trades exist

**Information Displayed:**
- Trade type (Buy/Sell) with color coding
- Execution date
- Price (¥)
- Share size
- Total value (¥)
- Execution mode (Same Day Close / Next Open)

**Usage:**
- Hover anywhere on the price chart
- Both panels update automatically
- Move cursor to explore different time periods
- Works for both single stock and portfolio backtests

### API Endpoints

**List History:**
```bash
GET /api/backtest-history
GET /api/backtest-history?starred=true
GET /api/backtest-history?strategyId=xxx
GET /api/backtest-history?tags=tag1,tag2
```

**Update Entry:**
```bash
PATCH /api/backtest-history/{id}
{
  "starred": true,
  "notes": "Best result so far",
  "tags": ["optimized", "final"]
}
```

**Delete Entry:**
```bash
DELETE /api/backtest-history/{id}
```

**Re-run Backtest:**
```bash
POST /api/backtest-history/{id}/rerun
```

### Best Practices

**Organization:**
- Star successful strategies for quick reference
- Use consistent tagging scheme (e.g., `strategy-type`, `market-condition`)
- Add notes immediately after running important backtests
- Delete failed or irrelevant backtests to keep history clean

**Naming Strategies:**
- Use descriptive strategy names for easier identification
- Include key parameters in name (e.g., "MA Cross 5/20")
- Maintain consistency across related strategies

**Documentation:**
- Document parameter changes in notes
- Record market conditions or data ranges tested
- Note why certain results were significant
- Track optimization iterations

**Comparison:**
- Use tags to group related backtests
- Run same strategy across different stocks/groups
- Compare starred entries for best performers
- Track performance metrics over time

### Storage Considerations

**File Size:**
- Each backtest stores complete results (equity curve, all trades)
- Large backtests (long date ranges, many trades) increase file size
- Monitor `data/backtest-history/history.json` size

**Cleanup:**
- Regularly delete unwanted entries
- Archive old results if needed
- Consider exporting important backtests separately

**Backup:**
- History file is plain JSON
- Easy to backup manually
- Can be version controlled
- Portable across installations

## Troubleshooting

### Strategy Issues

**No Signals Generated**
```
Backtest shows 0 trades
```
**Solutions:**
- Check strategy logic (conditions may be too strict)
- Verify indicators exist in dataset
- Check date range (signals may be outside range)
- Add debug prints to see intermediate values

**Too Many Signals**
```
Thousands of trades, high commission costs
```
**Solutions:**
- Add filters to reduce noise
- Increase signal threshold
- Add cooldown period between trades

**Strategy Returns Empty List**
```
Error: calculate() must return a list
```
**Solution:**
```python
def calculate(data, parameters):
    signals = []  # Initialize empty list
    # ... logic ...
    return signals  # Return list, not None
```

### Execution Issues

**Insufficient Cash**
```
Trade skipped: Not enough cash
```
**Solutions:**
- Increase initial capital
- Reduce position size
- Implement cash management logic
- Avoid over-leveraging

**Invalid Signal Date**
```
Warning: Signal date not found in data
```
**Solutions:**
- Ensure signal dates match data index
- Use `data.index[i].strftime('%Y-%m-%d')` format
- Check for timezone issues

**Last Day Signal Skipped**
```
Warning: 1 signal(s) skipped - last trading day
```
**Explanation:**
- `next_open` signals on last day can't execute (no next day)
- This is expected behavior
- Strategy generates signal at end of data

### Validation Errors

**Security Violation**
```
Error: Code contains dangerous imports
```
**Solution:** Remove blocked imports (os, subprocess, eval, exec)

**Syntax Error**
```
Error: Syntax Error in strategy code, Line 15: ...
```
**Solution:** Fix Python syntax using Monaco editor error markers

**Missing Function**
```
Error: Strategy must define calculate(data, parameters)
```
**Solution:** Ensure function signature is exact:
```python
def calculate(data, parameters):  # Must have both args
    # ...
```

### Performance Issues

**Backtest Timeout**
```
Error: Python execution timeout
```
**Solutions:**
- Optimize strategy code (remove loops)
- Reduce dataset size (use date range)
- Increase timeout in `.env.local`:
  ```bash
  PYTHON_TIMEOUT_MS=600000  # 10 minutes
  ```

**Slow Backtest**
```
Backtest takes very long to complete
```
**Solutions:**
- Use vectorized operations instead of loops
- Reduce indicator calculations
- Filter data before strategy execution

## Next Steps

- **[Indicators](INDICATORS.md)** - Create indicators for use in strategies
- **[Datasets & Groups](DATASETS.md)** - Manage data and portfolios
- **[API Reference](API.md)** - Backtest API endpoints
- **[Architecture](ARCHITECTURE.md)** - How backtesting works internally

---

**Need Help?** Check the examples section or troubleshooting guide above.
