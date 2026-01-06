#!/usr/bin/env python3
"""
Python backtesting executor using simple manual backtesting.
Reads JSON from stdin, executes strategy, outputs backtest results to stdout.
"""
import sys
import json
import traceback

# Check for required dependencies
try:
    import pandas as pd
    import numpy as np
except ImportError as e:
    output = {
        'success': False,
        'error': f'Missing required dependency: {str(e)}. Please install pandas and numpy.',
        'type': 'ImportError'
    }
    print(json.dumps(output))
    sys.exit(1)

from datetime import datetime
from typing import List, Dict, Any


def manual_backtest(df: pd.DataFrame, signals: List[Dict], initial_cash: float, commission: float) -> Dict[str, Any]:
    """
    Manual backtesting implementation that processes signals chronologically.

    Args:
        df: DataFrame with OHLC data (indexed by date)
        signals: List of trading signals from strategy
        initial_cash: Starting capital
        commission: Commission rate (e.g., 0.001 = 0.1%)

    Returns:
        Dictionary with trades, equity curve, and metrics
    """
    # Initialize portfolio state
    cash = initial_cash
    shares = 0
    trades = []
    equity_curve = []

    # Separate signals by execution timing
    same_day_signals = {}  # Execute at today's close
    next_day_signals = {}  # Execute at next day's open

    for signal in signals:
        signal_date = pd.to_datetime(signal['date']).date()
        execution_mode = signal.get('execution', 'close')  # Default to 'close'

        if execution_mode == 'close':
            if signal_date not in same_day_signals:
                same_day_signals[signal_date] = []
            same_day_signals[signal_date].append(signal)
        else:  # 'next_open'
            if signal_date not in next_day_signals:
                next_day_signals[signal_date] = []
            next_day_signals[signal_date].append(signal)

    # Helper function to execute a trade
    def execute_trade(signal, execution_date, execution_price, signal_date, signal_price, execution_mode):
        nonlocal cash, shares, trades

        signal_type = signal.get('type', 'v')
        amount = float(signal.get('amount', 0))

        if amount == 0:
            return

        # Execute trade based on signal type
        if signal_type == 'v':  # Volume-based (dollar amount)
            if amount > 0:  # Buy
                shares_to_buy = int(amount / execution_price)
                cost = shares_to_buy * execution_price
                total_cost = cost * (1 + commission)

                if total_cost <= cash and shares_to_buy > 0:
                    cash -= total_cost
                    shares += shares_to_buy
                    trades.append({
                        'signal_date': str(signal_date),
                        'execution_date': str(execution_date),
                        'date': str(execution_date),  # For backward compatibility
                        'type': 'buy',
                        'price': execution_price,
                        'signal_price': signal_price,
                        'size': shares_to_buy,
                        'value': cost,
                        'commission': cost * commission,
                        'execution_mode': execution_mode
                    })
            else:  # Sell
                shares_to_sell = min(int(abs(amount) / execution_price), shares)
                value = shares_to_sell * execution_price
                proceeds = value * (1 - commission)

                if shares_to_sell > 0:
                    cash += proceeds
                    shares -= shares_to_sell
                    trades.append({
                        'signal_date': str(signal_date),
                        'execution_date': str(execution_date),
                        'date': str(execution_date),  # For backward compatibility
                        'type': 'sell',
                        'price': execution_price,
                        'signal_price': signal_price,
                        'size': shares_to_sell,
                        'value': value,
                        'commission': value * commission,
                        'execution_mode': execution_mode
                    })

        elif signal_type == 'a':  # Amount-based (share count)
            if amount > 0:  # Buy
                shares_to_buy = int(amount)
                cost = shares_to_buy * execution_price
                total_cost = cost * (1 + commission)

                if total_cost <= cash and shares_to_buy > 0:
                    cash -= total_cost
                    shares += shares_to_buy
                    trades.append({
                        'signal_date': str(signal_date),
                        'execution_date': str(execution_date),
                        'date': str(execution_date),  # For backward compatibility
                        'type': 'buy',
                        'price': execution_price,
                        'signal_price': signal_price,
                        'size': shares_to_buy,
                        'value': cost,
                        'commission': cost * commission,
                        'execution_mode': execution_mode
                    })
            else:  # Sell
                shares_to_sell = min(int(abs(amount)), shares)
                value = shares_to_sell * execution_price
                proceeds = value * (1 - commission)

                if shares_to_sell > 0:
                    cash += proceeds
                    shares -= shares_to_sell
                    trades.append({
                        'signal_date': str(signal_date),
                        'execution_date': str(execution_date),
                        'date': str(execution_date),  # For backward compatibility
                        'type': 'sell',
                        'price': execution_price,
                        'signal_price': signal_price,
                        'size': shares_to_sell,
                        'value': value,
                        'commission': value * commission,
                        'execution_mode': execution_mode
                    })

    # Iterate through each day
    prev_date = None
    prev_close_price = None

    for date, row in df.iterrows():
        current_date = date.date() if hasattr(date, 'date') else date
        current_close = float(row['close'])
        current_open = float(row['open'])

        # Execute next-day signals from previous day (at today's open)
        if prev_date and prev_date in next_day_signals:
            for signal in next_day_signals[prev_date]:
                execute_trade(
                    signal,
                    execution_date=current_date,
                    execution_price=current_open,
                    signal_date=prev_date,
                    signal_price=prev_close_price,
                    execution_mode='next_open'
                )

        # Execute same-day signals (at today's close)
        if current_date in same_day_signals:
            for signal in same_day_signals[current_date]:
                execute_trade(
                    signal,
                    execution_date=current_date,
                    execution_price=current_close,
                    signal_date=current_date,
                    signal_price=current_close,
                    execution_mode='close'
                )

        # Record portfolio value for this day
        portfolio_value = cash + (shares * current_close)
        equity_curve.append({
            'date': str(current_date),
            'value': portfolio_value,
            'cash': cash,
            'shares': shares,
            'stock_value': shares * current_close
        })

        # Update previous day tracking
        prev_date = current_date
        prev_close_price = current_close

    # Skip last-day next_open signals with warning
    if prev_date and prev_date in next_day_signals:
        skipped_count = len(next_day_signals[prev_date])
        print(f"Warning: {skipped_count} signal(s) on last trading day with 'next_open' execution were skipped", file=sys.stderr)

    # Calculate metrics from trades and equity curve
    metrics = calculate_metrics_from_data(equity_curve, trades, initial_cash)

    return {
        'trades': trades,
        'equityCurve': equity_curve,
        'metrics': metrics
    }


