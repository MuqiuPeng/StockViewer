/**
 * Centralized environment configuration
 *
 * This module provides type-safe access to environment variables with defaults.
 * All environment variables should be accessed through this module to ensure consistency.
 */

/**
 * Get environment variable with fallback to default value
 */
function getEnv(key: string, defaultValue: string): string {
  if (typeof process !== 'undefined' && process.env[key]) {
    return process.env[key] as string;
  }
  return defaultValue;
}

/**
 * Get numeric environment variable with fallback to default value
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = getEnv(key, String(defaultValue));
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get boolean environment variable with fallback to default value
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = getEnv(key, String(defaultValue));
  return value === 'true' || value === '1';
}

/**
 * API Configuration
 */
export const API_CONFIG = {
  /**
   * AKTools API URL for fetching stock data
   * Default: http://127.0.0.1:8080
   */
  AKTOOLS_URL: getEnv('NEXT_PUBLIC_AKTOOLS_API_URL', 'http://127.0.0.1:8080'),
} as const;

/**
 * Python Execution Configuration
 */
export const PYTHON_CONFIG = {
  /**
   * Python executable path
   * Default: python3
   */
  EXECUTABLE: getEnv('PYTHON_EXECUTABLE', 'python3'),

  /**
   * Python script timeout in milliseconds
   * Default: 300000 (5 minutes)
   */
  TIMEOUT_MS: getEnvNumber('PYTHON_TIMEOUT_MS', 300000),
} as const;

/**
 * Data Storage Configuration
 */
export const DATA_CONFIG = {
  /**
   * CSV data directory
   * Default: {project_root}/data/csv
   */
  CSV_DIR: getEnv('CSV_DIR', ''),

  /**
   * Maximum CSV file size in MB
   * Default: 50
   */
  MAX_CSV_SIZE_MB: getEnvNumber('MAX_CSV_SIZE_MB', 50),

  /**
   * Indicators storage file
   * Default: {project_root}/data/indicators/indicators.json
   */
  INDICATORS_FILE: getEnv('INDICATORS_FILE', ''),
} as const;

/**
 * Performance & Caching Configuration
 */
export const CACHE_CONFIG = {
  /**
   * Enable dataset caching
   * Default: false
   */
  ENABLE_DATASET_CACHE: getEnvBoolean('ENABLE_DATASET_CACHE', false),

  /**
   * Dataset cache TTL in seconds
   * Default: 300 (5 minutes)
   */
  DATASET_CACHE_TTL: getEnvNumber('DATASET_CACHE_TTL', 300),
} as const;

/**
 * Security & Rate Limiting Configuration
 */
export const SECURITY_CONFIG = {
  /**
   * Enable request rate limiting
   * Default: false
   */
  ENABLE_RATE_LIMITING: getEnvBoolean('ENABLE_RATE_LIMITING', false),

  /**
   * Maximum API requests per minute per IP
   * Default: 60
   */
  RATE_LIMIT_PER_MINUTE: getEnvNumber('RATE_LIMIT_PER_MINUTE', 60),
} as const;

/**
 * Development & Debugging Configuration
 */
export const DEBUG_CONFIG = {
  /**
   * Enable debug logging
   * Default: false
   */
  DEBUG: getEnvBoolean('DEBUG', false),

  /**
   * Log level: error, warn, info, debug
   * Default: info
   */
  LOG_LEVEL: getEnv('LOG_LEVEL', 'info') as 'error' | 'warn' | 'info' | 'debug',

  /**
   * Log directory
   * Default: {project_root}/logs
   */
  LOG_DIR: getEnv('LOG_DIR', ''),
} as const;

/**
 * All configuration grouped
 */
export const ENV = {
  API: API_CONFIG,
  PYTHON: PYTHON_CONFIG,
  DATA: DATA_CONFIG,
  CACHE: CACHE_CONFIG,
  SECURITY: SECURITY_CONFIG,
  DEBUG: DEBUG_CONFIG,
} as const;

/**
 * Helper to check if running in development mode
 */
export const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Helper to check if running in production mode
 */
export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Helper to check if running in test mode
 */
export const isTest = process.env.NODE_ENV === 'test';
