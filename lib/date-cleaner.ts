/**
 * Utility functions for cleaning date formats in CSV data
 */

/**
 * Check if all date strings in an array end with exactly T00:00:00.000
 */
export function allDatesAtMidnight(dates: string[]): boolean {
  if (!dates || dates.length === 0) {
    return false;
  }

  const midnightPattern = /T00:00:00\.000$/;

  return dates.every((date) => {
    if (!date || typeof date !== 'string') {
      return false;
    }
    return midnightPattern.test(date.trim());
  });
}

/**
 * Strip T00:00:00.000 suffix from a date string
 */
export function stripMidnightTime(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') {
    return dateStr;
  }
  return dateStr.replace(/T00:00:00\.000$/, '');
}

/**
 * Clean date column in CSV rows by removing T00:00:00.000 if all dates are at midnight
 * Modifies rows in place and returns whether cleaning was performed
 */
export function cleanDateColumn(rows: Record<string, any>[], dateColumnName: string = 'date'): boolean {
  if (!rows || rows.length === 0) {
    return false;
  }

  // Extract all date values
  const dates = rows.map(row => row[dateColumnName]).filter(d => d != null);

  if (dates.length === 0) {
    return false;
  }

  // Check if all dates are at midnight
  if (!allDatesAtMidnight(dates)) {
    return false;
  }

  // Strip midnight time from all dates
  rows.forEach(row => {
    if (row[dateColumnName]) {
      row[dateColumnName] = stripMidnightTime(row[dateColumnName]);
    }
  });

  return true;
}

/**
 * Normalize a date string by removing timezone and time if it's exactly midnight
 *
 * Examples:
 * - "2024-01-15T00:00:00.000+00:00" → "2024-01-15"
 * - "2024-01-15T14:30:00.000" → "2024-01-15T14:30:00.000" (keeps non-midnight times)
 * - "2024-01-15" → "2024-01-15" (already clean)
 */
export function normalizeDateString(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') {
    return dateStr;
  }

  const trimmed = dateStr.trim();

  // Match date with time at exactly midnight (with or without timezone)
  // Matches: T00:00:00.000, T00:00:00.000Z, T00:00:00.000+00:00, etc.
  const midnightPattern = /^(\d{4}-\d{2}-\d{2})T00:00:00\.000([Z+\-].*)?$/;
  const match = trimmed.match(midnightPattern);

  if (match) {
    // Return just the date part (YYYY-MM-DD)
    return match[1];
  }

  // Not at midnight or different format, return as-is
  return trimmed;
}