def portfolio_backtest(
    data_map: Dict[str, pd.DataFrame],
    signals: List[Dict],
    initial_cash: float,
    commission: float,
    constraints: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Portfolio backtesting with shared capital across multiple stocks.

    Args:
        data_map: Dictionary mapping symbol to OHLC DataFrame
        signals: List of trading signals with 'symbol' field
        initial_cash: Starting capital for entire portfolio
        commission: Commission rate
        constraints: Portfolio constraints (maxPositions, reserveCash, etc.)

    Returns:
        Dictionary with portfolio results including position snapshots
    """
    if constraints is None:
        constraints = {}

    # Initialize portfolio state
    cash = initial_cash
    positions = {}  # symbol -> share count
    trades = []
    equity_curve = []
    position_snapshots = []
    per_symbol_equity_curves = {symbol: [] for symbol in data_map.keys()}  # Track individual equity curves

    # Separate signals by execution timing and symbol
    same_day_signals = {}  # (date, symbol) -> signals
    next_day_signals = {}

    for signal in signals:
        if 'symbol' not in signal:
            print(f"Warning: Portfolio signal missing 'symbol' field, skipping", file=sys.stderr)
            continue

        symbol = signal['symbol']
        if symbol not in data_map:
            print(f"Warning: Signal for unknown symbol '{symbol}', skipping", file=sys.stderr)
            continue

        signal_date = pd.to_datetime(signal['date']).date()
        execution_mode = signal.get('execution', 'close')

        key = (signal_date, symbol)
        if execution_mode == 'close':
            if key not in same_day_signals:
                same_day_signals[key] = []
            same_day_signals[key].append(signal)
        else:
            if key not in next_day_signals:
                next_day_signals[key] = []
            next_day_signals[key].append(signal)

    # Get all unique dates across all symbols
    all_dates = set()
    for df in data_map.values():
        all_dates.update(df.index.date)
    all_dates = sorted(all_dates)

    # Track previous date for next-day execution
    prev_date = None

    # Helper function to execute a trade
    def execute_trade(signal, symbol, execution_date, execution_price, signal_date, signal_price, execution_mode):
        nonlocal cash, positions, trades

        signal_type = signal.get('type', 'v')
        amount = float(signal.get('amount', 0))

        if amount == 0:
            return

        # Check constraints before executing
        current_position_count = sum(1 for shares in positions.values() if shares > 0)

        # Execute trade based on signal type
        if signal_type == 'v':  # Volume-based (dollar amount)
            if amount > 0:  # Buy
                # Check max positions constraint
                if constraints.get('maxPositions'):
                    if symbol not in positions or positions.get(symbol, 0) == 0:
                        # New position
                        if current_position_count >= constraints['maxPositions']:
                            return  # Skip buy, already at max positions

                # Check reserve cash constraint
                if constraints.get('reserveCash'):
                    min_cash = initial_cash * (constraints['reserveCash'] / 100)
                    if cash < min_cash:
                        return  # Skip buy, need to maintain reserve

                shares_to_buy = int(amount / execution_price)
                cost = shares_to_buy * execution_price
                total_cost = cost * (1 + commission)

                # Apply reserve cash constraint
                if constraints.get('reserveCash'):
                    min_cash = initial_cash * (constraints['reserveCash'] / 100)
                    if cash - total_cost < min_cash:
                        # Adjust to maintain reserve
                        available = cash - min_cash
                        if available <= 0:
                            return
                        shares_to_buy = int(available / (execution_price * (1 + commission)))
                        cost = shares_to_buy * execution_price
                        total_cost = cost * (1 + commission)

                if total_cost <= cash and shares_to_buy > 0:
                    cash -= total_cost
                    positions[symbol] = positions.get(symbol, 0) + shares_to_buy
                    trades.append({
                        'signal_date': str(signal_date),
                        'execution_date': str(execution_date),
                        'date': str(execution_date),
                        'symbol': symbol,
                        'type': 'buy',
                        'price': execution_price,
                        'signal_price': signal_price,
                        'size': shares_to_buy,
                        'value': cost,
                        'commission': cost * commission,
                        'execution_mode': execution_mode
                    })
            else:  # Sell
                current_shares = positions.get(symbol, 0)
                shares_to_sell = min(int(abs(amount) / execution_price), current_shares)
                value = shares_to_sell * execution_price
                proceeds = value * (1 - commission)

                if shares_to_sell > 0:
                    cash += proceeds
                    positions[symbol] = positions.get(symbol, 0) - shares_to_sell
                    trades.append({
                        'signal_date': str(signal_date),
                        'execution_date': str(execution_date),
                        'date': str(execution_date),
                        'symbol': symbol,
                        'type': 'sell',
                        'price': execution_price,
                        'signal_price': signal_price,
                        'size': shares_to_sell,
                        'value': value,
                        'commission': value * commission,
                        'execution_mode': execution_mode
                    })

        elif signal_type == 'a':  # Amount-based (share count)
            if amount > 0:  # Buy
                # Check max positions constraint
                if constraints.get('maxPositions'):
                    if symbol not in positions or positions.get(symbol, 0) == 0:
                        if current_position_count >= constraints['maxPositions']:
                            return

                shares_to_buy = int(abs(amount))
                cost = shares_to_buy * execution_price
                total_cost = cost * (1 + commission)

                # Apply reserve cash constraint
                if constraints.get('reserveCash'):
                    min_cash = initial_cash * (constraints['reserveCash'] / 100)
                    if cash - total_cost < min_cash:
                        # Adjust to maintain reserve
                        available = cash - min_cash
                        if available <= 0:
                            return
                        shares_to_buy = int(available / (execution_price * (1 + commission)))
                        cost = shares_to_buy * execution_price
                        total_cost = cost * (1 + commission)

                if total_cost <= cash and shares_to_buy > 0:
                    cash -= total_cost
                    positions[symbol] = positions.get(symbol, 0) + shares_to_buy
                    trades.append({
                        'signal_date': str(signal_date),
                        'execution_date': str(execution_date),
                        'date': str(execution_date),
                        'symbol': symbol,
                        'type': 'buy',
                        'price': execution_price,
                        'signal_price': signal_price,
                        'size': shares_to_buy,
                        'value': cost,
                        'commission': cost * commission,
                        'execution_mode': execution_mode
                    })
            else:  # Sell
                current_shares = positions.get(symbol, 0)
                shares_to_sell = min(int(abs(amount)), current_shares)
                value = shares_to_sell * execution_price
                proceeds = value * (1 - commission)

                if shares_to_sell > 0:
                    cash += proceeds
                    positions[symbol] = positions.get(symbol, 0) - shares_to_sell
                    trades.append({
                        'signal_date': str(signal_date),
                        'execution_date': str(execution_date),
                        'date': str(execution_date),
                        'symbol': symbol,
                        'type': 'sell',
                        'price': execution_price,
                        'signal_price': signal_price,
                        'size': shares_to_sell,
                        'value': value,
                        'commission': value * commission,
                        'execution_mode': execution_mode
                    })

    # Iterate through dates
    for current_date in all_dates:
        # Execute next-day signals from previous day (at open)
        if prev_date:
            for symbol in data_map.keys():
                key = (prev_date, symbol)
                if key in next_day_signals:
                    df = data_map[symbol]
                    # Find current_date in this symbol's data
                    if current_date in df.index.date:
                        row = df[df.index.date == current_date].iloc[0]
                        execution_price = float(row['open'])

                        # Get signal price (close from previous day)
                        if prev_date in df.index.date:
                            prev_row = df[df.index.date == prev_date].iloc[0]
                            signal_price = float(prev_row['close'])
                        else:
                            signal_price = execution_price

                        for signal in next_day_signals[key]:
                            execute_trade(signal, symbol, current_date, execution_price,
                                        prev_date, signal_price, 'next_open')

        # Execute same-day signals (at close)
        for symbol in data_map.keys():
            key = (current_date, symbol)
            if key in same_day_signals:
                df = data_map[symbol]
                if current_date in df.index.date:
                    row = df[df.index.date == current_date].iloc[0]
                    execution_price = float(row['close'])

                    for signal in same_day_signals[key]:
                        execute_trade(signal, symbol, current_date, execution_price,
                                    current_date, execution_price, 'close')

        # Calculate portfolio value for this date
        portfolio_value = cash
        position_values = {}

        for symbol, shares in positions.items():
            if shares > 0:
                df = data_map[symbol]
                if current_date in df.index.date:
                    row = df[df.index.date == current_date].iloc[0]
                    price = float(row['close'])
                    value = shares * price
                    portfolio_value += value
                    position_values[symbol] = {
                        'shares': shares,
                        'value': value,
                        'percentOfPortfolio': 0  # Calculate later
                    }

        # Calculate percentages
        if portfolio_value > 0:
            for symbol in position_values:
                position_values[symbol]['percentOfPortfolio'] = (
                    position_values[symbol]['value'] / portfolio_value * 100
                )

        # Track individual equity curves for each symbol
        for symbol in data_map.keys():
            df = data_map[symbol]
            if current_date in df.index.date:
                shares_held = positions.get(symbol, 0)
                if shares_held > 0:
                    row = df[df.index.date == current_date].iloc[0]
                    price = float(row['close'])
                    symbol_equity = shares_held * price
                else:
                    symbol_equity = 0

                per_symbol_equity_curves[symbol].append({
                    'date': str(current_date),
                    'value': symbol_equity,
                    'shares': shares_held
                })

        # Record equity curve
        equity_curve.append({
            'date': str(current_date),
            'value': portfolio_value,
            'cash': cash,
            'positions': dict(positions)
        })

        # Record position snapshot
        position_snapshots.append({
            'date': str(current_date),
            'positions': position_values,
            'cash': cash,
            'totalValue': portfolio_value
        })

        prev_date = current_date

    # Calculate per-symbol metrics
    per_symbol_metrics = []
    for symbol in data_map.keys():
        symbol_trades = [t for t in trades if t.get('symbol') == symbol]
        if len(symbol_trades) == 0:
            continue

        # Calculate symbol-specific metrics
        total_pnl = sum(
            t['value'] * (1 if t['type'] == 'sell' else -1)
            for t in symbol_trades
        )

        win_trades = [t for t in symbol_trades if t['type'] == 'sell' and
                     t['price'] > (t.get('signal_price', t['price']))]
        win_rate = len(win_trades) / len([t for t in symbol_trades if t['type'] == 'sell']) \
                   if len([t for t in symbol_trades if t['type'] == 'sell']) > 0 else 0

        per_symbol_metrics.append({
            'symbol': symbol,
            'totalReturn': total_pnl,
            'totalReturnPct': (total_pnl / initial_cash * 100) if initial_cash > 0 else 0,
            'sharpeRatio': 0,  # Simplified for now
            'maxDrawdownPct': 0,
            'tradeCount': len(symbol_trades),
            'contributionToPortfolio': total_pnl,
            'winRate': win_rate * 100
        })

    # Calculate portfolio metrics
    metrics = calculate_metrics_from_data(equity_curve, trades, initial_cash)

    return {
        'trades': trades,
        'equityCurve': equity_curve,
        'positionSnapshots': position_snapshots,
        'perSymbolMetrics': per_symbol_metrics,
        'perSymbolEquityCurves': per_symbol_equity_curves,
        'metrics': metrics,
        'symbols': list(data_map.keys())
    }


def calculate_slippage_metrics(trades: List[Dict]) -> Dict[str, Any]:
    """Calculate slippage metrics from trades."""
    if not trades:
        return {
            'avgSlippagePct': 0,
            'totalSlippageCost': 0,
            'sameDayTrades': 0,
            'nextOpenTrades': 0,
        }

    slippages = []
    total_cost = 0
    same_day_count = 0
    next_open_count = 0

    for trade in trades:
        # Count execution modes
        execution_mode = trade.get('execution_mode', 'close')
        if execution_mode == 'close':
            same_day_count += 1
        else:
            next_open_count += 1

        # Calculate slippage
        if 'signal_price' in trade and 'price' in trade:
            signal_price = float(trade['signal_price'])
            execution_price = float(trade['price'])
            trade_size = float(trade.get('size', 0))

            if signal_price > 0:
                slippage_pct = ((execution_price - signal_price) / signal_price) * 100
                slippages.append(slippage_pct)
                total_cost += abs(execution_price - signal_price) * trade_size

    avg_slippage = float(np.mean(slippages)) if slippages else 0

    return {
        'avgSlippagePct': avg_slippage,
        'totalSlippageCost': float(total_cost),
        'sameDayTrades': same_day_count,
        'nextOpenTrades': next_open_count,
    }


def calculate_metrics_from_data(equity_curve: List[Dict], trades: List[Dict], initial_cash: float) -> Dict[str, Any]:
    """Calculate performance metrics from equity curve and trades."""
    if not equity_curve or len(equity_curve) < 2:
        return {}

    # Extract values
    values = [point['value'] for point in equity_curve]

    # Basic metrics
    final_value = values[-1]
    total_return = final_value - initial_cash
    total_return_pct = (total_return / initial_cash * 100) if initial_cash > 0 else 0

    # Calculate daily returns
    returns = []
    for i in range(1, len(values)):
        if values[i-1] > 0:
            ret = (values[i] - values[i-1]) / values[i-1]
            returns.append(ret)

    # Drawdown calculation
    peak = initial_cash
    max_drawdown = 0
    max_drawdown_pct = 0
    for value in values:
        if value > peak:
            peak = value
        drawdown = peak - value
        drawdown_pct = (drawdown / peak) * 100 if peak > 0 else 0
        if drawdown_pct > max_drawdown_pct:
            max_drawdown = drawdown
            max_drawdown_pct = drawdown_pct

    # Trade analysis
    if trades:
        # Pair buy/sell trades
        buy_prices = []
        sell_prices = []
        for trade in trades:
            if trade['type'] == 'buy':
                buy_prices.append(trade['price'])
            elif trade['type'] == 'sell' and buy_prices:
                sell_prices.append((trade['price'], buy_prices.pop(0)))

        # Calculate win/loss
        wins = [sell - buy for sell, buy in sell_prices if sell > buy]
        losses = [sell - buy for sell, buy in sell_prices if sell <= buy]

        total_trades = len(sell_prices)
        won_trades = len(wins)
        lost_trades = len(losses)
        win_rate = (won_trades / total_trades * 100) if total_trades > 0 else 0

        avg_win = np.mean(wins) if wins else 0
        avg_loss = abs(np.mean(losses)) if losses else 0

        total_won_pnl = sum(wins) if wins else 0
        total_lost_pnl = abs(sum(losses)) if losses else 0
        profit_factor = (total_won_pnl / total_lost_pnl) if total_lost_pnl > 0 else (float('inf') if total_won_pnl > 0 else 0)
    else:
        total_trades = 0
        won_trades = 0
        lost_trades = 0
        win_rate = 0
        avg_win = 0
        avg_loss = 0
        profit_factor = 0

    # Risk-adjusted metrics
    if returns:
        returns_array = np.array(returns)
        mean_return = np.mean(returns_array)
        std_return = np.std(returns_array)

        # Sharpe Ratio (annualized, assuming 252 trading days)
        sharpe_ratio = (mean_return * np.sqrt(252)) / std_return if std_return > 0 else 0

        # Sortino Ratio (downside deviation)
        downside_returns = [r for r in returns if r < 0]
        downside_std = np.std(downside_returns) if downside_returns else 0
        sortino_ratio = (mean_return * np.sqrt(252)) / downside_std if downside_std > 0 else 0
    else:
        sharpe_ratio = 0
        sortino_ratio = 0

    # Calmar Ratio (annual return / max drawdown)
    annual_return = total_return_pct * (252 / len(equity_curve)) if len(equity_curve) > 0 else 0
    calmar_ratio = annual_return / max_drawdown_pct if max_drawdown_pct > 0 else 0

    # Calculate slippage metrics
    slippage_metrics = calculate_slippage_metrics(trades)

    # Combine all metrics
    metrics = {
        'totalReturn': total_return,
        'totalReturnPct': total_return_pct,
        'finalValue': final_value,
        'initialValue': initial_cash,
        'maxDrawdown': max_drawdown,
        'maxDrawdownPct': max_drawdown_pct,
        'sharpeRatio': sharpe_ratio,
        'sortinoRatio': sortino_ratio,
        'calmarRatio': calmar_ratio,
        'winRate': win_rate,
        'avgWin': avg_win,
        'avgLoss': avg_loss,
        'profitFactor': profit_factor,
        'tradeCount': total_trades,
        'wonTrades': won_trades,
        'lostTrades': lost_trades,
    }

    # Add slippage metrics
    metrics.update(slippage_metrics)

    return metrics


def main():
    try:
        # Read input from stdin
        input_data = json.load(sys.stdin)

        # Extract common components
        strategy_code = input_data['strategyCode']
        strategy_type = input_data.get('strategyType', 'single')
        initial_cash = input_data.get('initialCash', 100000.0)
        commission = input_data.get('commission', 0.001)
        parameters = input_data.get('parameters', {})
        constraints = input_data.get('constraints', {})

        # Check if this is a portfolio backtest
        is_portfolio = strategy_type == 'portfolio' or 'dataMap' in input_data

        if is_portfolio:
            # Portfolio backtest
            data_map_records = input_data.get('dataMap')
            if not data_map_records:
                raise ValueError("Portfolio strategy requires 'dataMap' in input")

            # Convert each symbol's data to DataFrame
            data_map = {}
            for symbol, records in data_map_records.items():
                df = pd.DataFrame(records)

                # Ensure date column is datetime and set as index
                if 'date' in df.columns:
                    df['date'] = pd.to_datetime(df['date'])
                    df.set_index('date', inplace=True)

                # Sort by date
                df = df.sort_index()

                # Ensure required columns exist
                required_cols = ['open', 'high', 'low', 'close']
                for col in required_cols:
                    if col not in df.columns:
                        raise ValueError(f"Symbol {symbol}: Missing required column: {col}")

                # Convert to numeric
                for col in required_cols:
                    df[col] = pd.to_numeric(df[col], errors='coerce')

                # Drop NaN values
                df = df.dropna(subset=required_cols)

                if len(df) == 0:
                    raise ValueError(f"Symbol {symbol}: No valid data rows after cleaning")

                data_map[symbol] = df

            # Execute user strategy code to get signals
            namespace = {
                'pd': pd,
                'np': np,
                'data_map': data_map,
                'parameters': parameters,
            }

            exec(strategy_code, namespace)

            if 'calculate' not in namespace:
                raise ValueError("Strategy code must define a 'calculate(data_map, parameters)' function")

            # Execute the calculate function
            # DEBUG: Print data_map info
            print(f"DEBUG: data_map has {len(data_map)} symbols", file=sys.stderr)
            for sym, df in data_map.items():
                print(f"DEBUG: {sym}: {len(df)} rows, columns: {list(df.columns)}", file=sys.stderr)
                if len(df) > 0:
                    print(f"DEBUG: {sym} first date: {df.index[0]}, last date: {df.index[-1]}", file=sys.stderr)

            signals = namespace['calculate'](data_map, parameters)

            print(f"DEBUG: Strategy returned {len(signals)} signals", file=sys.stderr)
            if len(signals) > 0:
                print(f"DEBUG: First signal: {signals[0]}", file=sys.stderr)

            if not isinstance(signals, list):
                raise ValueError("Strategy must return a list of signals")

            # Validate signals
            for signal in signals:
                if not isinstance(signal, dict):
                    raise ValueError("Each signal must be a dictionary")
                if 'symbol' not in signal:
                    raise ValueError("Portfolio signals must have a 'symbol' field")
                if 'date' not in signal:
                    raise ValueError("Each signal must have a 'date' field")
                if 'type' not in signal or signal['type'] not in ['v', 'a']:
                    raise ValueError("Each signal must have 'type' field with value 'v' or 'a'")
                if 'amount' not in signal:
                    raise ValueError("Each signal must have an 'amount' field")
                # Validate execution field if present
                if 'execution' in signal:
                    if signal['execution'] not in ['close', 'next_open']:
                        raise ValueError(f"Invalid execution mode: {signal['execution']}. Must be 'close' or 'next_open'")

            # Run portfolio backtest
            result = portfolio_backtest(data_map, signals, initial_cash, commission, constraints)

            # Format trade markers for frontend
            trade_markers = []
            for trade in result['trades']:
                trade_markers.append({
                    'signal_date': trade.get('signal_date'),
                    'execution_date': trade.get('execution_date'),
                    'date': trade['date'],
                    'symbol': trade.get('symbol'),
                    'type': trade['type'],
                    'price': trade['price'],
                    'signal_price': trade.get('signal_price'),
                    'size': trade['size'],
                    'value': trade['value'],
                    'commission': trade['commission'],
                    'execution_mode': trade.get('execution_mode', 'close')
                })

            # Output portfolio results
            output = {
                'success': True,
                'type': 'portfolio',
                'metrics': result['metrics'],
                'equityCurve': result['equityCurve'],
                'tradeMarkers': trade_markers,
                'positionSnapshots': result['positionSnapshots'],
                'perSymbolMetrics': result['perSymbolMetrics'],
                'perSymbolEquityCurves': result['perSymbolEquityCurves'],
                'symbols': result['symbols'],
                'constraints': constraints
            }
            print(json.dumps(output, default=str))

        else:
            # Single-stock backtest (existing logic)
            data_records = input_data.get('data')
            if not data_records:
                raise ValueError("Single-stock strategy requires 'data' in input")

            # Convert to pandas DataFrame
            df = pd.DataFrame(data_records)

            # Ensure date column is datetime and set as index
            if 'date' in df.columns:
                df['date'] = pd.to_datetime(df['date'])
                df.set_index('date', inplace=True)
            elif df.index.name != 'date' and not isinstance(df.index, pd.DatetimeIndex):
                if not isinstance(df.index, pd.DatetimeIndex):
                    try:
                        df.index = pd.to_datetime(df.index)
                    except Exception:
                        raise ValueError("DataFrame index must be convertible to datetime")

            # Ensure index is DatetimeIndex
            if not isinstance(df.index, pd.DatetimeIndex):
                raise ValueError("DataFrame must have a DatetimeIndex")

            # Sort by date
            df = df.sort_index()

            # Ensure required columns exist
            required_cols = ['open', 'high', 'low', 'close']
            for col in required_cols:
                if col not in df.columns:
                    raise ValueError(f"Missing required column: {col}")

            # Convert to numeric
            for col in required_cols:
                df[col] = pd.to_numeric(df[col], errors='coerce')

            # Drop NaN values
            df = df.dropna(subset=required_cols)

            if len(df) == 0:
                raise ValueError("No valid data rows after cleaning")

            # Execute user strategy code to get signals
            namespace = {
                'pd': pd,
                'np': np,
                'data': df,
                'parameters': parameters,
            }

            exec(strategy_code, namespace)

            if 'calculate' not in namespace:
                raise ValueError("Strategy code must define a 'calculate(data, parameters)' function")

            # Execute the calculate function
            signals = namespace['calculate'](df, parameters)

            if not isinstance(signals, list):
                raise ValueError("Strategy must return a list of signals")

            # Validate signals
            for signal in signals:
                if not isinstance(signal, dict):
                    raise ValueError("Each signal must be a dictionary")
                if 'date' not in signal:
                    raise ValueError("Each signal must have a 'date' field")
                if 'type' not in signal or signal['type'] not in ['v', 'a']:
                    raise ValueError("Each signal must have 'type' field with value 'v' or 'a'")
                if 'amount' not in signal:
                    raise ValueError("Each signal must have an 'amount' field")
                # Validate execution field if present
                if 'execution' in signal:
                    if signal['execution'] not in ['close', 'next_open']:
                        raise ValueError(f"Invalid execution mode: {signal['execution']}. Must be 'close' or 'next_open'")

            # Run backtest
            result = manual_backtest(df, signals, initial_cash, commission)

            # Format trade markers for frontend
            trade_markers = []
            for trade in result['trades']:
                trade_markers.append({
                    'signal_date': trade.get('signal_date'),
                    'execution_date': trade.get('execution_date'),
                    'date': trade['date'],  # Keep for backward compatibility
                    'type': trade['type'],
                    'price': trade['price'],
                    'signal_price': trade.get('signal_price'),
                    'size': trade['size'],
                    'value': trade['value'],
                    'commission': trade['commission'],
                    'execution_mode': trade.get('execution_mode', 'close')
                })

            # Output results
            output = {
                'success': True,
                'metrics': result['metrics'],
                'equityCurve': result['equityCurve'],
                'tradeMarkers': trade_markers,
            }
            print(json.dumps(output, default=str))

    except Exception as e:
        # Output error
        error_trace = traceback.format_exc()
        output = {
            'success': False,
            'error': str(e),
            'type': type(e).__name__,
            'traceback': error_trace
        }
        print(json.dumps(output))
        sys.exit(1)


if __name__ == '__main__':
    main()
