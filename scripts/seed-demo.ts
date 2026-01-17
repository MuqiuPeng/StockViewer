import { PrismaClient } from '@prisma/client';

// Use direct connection URL for seeding
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  // Get first user
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('No user found');
    return;
  }

  console.log('Found user:', user.email);

  // Create indicators
  const indicators = [
    {
      name: 'SMA20',
      description: '20-day Simple Moving Average',
      outputColumn: 'sma20',
      pythonCode: `def calculate(data):
    return data["close"].rolling(window=20).mean()`,
    },
    {
      name: 'SMA60',
      description: '60-day Simple Moving Average',
      outputColumn: 'sma60',
      pythonCode: `def calculate(data):
    return data["close"].rolling(window=60).mean()`,
    },
    {
      name: 'EMA12',
      description: '12-day Exponential Moving Average',
      outputColumn: 'ema12',
      pythonCode: `def calculate(data):
    return data["close"].ewm(span=12, adjust=False).mean()`,
    },
    {
      name: 'EMA26',
      description: '26-day Exponential Moving Average',
      outputColumn: 'ema26',
      pythonCode: `def calculate(data):
    return data["close"].ewm(span=26, adjust=False).mean()`,
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
    },
  ];

  for (const ind of indicators) {
    const existing = await prisma.indicator.findFirst({
      where: { name: ind.name, ownerId: user.id }
    });
    if (!existing) {
      await prisma.indicator.create({
        data: { ...ind, ownerId: user.id }
      });
      console.log('Created indicator:', ind.name);
    } else {
      console.log('Indicator exists:', ind.name);
    }
  }

  // Create MACD indicator (depends on EMA12 and EMA26)
  const macdExists = await prisma.indicator.findFirst({ where: { name: 'MACD', ownerId: user.id } });
  if (!macdExists) {
    await prisma.indicator.create({
      data: {
        name: 'MACD',
        description: 'Moving Average Convergence Divergence',
        outputColumn: 'macd',
        pythonCode: `def calculate(data):
    return data["ema12"] - data["ema26"]`,
        dependencies: ['EMA12', 'EMA26'],
        ownerId: user.id,
      }
    });
    console.log('Created indicator: MACD');
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
    const existing = await prisma.strategy.findFirst({
      where: { name: strat.name, userId: user.id }
    });
    if (!existing) {
      await prisma.strategy.create({
        data: { ...strat, userId: user.id }
      });
      console.log('Created strategy:', strat.name);
    } else {
      console.log('Strategy exists:', strat.name);
    }
  }

  console.log('Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
