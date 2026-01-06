import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BacktestResult } from './backtest-executor';
import { PortfolioConstraints } from './types/portfolio';

export interface BacktestHistoryEntry {
  // Identity
  id: string;
  createdAt: string;

  // Backtest configuration
  strategyId: string;
  strategyName: string;
  strategyType: 'single' | 'portfolio';

  // Target information
  target: {
    type: 'single' | 'portfolio' | 'group';
    datasetName?: string;
    symbols?: string[];
    groupId?: string;
    groupName?: string;
  };

  // Backtest parameters
  parameters: {
    initialCash: number;
    commission: number;
    startDate?: string;
    endDate?: string;
    strategyParameters?: Record<string, any>;
    constraints?: PortfolioConstraints;
  };

  // Results (full backtest result)
  result: BacktestResult;

  // Metadata
  starred: boolean;
  notes?: string;
  tags?: string[];

  // Summary metrics (denormalized for quick filtering/sorting)
  summary: {
    totalReturn: number;
    totalReturnPct: number;
    sharpeRatio: number;
    tradeCount: number;
    duration: number;
  };
}

interface BacktestHistoryFile {
  entries: BacktestHistoryEntry[];
}

function getHistoryDirectory(): string {
  return join(process.cwd(), 'data', 'backtest-history');
}

function getHistoryFilePath(): string {
  return join(getHistoryDirectory(), 'history.json');
}

export async function getAllBacktestHistory(): Promise<BacktestHistoryEntry[]> {
  try {
    const filePath = getHistoryFilePath();
    const content = await readFile(filePath, 'utf-8');
    const data: BacktestHistoryFile = JSON.parse(content);
    const entries = data.entries || [];

    // Sort by createdAt descending (newest first)
    return entries.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

async function saveBacktestHistory(entries: BacktestHistoryEntry[]): Promise<void> {
  const historyDir = getHistoryDirectory();
  await mkdir(historyDir, { recursive: true });

  const filePath = getHistoryFilePath();
  const data: BacktestHistoryFile = { entries };
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getBacktestHistoryById(id: string): Promise<BacktestHistoryEntry | null> {
  const entries = await getAllBacktestHistory();
  return entries.find(entry => entry.id === id) || null;
}

export async function createBacktestHistoryEntry(
  entryData: Omit<BacktestHistoryEntry, 'id' | 'createdAt'>
): Promise<BacktestHistoryEntry> {
  const entries = await getAllBacktestHistory();

  const newEntry: BacktestHistoryEntry = {
    ...entryData,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  entries.push(newEntry);
  await saveBacktestHistory(entries);

  return newEntry;
}

export async function updateBacktestHistoryEntry(
  id: string,
  updates: Partial<Omit<BacktestHistoryEntry, 'id' | 'createdAt'>>
): Promise<BacktestHistoryEntry> {
  const entries = await getAllBacktestHistory();
  const index = entries.findIndex(entry => entry.id === id);

  if (index === -1) {
    throw new Error(`Backtest history entry with ID "${id}" not found`);
  }

  const updatedEntry: BacktestHistoryEntry = {
    ...entries[index],
    ...updates,
  };

  entries[index] = updatedEntry;
  await saveBacktestHistory(entries);

  return updatedEntry;
}

export async function deleteBacktestHistoryEntry(id: string): Promise<void> {
  const entries = await getAllBacktestHistory();
  const filteredEntries = entries.filter(entry => entry.id !== id);

  if (filteredEntries.length === entries.length) {
    throw new Error(`Backtest history entry with ID "${id}" not found`);
  }

  await saveBacktestHistory(filteredEntries);
}

// Specialized operations

export async function starBacktestHistoryEntry(id: string, starred: boolean): Promise<void> {
  await updateBacktestHistoryEntry(id, { starred });
}

export async function addNoteToBacktestHistoryEntry(id: string, notes: string): Promise<void> {
  await updateBacktestHistoryEntry(id, { notes });
}

export async function addTagsToBacktestHistoryEntry(id: string, tags: string[]): Promise<void> {
  await updateBacktestHistoryEntry(id, { tags });
}
