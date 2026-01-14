import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'view-settings');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export interface ConstantLine {
  value: number;
  color: string;
  label: string;
}

export interface ViewSetting {
  id: string;
  name: string;
  enabledIndicators1: string[];
  enabledIndicators2: string[];
  constantLines1: ConstantLine[];
  constantLines2: ConstantLine[];
  createdAt: string;
  updatedAt?: string;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSettings(): ViewSetting[] {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveSettings(settings: ViewSetting[]) {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export function getAllViewSettings(): ViewSetting[] {
  return loadSettings();
}

export function getViewSetting(id: string): ViewSetting | null {
  const settings = loadSettings();
  return settings.find(s => s.id === id) || null;
}

export function createViewSetting(setting: Omit<ViewSetting, 'id' | 'createdAt'>): ViewSetting {
  const settings = loadSettings();
  const newSetting: ViewSetting = {
    ...setting,
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
  };
  settings.push(newSetting);
  saveSettings(settings);
  return newSetting;
}

export function updateViewSetting(id: string, updates: Partial<Omit<ViewSetting, 'id' | 'createdAt'>>): ViewSetting | null {
  const settings = loadSettings();
  const index = settings.findIndex(s => s.id === id);
  if (index === -1) return null;

  settings[index] = {
    ...settings[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveSettings(settings);
  return settings[index];
}

export function deleteViewSetting(id: string): boolean {
  const settings = loadSettings();
  const index = settings.findIndex(s => s.id === id);
  if (index === -1) return false;

  settings.splice(index, 1);
  saveSettings(settings);
  return true;
}
