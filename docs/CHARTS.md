# Charts & Visualization Documentation

Comprehensive guide to the chart visualization system in StockViewer.

## Table of Contents

- [Overview](#overview)
- [Triple Chart Layout](#triple-chart-layout)
- [Candlestick Chart](#candlestick-chart)
- [Indicator Charts](#indicator-charts)
- [Data Panel](#data-panel)
- [Indicator Selectors](#indicator-selectors)
- [Navigation & Interaction](#navigation--interaction)
- [Color System](#color-system)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

StockViewer uses **TradingView Lightweight Charts** to provide professional-grade visualization with:

- **Triple Chart Layout**: Candlestick + 2 independent indicator charts
- **Synchronized Navigation**: All charts share the same time range
- **Real-time Crosshair**: Track values across all charts simultaneously
- **Collapsible Selectors**: Maximize chart space when needed
- **Color Consistency**: Shared color palette across charts and selectors

**Technology:**
- TradingView Lightweight Charts (lightweight-charts library)
- React hooks for state management
- Tailwind CSS for styling
- Responsive design for various screen sizes

## Triple Chart Layout

### Layout Structure

```
┌─────────────────────────────────────────────────┐
│ Dataset Selector                                │
├─────────────────────────────────────────────────┤
│                                                 │
│         CANDLESTICK CHART (OHLC)                │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│         INDICATOR CHART 1                       │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│         INDICATOR CHART 2                       │
│                                                 │
├─────────────────────────────────────────────────┤
│ Data Panel (OHLC + Indicator Values)            │
└─────────────────────────────────────────────────┘
```

### Why Three Charts?

1. **Candlestick Chart**: Always shows price action (OHLC)
2. **Indicator Chart 1**: Custom indicators of your choice
3. **Indicator Chart 2**: Additional indicators without overcrowding

**Benefits:**
- Avoid cluttering one chart with too many indicators
- Group related indicators together
- Compare different indicator types side-by-side
- Maintain readability with complex analysis

### Chart Synchronization

All three charts are synchronized:

- **Time Range**: Zoom on one chart = all charts zoom
- **Crosshair Position**: Hover over one chart = crosshair appears on all
- **Pan Operations**: Drag on candlestick chart = all charts follow
- **Data Loading**: All charts update together

## Candlestick Chart

### Display

**Candle Coloring:**
- **Green Candle**: Close &gt; Open (bullish)
- **Red Candle**: Close &lt; Open (bearish)
- **Wicks**: High and low of the period

**Components:**
- Body: Open to close price range
- Upper wick: High above body
- Lower wick: Low below body

### Overlays

**Trade Markers** (during backtest results):
- **Green Triangle (▲)**: Buy signal
- **Red Triangle (▼)**: Sell signal
- Positioned at execution date
- Hover to see trade details

### Time Scale

- **X-Axis**: Date/time
- **Auto-formatting**: Adjusts based on zoom level
  - Zoomed out: Year labels (2024)
  - Medium zoom: Month labels (Jan, Feb)
  - Zoomed in: Day labels (15, 16, 17)

### Price Scale

- **Y-Axis**: Price (¥)
- **Auto-scaling**: Adjusts to visible data range
- **Right-aligned**: Price labels on right side

## Indicator Charts

### Chart 1 & Chart 2

Two independent charts for displaying technical indicators:

**Features:**
- **Independent Selection**: Choose different indicators for each chart
- **Multi-line Support**: Display multiple indicators on same chart
- **Auto-scaling**: Y-axis adjusts to indicator value ranges
- **Color Coding**: Each indicator gets unique color
- **Synchronized Time**: Shares time range with candlestick chart

### Indicator Selection

**Chart 1 Selector** (Collapsible):
- Above Chart 1
- Select multiple indicators via checkboxes
- Color badge shows line color
- Collapse to maximize chart space

**Chart 2 Selector** (Collapsible):
- Above Chart 2
- Independent from Chart 1
- Same interaction pattern
- Color consistency maintained

### Available Indicators

**Base Indicators** (always available):
- `volume`: Trading volume
- `turnover`: Turnover amount
- `amplitude`: Price amplitude %
- `change_pct`: Daily change %
- `change_amount`: Daily change amount
- `turnover_rate`: Turnover rate %

**Custom Indicators:**
- All user-created indicators
- Group indicators (e.g., `MACD:DIF`, `MACD:DEA`)
- Indicator names dynamically populate from CSV columns

### Line Rendering

**How Lines Are Drawn:**
```javascript
// Each enabled indicator gets its own line series
const lineSeries = chart.addLineSeries({
  color: indicatorColors[indicatorName],
  lineWidth: 2,
  crosshairMarkerVisible: true,
  crosshairMarkerRadius: 4,
  lastValueVisible: true,
  priceLineVisible: false,
})

// Data points from CSV
lineSeries.setData([
  { time: '2024-01-01', value: 10.5 },
  { time: '2024-01-02', value: 10.8 },
  // ...
])
```

**Line Styles:**
- Solid lines (2px width)
- Smooth curves (no jagged edges)
- Crosshair markers on hover
- Last value label on Y-axis

## Data Panel

### Purpose

Real-time display of values at crosshair position:

**What It Shows:**
- Current date at crosshair
- OHLC values at that date
- All enabled indicator values at that date
- Color-coded to match chart lines

### Layout

```
┌─────────────────────────────────────────────────┐
│ Date: 2024-01-15                                │
│                                                 │
│ O: ¥100.00  H: ¥105.00  L: ¥98.00  C: ¥102.00   │
│                                                 │
│ Chart 1 Indicators:                             │
│   • SMA_20: 101.50                              │
│   • EMA_12: 102.30                              │
│                                                 │
│ Chart 2 Indicators:                             │
│   • RSI_14: 65.42                               │
│   • MACD:DIF: 1.23                              │
│   • MACD:DEA: 0.98                              │
└─────────────────────────────────────────────────┘
```

### Interaction

- **Auto-update**: Values change as you move crosshair
- **Color dots**: Match indicator line colors
- **Precision**: 2 decimal places for prices, varies for indicators
- **Grouped**: Indicators grouped by chart (Chart 1 / Chart 2)

### No Data State

When crosshair is not active:
```
No data - Hover over the chart to see values
```

## Indicator Selectors

### Collapsible Panels

**Chart 1 Selector:**
- Click "Chart 1 Indicators ▼" to collapse/expand
- Saves vertical space
- Remembers state during session

**Chart 2 Selector:**
- Click "Chart 2 Indicators ▼" to collapse/expand
- Independent from Chart 1
- Expands by default

### Checkbox List

**For Each Indicator:**
- ☐ Checkbox to enable/disable
- Color badge (■) showing line color
- Indicator name

**Example:**
```
☑ ■ SMA_20
☑ ■ EMA_12
☐ ■ RSI_14
```

### Indicator Organization

**Grouping** (in some implementations):
- Base indicators grouped together
- Custom indicators grouped together
- Group indicators shown with `:` notation (e.g., `MACD:DIF`)

**Alphabetical Sorting:**
- Indicators sorted alphabetically
- Easier to find specific indicator

## Navigation & Interaction

### Mouse Interactions

**Scrolling (on any chart):**
- **Scroll up**: Zoom in (closer time view)
- **Scroll down**: Zoom out (wider time view)
- All charts zoom together

**Dragging (on candlestick chart):**
- **Click and drag**: Pan through time
- Move left to see older data
- Move right to see newer data
- All charts pan together

**Hovering:**
- **Move mouse**: Crosshair follows cursor
- Crosshair appears on all three charts
- Data panel updates with values at cursor position

### Touch Interactions (Mobile)

- **Pinch**: Zoom in/out
- **Swipe**: Pan through time
- **Tap**: Show crosshair at position

### Keyboard Shortcuts

Provided by TradingView Lightweight Charts:

- **Arrow Left/Right**: Pan left/right
- **+/-**: Zoom in/out
- **Home**: Jump to beginning of data
- **End**: Jump to end of data

### Fit Content

**Auto-fit on Load:**
- Charts automatically fit all data on initial load
- Entire time range visible

**Manual Reset:**
- Double-click on chart to reset zoom
- Returns to "fit all data" view

## Color System

### Color Palette

Shared across charts and selectors for consistency:

```javascript
const INDICATOR_COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#ea580c', // Orange
  '#9333ea', // Purple
  '#0891b2', // Cyan
  '#ca8a04', // Yellow
  '#e11d48', // Pink
  '#65a30d', // Lime
  '#0369a1', // Sky
]
```

### Color Assignment

1. **First indicator**: Gets first color (blue)
2. **Second indicator**: Gets second color (red)
3. **Subsequent indicators**: Cycle through palette
4. **Overflow**: Wraps back to beginning if &gt;10 indicators

### Consistency

**Same Color Everywhere:**
- Chart line color = selector badge color
- Data panel color dot = chart line color
- User can visually match indicator across UI

### Customization

**Future Feature:**
- Allow users to choose custom colors
- Save color preferences per indicator

## Best Practices

### Chart Organization

1. **Group Related Indicators**
   - Put trend indicators together (Chart 1: SMA, EMA)
   - Put oscillators together (Chart 2: RSI, MACD)

2. **Avoid Overcrowding**
   - Limit to 3-5 indicators per chart
   - Too many lines = hard to read
   - Use collapse feature liberally

3. **Scale Compatibility**
   - Group indicators with similar value ranges
   - Don't mix volume (millions) with RSI (0-100) on same chart
   - Use separate charts for different scales

### Performance

1. **Disable Unused Indicators**
   - Uncheck indicators you're not currently viewing
   - Reduces rendering load
   - Faster chart updates

2. **Limit Data Range**
   - For large datasets, consider filtering date range
   - Charts render faster with less data
   - Use zoom for detailed analysis

3. **Close Unused Datasets**
   - Only load dataset you're actively viewing
   - Switching datasets is fast
   - Reduces memory usage

### Visual Clarity

1. **Use Contrasting Colors**
   - Default palette provides good contrast
   - Avoid similar colors on same chart

2. **Meaningful Names**
   - Name indicators clearly (e.g., `SMA_20`, not `ind1`)
   - Easier to identify in selectors and data panel

3. **Collapse When Not Needed**
   - Collapse selectors to maximize chart space
   - Expand only when changing indicators

## Troubleshooting

### Chart Not Displaying

**Symptom**: Blank chart area

**Solutions:**
1. Check dataset is selected in dropdown
2. Ensure CSV file has valid data
3. Check browser console for errors
4. Try selecting a different dataset
5. Refresh the page

### Indicators Not Showing

**Symptom**: Checkbox is checked but no line appears

**Solutions:**
1. Ensure indicator column exists in CSV
2. Check if indicator has null/NaN values (won't render)
3. Verify chart has data in the time range
4. Check if line color is too similar to background
5. Try zooming out to see if line is outside visible range

### Crosshair Not Working

**Symptom**: Hovering doesn't show crosshair or update data panel

**Solutions:**
1. Make sure mouse is over chart area (not selectors)
2. Check if chart finished loading
3. Try clicking on chart first to focus
4. Refresh the page if issue persists

### Charts Not Synchronized

**Symptom**: Scrolling/zooming only affects one chart

**Solutions:**
1. This shouldn't happen (bug if it does)
2. Refresh the page
3. Check browser console for errors
4. Report issue if reproducible

### Slow Chart Rendering

**Symptom**: Charts lag or freeze when interacting

**Solutions:**
1. Disable some indicators (reduce line count)
2. Use smaller dataset (filter date range)
3. Close other browser tabs (free up memory)
4. Check CPU usage (other apps hogging resources)
5. Try a different browser

### Wrong Values in Data Panel

**Symptom**: Data panel shows incorrect values for date

**Solutions:**
1. Check CSV file has correct data for that date
2. Ensure indicator calculations are correct
3. Verify date format in CSV (YYYY-MM-DD)
4. Check for data gaps (missing dates)

### Colors Not Consistent

**Symptom**: Chart line color doesn't match selector badge

**Solutions:**
1. This shouldn't happen (bug if it does)
2. Refresh the page
3. Clear browser cache
4. Report issue with details

## Advanced Features

### Trade Markers (Backtest Results)

When viewing backtest results, trade markers appear on the candlestick chart:

**Buy Markers (Green ▲):**
- Positioned at execution date and price
- Hover to see:
  - Signal date
  - Execution date
  - Signal price
  - Execution price
  - Slippage %
  - Trade value

**Sell Markers (Red ▼):**
- Same information as buy markers
- Positioned at sell execution point

**Visibility:**
- Only shown on backtest results page
- Not shown on regular viewer page
- Toggle via future feature

### Equity Curve (Backtest Results)

Separate chart showing portfolio value over time:

**Chart Type:**
- Line chart (not candlestick)
- Single line representing portfolio value
- Blue color

**Features:**
- Shows total portfolio value (cash + shares × price)
- Visualizes strategy performance
- Peaks and troughs indicate max drawdown
- Slope indicates rate of return

### Custom Time Ranges (Future)

**Planned Features:**
- Date range selector
- Quick filters (1M, 3M, 6M, 1Y, All)
- Save custom ranges
- Compare multiple time periods

## Integration with Other Features

### With Indicators

**Flow:**
1. Create indicator (Indicator Manager)
2. Apply to stock (adds column to CSV)
3. Select dataset (Viewer page)
4. Enable indicator in Chart 1 or Chart 2 selector
5. View line on chart

### With Backtesting

**Flow:**
1. Create strategy (uses indicators)
2. Run backtest
3. View results with:
   - Price chart + trade markers
   - Equity curve
   - Indicator charts with strategy indicators
   - Data panel showing values at each trade

### With Datasets

**Flow:**
1. Add stock (Dataset Management)
2. Stock appears in dataset dropdown
3. Select stock to view charts
4. Charts load OHLC + indicator data from CSV

## Next Steps

- **[Indicators](INDICATORS.md)** - Create indicators to visualize
- **[Backtesting](BACKTESTING.md)** - View backtest results with charts
- **[Datasets & Groups](DATASETS.md)** - Manage data for charting
- **[API Reference](API.md)** - Dataset API endpoints

---

**Need Help?** Check the troubleshooting section or try the best practices above.
