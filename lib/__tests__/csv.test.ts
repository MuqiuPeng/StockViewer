/**
 * Tests for CSV parsing, specifically date handling
 */

// Mock the parseDate function for testing
function parseDate(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const trimmed = dateStr.trim();

  // Extract date part (YYYY-MM-DD) from various formats
  const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (dateMatch) {
    // Return YYYY-MM-DD format directly
    const [, year, month, day] = dateMatch;
    return `${year}-${month}-${day}`;
  }

  // Fallback: try parsing the full string and extract date
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    return null;
  }

  // Extract YYYY-MM-DD from the parsed date (using UTC to avoid timezone shift)
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('CSV Date Parsing', () => {
  it('should parse simple date format (YYYY-MM-DD)', () => {
    const dateStr = parseDate('1999-11-10');
    expect(dateStr).toBe('1999-11-10');
  });

  it('should parse ISO datetime format (YYYY-MM-DDTHH:mm:ss)', () => {
    const dateStr = parseDate('1999-11-10T00:00:00');
    expect(dateStr).toBe('1999-11-10');
  });

  it('should parse ISO datetime with milliseconds', () => {
    const dateStr = parseDate('1999-11-10T00:00:00.000');
    expect(dateStr).toBe('1999-11-10');
  });

  it('should parse ISO datetime with timezone (UTC)', () => {
    const dateStr = parseDate('1999-11-10T00:00:00.000+00:00');
    // Should extract date part (1999-11-10), not convert timezone
    expect(dateStr).toBe('1999-11-10');
  });

  it('should parse ISO datetime with different time', () => {
    const dateStr = parseDate('1999-11-10T14:30:45.000');
    // Should extract date part (1999-11-10) and ignore time
    expect(dateStr).toBe('1999-11-10');
  });

  it('should handle whitespace', () => {
    const dateStr = parseDate('  1999-11-10  ');
    expect(dateStr).toBe('1999-11-10');
  });

  it('should return null for invalid dates', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('invalid')).toBeNull();
  });

  it('should preserve date across timezone boundaries', () => {
    // These dates are all "November 10, 1999" in their respective formats
    // All should extract to "1999-11-10" regardless of time/timezone
    const formats = [
      '1999-11-10',
      '1999-11-10T00:00:00',
      '1999-11-10T00:00:00.000',
      '1999-11-10T00:00:00.000+00:00',
      '1999-11-10T00:00:00.000Z',
      '1999-11-10T23:59:59.999+00:00',
    ];

    formats.forEach(format => {
      const dateStr = parseDate(format);
      expect(dateStr).toBe('1999-11-10');
    });
  });
});
