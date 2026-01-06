import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  parameters?: Record<string, any>; // Configurable parameters
  createdAt: string;
  updatedAt?: string;
}

interface StrategiesFile {
  strategies: Strategy[];
}

function getStrategiesDirectory(): string {
  return join(process.cwd(), 'data', 'strategies');
}

function getStrategiesFilePath(): string {
  return join(getStrategiesDirectory(), 'strategies.json');
}

export async function loadStrategies(): Promise<Strategy[]> {
  try {
    const filePath = getStrategiesFilePath();
    const content = await readFile(filePath, 'utf-8');
    const data: StrategiesFile = JSON.parse(content);
    return data.strategies || [];
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

export async function saveStrategies(strategies: Strategy[]): Promise<void> {
  const strategiesDir = getStrategiesDirectory();
  await mkdir(strategiesDir, { recursive: true });

  const filePath = getStrategiesFilePath();
  const data: StrategiesFile = { strategies };
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getStrategyById(id: string): Promise<Strategy | null> {
  const strategies = await loadStrategies();
  return strategies.find(strategy => strategy.id === id) || null;
}

export async function saveStrategy(
  strategyData: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Strategy> {
  const strategies = await loadStrategies();

  // Check for duplicate names
  const existingByName = strategies.find(
    strategy => strategy.name.toLowerCase() === strategyData.name.toLowerCase()
  );
  if (existingByName) {
    throw new Error(`Strategy with name "${strategyData.name}" already exists`);
  }

  const newStrategy: Strategy = {
    ...strategyData,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    parameters: strategyData.parameters || {},
  };

  strategies.push(newStrategy);
  await saveStrategies(strategies);

  return newStrategy;
}

export async function updateStrategy(
  id: string,
  updates: Partial<Omit<Strategy, 'id' | 'createdAt'>>
): Promise<Strategy> {
  const strategies = await loadStrategies();
  const index = strategies.findIndex(strategy => strategy.id === id);

  if (index === -1) {
    throw new Error(`Strategy with ID "${id}" not found`);
  }

  // Check for duplicate names (if name is being updated)
  if (updates.name) {
    const existingByName = strategies.find(
      strategy => strategy.id !== id && strategy.name.toLowerCase() === updates.name!.toLowerCase()
    );
    if (existingByName) {
      throw new Error(`Strategy with name "${updates.name}" already exists`);
    }
  }

  const updatedStrategy: Strategy = {
    ...strategies[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  strategies[index] = updatedStrategy;
  await saveStrategies(strategies);

  return updatedStrategy;
}

export async function deleteStrategy(id: string): Promise<void> {
  const strategies = await loadStrategies();
  const filteredStrategies = strategies.filter(strategy => strategy.id !== id);

  if (filteredStrategies.length === strategies.length) {
    throw new Error(`Strategy with ID "${id}" not found`);
  }

  await saveStrategies(filteredStrategies);
}

