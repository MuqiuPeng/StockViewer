const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to database');

  // Get first user
  const userResult = await client.query('SELECT id, email FROM "User" LIMIT 1');
  if (userResult.rows.length === 0) {
    console.log('No user found');
    await client.end();
    return;
  }

  const userId = userResult.rows[0].id;
  console.log('Found user:', userResult.rows[0].email);

  // Helper to check if indicator exists
  async function indicatorExists(name) {
    const result = await client.query(
      'SELECT id FROM "Indicator" WHERE name = $1 AND "userId" = $2',
      [name, userId]
    );
    return result.rows.length > 0;
  }

  // Helper to check if strategy exists
  async function strategyExists(name) {
    const result = await client.query(
      'SELECT id FROM "Strategy" WHERE name = $1 AND "userId" = $2',
      [name, userId]
    );
    return result.rows.length > 0;
  }

  // Create indicators
  const indicators = [
    {
      name: 'SMA20',
      description: '20-day Simple Moving Average',
      outputColumn: 'sma20',
      pythonCode: `def calculate(data):
    return data["close"].rolling(window=20).mean()`,
      dependencies: [],
    },
    {
      name: 'SMA60',
      description: '60-day Simple Moving Average',
      outputColumn: 'sma60',
      pythonCode: `def calculate(data):
    return data["close"].rolling(window=60).mean()`,
      dependencies: [],
    },
    {
      name: 'EMA12',
      description: '12-day Exponential Moving Average',
      outputColumn: 'ema12',
      pythonCode: `def calculate(data):
    return data["close"].ewm(span=12, adjust=False).mean()`,
      dependencies: [],
    },
    {
      name: 'EMA26',
      description: '26-day Exponential Moving Average',
      outputColumn: 'ema26',
      pythonCode: `def calculate(data):
    return data["close"].ewm(span=26, adjust=False).mean()`,
      dependencies: [],
    },
    {
      name: 'RSI14',
      description: '14-day Relative Strength Index',
      outputColumn: 'rsi14',
      pythonCode: `def calculate(data):
    delta = data["close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))`,
      dependencies: [],
    },
    {
      name: 'MACD',
      description: 'Moving Average Convergence Divergence (EMA12 - EMA26)',
      outputColumn: 'macd',
      pythonCode: `def calculate(data):
    return data["ema12"] - data["ema26"]`,
      dependencies: ['EMA12', 'EMA26'],
    },
  ];

  for (const ind of indicators) {
    if (await indicatorExists(ind.name)) {
      console.log('Indicator exists:', ind.name);
    } else {
      await client.query(
        `INSERT INTO "Indicator" (id, name, description, "pythonCode", "outputColumn", dependencies, "userId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [ind.name, ind.description, ind.pythonCode, ind.outputColumn, ind.dependencies, userId]
      );
      console.log('Created indicator:', ind.name);
    }
  }

  // Create strategies
  const strategies = [
    {
      name: 'Golden Cross',
      description: 'Buy when SMA20 crosses above SMA60',
      strategyType: 'single',
      pythonCode: `def strategy(data):
    signal = (data["sma20"] > data["sma60"]) & (data["sma20"].shift(1) <= data["sma60"].shift(1))
    return signal.astype(int)`,
      dependencies: ['SMA20', 'SMA60'],
    },
    {
      name: 'RSI Oversold',
      description: 'Buy when RSI drops below 30',
      strategyType: 'single',
      pythonCode: `def strategy(data):
    signal = (data["rsi14"] < 30) & (data["rsi14"].shift(1) >= 30)
    return signal.astype(int)`,
      dependencies: ['RSI14'],
    },
    {
      name: 'MACD Crossover',
      description: 'Buy when MACD crosses above zero',
      strategyType: 'single',
      pythonCode: `def strategy(data):
    signal = (data["macd"] > 0) & (data["macd"].shift(1) <= 0)
    return signal.astype(int)`,
      dependencies: ['MACD'],
    },
  ];

  for (const strat of strategies) {
    if (await strategyExists(strat.name)) {
      console.log('Strategy exists:', strat.name);
    } else {
      await client.query(
        `INSERT INTO "Strategy" (id, name, description, "pythonCode", "strategyType", dependencies, "userId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [strat.name, strat.description, strat.pythonCode, strat.strategyType, strat.dependencies, userId]
      );
      console.log('Created strategy:', strat.name);
    }
  }

  console.log('Done!');
  await client.end();
}

main().catch(console.error);
