import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export interface Indicator {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  outputColumn: string;
  createdAt: string;
  updatedAt?: string;
  dependencies: string[];
}

interface IndicatorsFile {
  indicators: Indicator[];
}

function getIndicatorsDirectory(): string {
  return join(process.cwd(), 'data', 'indicators');
}

function getIndicatorsFilePath(): string {
  return join(getIndicatorsDirectory(), 'indicators.json');
}

export async function loadIndicators(): Promise<Indicator[]> {
  try {
    const filePath = getIndicatorsFilePath();
    const content = await readFile(filePath, 'utf-8');
    const data: IndicatorsFile = JSON.parse(content);
    return data.indicators || [];
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

export async function saveIndicators(indicators: Indicator[]): Promise<void> {
  const indicatorsDir = getIndicatorsDirectory();
  await mkdir(indicatorsDir, { recursive: true });

  const filePath = getIndicatorsFilePath();
  const data: IndicatorsFile = { indicators };
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getIndicatorById(id: string): Promise<Indicator | null> {
  const indicators = await loadIndicators();
  return indicators.find(ind => ind.id === id) || null;
}

export async function saveIndicator(
  indicatorData: Omit<Indicator, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Indicator> {
  const indicators = await loadIndicators();

  // Check for duplicate names
  const existingByName = indicators.find(
    ind => ind.name.toLowerCase() === indicatorData.name.toLowerCase()
  );
  if (existingByName) {
    throw new Error(`Indicator with name "${indicatorData.name}" already exists`);
  }

  const newIndicator: Indicator = {
    ...indicatorData,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    dependencies: indicatorData.dependencies || [],
  };

  indicators.push(newIndicator);
  await saveIndicators(indicators);

  return newIndicator;
}

export async function updateIndicator(
  id: string,
  updates: Partial<Omit<Indicator, 'id' | 'createdAt'>>
): Promise<Indicator> {
  const indicators = await loadIndicators();
  const index = indicators.findIndex(ind => ind.id === id);

  if (index === -1) {
    throw new Error(`Indicator with ID "${id}" not found`);
  }

  // Check for duplicate names (if name is being updated)
  if (updates.name) {
    const existingByName = indicators.find(
      ind => ind.id !== id && ind.name.toLowerCase() === updates.name!.toLowerCase()
    );
    if (existingByName) {
      throw new Error(`Indicator with name "${updates.name}" already exists`);
    }
  }

  const updatedIndicator: Indicator = {
    ...indicators[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  indicators[index] = updatedIndicator;
  await saveIndicators(indicators);

  return updatedIndicator;
}

export async function deleteIndicator(id: string): Promise<void> {
  const indicators = await loadIndicators();
  const filteredIndicators = indicators.filter(ind => ind.id !== id);

  if (filteredIndicators.length === indicators.length) {
    throw new Error(`Indicator with ID "${id}" not found`);
  }

  await saveIndicators(filteredIndicators);
}
