/**
 * CSV Parser for stock data import
 * Validates and parses CSV files containing OHLCV data
 */

// Required columns for stock data
const REQUIRED_COLUMNS = ['date', 'open', 'high', 'low', 'close', 'volume'] as const;

// Optional columns that can be included
const OPTIONAL_COLUMNS = [
  'turnover',
  'amplitude',
  'changePct',
  'changeAmount',
  'turnoverRate',
] as const;

// Column name aliases (case-insensitive matching)
const COLUMN_ALIASES: Record<string, string[]> = {
  date: ['date', 'time', 'datetime', 'trade_date', '日期'],
  open: ['open', 'open_price', 'opening', '开盘'],
  high: ['high', 'high_price', 'highest', '最高'],
  low: ['low', 'low_price', 'lowest', '最低'],
  close: ['close', 'close_price', 'closing', '收盘'],
  volume: ['volume', 'vol', 'trade_volume', '成交量'],
  turnover: ['turnover', 'amount', 'trade_amount', '成交额'],
  amplitude: ['amplitude', '振幅'],
  changePct: ['changepct', 'change_pct', 'pct_change', '涨跌幅'],
  changeAmount: ['changeamount', 'change_amount', 'change', '涨跌额'],
  turnoverRate: ['turnoverrate', 'turnover_rate', '换手率'],
};

export interface ParsedRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
  amplitude?: number;
  changePct?: number;
  changeAmount?: number;
  turnoverRate?: number;
}

export interface CsvParseResult {
  success: boolean;
  data: ParsedRow[];
  rowCount: number;
  columnMapping: Record<string, string>;
  dateRange: {
    first: string;
    last: string;
  };
  errors: string[];
  warnings: string[];
}

export interface CsvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  detectedColumns: string[];
  missingRequired: string[];
  columnMapping: Record<string, string>;
}

/**
 * Normalize column name by finding matching alias
 */
function normalizeColumnName(name: string): string | null {
  const lowerName = name.toLowerCase().trim();

  for (const [standardName, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((alias) => alias.toLowerCase() === lowerName)) {
      return standardName;
    }
  }

  return null;
}

/**
 * Parse CSV content into rows
 */
function parseCSVContent(content: string): string[][] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const rows: string[][] = [];

  for (const line of lines) {
    // Handle quoted values with commas
    const row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Validate CSV headers and return column mapping
 */
export function validateCsvHeaders(headers: string[]): CsvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const columnMapping: Record<string, string> = {};
  const detectedColumns: string[] = [];

  // Map each header to standard column name
  for (const header of headers) {
    const normalized = normalizeColumnName(header);
    if (normalized) {
      if (columnMapping[normalized]) {
        warnings.push(`Duplicate column detected: ${header} (already mapped to ${normalized})`);
      } else {
        columnMapping[normalized] = header;
        detectedColumns.push(normalized);
      }
    }
  }

  // Check for required columns
  const missingRequired: string[] = [];
  for (const required of REQUIRED_COLUMNS) {
    if (!columnMapping[required]) {
      missingRequired.push(required);
    }
  }

  if (missingRequired.length > 0) {
    errors.push(`Missing required columns: ${missingRequired.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    detectedColumns,
    missingRequired,
    columnMapping,
  };
}

/**
 * Parse a single row of data
 */
function parseRow(
  row: string[],
  headers: string[],
  columnMapping: Record<string, string>,
  rowIndex: number
): { data: ParsedRow | null; error: string | null } {
  const getValue = (column: string): string | undefined => {
    const originalHeader = columnMapping[column];
    if (!originalHeader) return undefined;
    const index = headers.indexOf(originalHeader);
    return index >= 0 ? row[index] : undefined;
  };

  const parseNumber = (value: string | undefined): number | null => {
    if (value === undefined || value === '' || value === '-') return null;
    const num = parseFloat(value.replace(/,/g, ''));
    return isNaN(num) ? null : num;
  };

  // Parse required fields
  const date = getValue('date');
  const open = parseNumber(getValue('open'));
  const high = parseNumber(getValue('high'));
  const low = parseNumber(getValue('low'));
  const close = parseNumber(getValue('close'));
  const volume = parseNumber(getValue('volume'));

  // Validate required fields
  if (!date) {
    return { data: null, error: `Row ${rowIndex}: Missing date` };
  }

  // Validate date format
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return { data: null, error: `Row ${rowIndex}: Invalid date format "${date}"` };
  }

  if (open === null || high === null || low === null || close === null) {
    return { data: null, error: `Row ${rowIndex}: Missing or invalid OHLC values` };
  }

  if (volume === null) {
    return { data: null, error: `Row ${rowIndex}: Missing or invalid volume` };
  }

  // Parse optional fields
  const parsedRow: ParsedRow = {
    date: dateObj.toISOString().split('T')[0], // Normalize to YYYY-MM-DD
    open,
    high,
    low,
    close,
    volume,
  };

  const turnover = parseNumber(getValue('turnover'));
  if (turnover !== null) parsedRow.turnover = turnover;

  const amplitude = parseNumber(getValue('amplitude'));
  if (amplitude !== null) parsedRow.amplitude = amplitude;

  const changePct = parseNumber(getValue('changePct'));
  if (changePct !== null) parsedRow.changePct = changePct;

  const changeAmount = parseNumber(getValue('changeAmount'));
  if (changeAmount !== null) parsedRow.changeAmount = changeAmount;

  const turnoverRate = parseNumber(getValue('turnoverRate'));
  if (turnoverRate !== null) parsedRow.turnoverRate = turnoverRate;

  return { data: parsedRow, error: null };
}

/**
 * Parse CSV content and return structured data
 */
export function parseCsvContent(content: string): CsvParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: ParsedRow[] = [];

  // Parse CSV into rows
  const rows = parseCSVContent(content);

  if (rows.length < 2) {
    return {
      success: false,
      data: [],
      rowCount: 0,
      columnMapping: {},
      dateRange: { first: '', last: '' },
      errors: ['CSV file must contain at least a header row and one data row'],
      warnings: [],
    };
  }

  // Validate headers
  const headers = rows[0];
  const validation = validateCsvHeaders(headers);

  if (!validation.valid) {
    return {
      success: false,
      data: [],
      rowCount: 0,
      columnMapping: validation.columnMapping,
      dateRange: { first: '', last: '' },
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  warnings.push(...validation.warnings);

  // Parse data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Skip empty rows
    if (row.every((cell) => !cell.trim())) {
      continue;
    }

    const result = parseRow(row, headers, validation.columnMapping, i + 1);

    if (result.error) {
      // Collect up to 10 errors, then summarize
      if (errors.length < 10) {
        errors.push(result.error);
      } else if (errors.length === 10) {
        errors.push('... and more errors (showing first 10 only)');
      }
      continue;
    }

    if (result.data) {
      data.push(result.data);
    }
  }

  // Sort by date
  data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate date range
  const dateRange = {
    first: data.length > 0 ? data[0].date : '',
    last: data.length > 0 ? data[data.length - 1].date : '',
  };

  return {
    success: errors.length === 0 && data.length > 0,
    data,
    rowCount: data.length,
    columnMapping: validation.columnMapping,
    dateRange,
    errors,
    warnings,
  };
}

/**
 * Validate file size and type
 */
export function validateCsvFile(
  file: File
): { valid: boolean; error: string | null } {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_ROWS = 100000;

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { valid: false, error: 'File must be a CSV file' };
  }

  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of 10MB (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Read file content as text
 */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
