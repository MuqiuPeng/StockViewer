import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface StockGroup {
  id: string;
  name: string;
  description?: string;
  datasetNames: string[]; // Array of dataset filenames
  createdAt: string;
  updatedAt?: string;
}

const GROUPS_DIR = join(process.cwd(), 'data', 'groups');
const GROUPS_FILE = join(GROUPS_DIR, 'groups.json');

/**
 * Ensure the groups directory exists
 */
async function ensureGroupsDir(): Promise<void> {
  try {
    await mkdir(GROUPS_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore
  }
}

/**
 * Load all groups from storage
 */
export async function loadGroups(): Promise<StockGroup[]> {
  try {
    await ensureGroupsDir();
    const content = await readFile(GROUPS_FILE, 'utf-8');
    const data = JSON.parse(content);
    return data.groups || [];
  } catch (error) {
    // File doesn't exist yet, return empty array
    return [];
  }
}

/**
 * Save groups to storage
 */
async function saveGroups(groups: StockGroup[]): Promise<void> {
  await ensureGroupsDir();
  await writeFile(GROUPS_FILE, JSON.stringify({ groups }, null, 2), 'utf-8');
}

/**
 * Get a group by ID
 */
export async function getGroupById(id: string): Promise<StockGroup | null> {
  const groups = await loadGroups();
  return groups.find(g => g.id === id) || null;
}

/**
 * Create a new group
 */
export async function createGroup(group: Omit<StockGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<StockGroup> {
  const groups = await loadGroups();
  const newGroup: StockGroup = {
    ...group,
    id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    createdAt: new Date().toISOString(),
  };
  groups.push(newGroup);
  await saveGroups(groups);
  return newGroup;
}

/**
 * Update an existing group
 */
export async function updateGroup(id: string, updates: Partial<Omit<StockGroup, 'id' | 'createdAt'>>): Promise<StockGroup | null> {
  const groups = await loadGroups();
  const index = groups.findIndex(g => g.id === id);
  if (index === -1) return null;

  groups[index] = {
    ...groups[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await saveGroups(groups);
  return groups[index];
}

/**
 * Delete a group
 */
export async function deleteGroup(id: string): Promise<boolean> {
  const groups = await loadGroups();
  const filtered = groups.filter(g => g.id !== id);
  if (filtered.length === groups.length) return false; // Group not found
  await saveGroups(filtered);
  return true;
}

/**
 * Get groups that contain a specific dataset
 */
export async function getGroupsByDataset(datasetName: string): Promise<StockGroup[]> {
  const groups = await loadGroups();
  return groups.filter(g => g.datasetNames.includes(datasetName));
}

/**
 * Add a dataset to a group
 */
export async function addDatasetToGroup(groupId: string, datasetName: string): Promise<StockGroup | null> {
  const groups = await loadGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) return null;

  if (!group.datasetNames.includes(datasetName)) {
    group.datasetNames.push(datasetName);
    group.updatedAt = new Date().toISOString();
    await saveGroups(groups);
  }
  return group;
}

/**
 * Remove a dataset from a group
 */
export async function removeDatasetFromGroup(groupId: string, datasetName: string): Promise<StockGroup | null> {
  const groups = await loadGroups();
  const group = groups.find(g => g.id === groupId);
  if (!group) return null;

  group.datasetNames = group.datasetNames.filter(name => name !== datasetName);
  group.updatedAt = new Date().toISOString();
  await saveGroups(groups);
  return group;
}

