/**
 * Tests for date cleaning utilities
 */

import { allDatesAtMidnight, stripMidnightTime, cleanDateColumn, normalizeDateString } from '../date-cleaner';

describe('Date Cleaner Utilities', () => {
  describe('allDatesAtMidnight', () => {
    it('should return true when all dates end with T00:00:00.000', () => {
      const dates = [
        '2024-01-15T00:00:00.000',
        '2024-01-16T00:00:00.000',
        '2024-01-17T00:00:00.000'
      ];
      expect(allDatesAtMidnight(dates)).toBe(true);
    });

    it('should return false when some dates have different times', () => {
      const dates = [
        '2024-01-15T00:00:00.000',
        '2024-01-16T14:30:00.000',
        '2024-01-17T00:00:00.000'
      ];
      expect(allDatesAtMidnight(dates)).toBe(false);
    });

    it('should return false when dates have no time component', () => {
      const dates = [
        '2024-01-15',
        '2024-01-16',
        '2024-01-17'
      ];
      expect(allDatesAtMidnight(dates)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(allDatesAtMidnight([])).toBe(false);
    });

    it('should handle dates with whitespace', () => {
      const dates = [
        '  2024-01-15T00:00:00.000  ',
        '  2024-01-16T00:00:00.000  '
      ];
      expect(allDatesAtMidnight(dates)).toBe(true);
    });
  });

  describe('stripMidnightTime', () => {
    it('should strip T00:00:00.000 suffix', () => {
      expect(stripMidnightTime('2024-01-15T00:00:00.000')).toBe('2024-01-15');
    });

    it('should not strip other time values', () => {
      const date = '2024-01-15T14:30:00.000';
      expect(stripMidnightTime(date)).toBe(date);
    });

    it('should handle dates without time component', () => {
      const date = '2024-01-15';
      expect(stripMidnightTime(date)).toBe(date);
    });

    it('should handle null/undefined', () => {
      expect(stripMidnightTime(null as any)).toBe(null);
      expect(stripMidnightTime(undefined as any)).toBe(undefined);
    });
  });

  describe('cleanDateColumn', () => {
    it('should clean date column when all dates are at midnight', () => {
      const rows = [
        { date: '2024-01-15T00:00:00.000', value: 100 },
        { date: '2024-01-16T00:00:00.000', value: 200 },
        { date: '2024-01-17T00:00:00.000', value: 300 }
      ];

      const cleaned = cleanDateColumn(rows, 'date');

      expect(cleaned).toBe(true);
      expect(rows[0].date).toBe('2024-01-15');
      expect(rows[1].date).toBe('2024-01-16');
      expect(rows[2].date).toBe('2024-01-17');
    });

    it('should not clean when dates have different times', () => {
      const rows = [
        { date: '2024-01-15T00:00:00.000', value: 100 },
        { date: '2024-01-16T14:30:00.000', value: 200 },
        { date: '2024-01-17T00:00:00.000', value: 300 }
      ];

      const cleaned = cleanDateColumn(rows, 'date');

      expect(cleaned).toBe(false);
      // Dates should remain unchanged
      expect(rows[0].date).toBe('2024-01-15T00:00:00.000');
      expect(rows[1].date).toBe('2024-01-16T14:30:00.000');
      expect(rows[2].date).toBe('2024-01-17T00:00:00.000');
    });

    it('should handle empty array', () => {
      const rows: any[] = [];
      expect(cleanDateColumn(rows, 'date')).toBe(false);
    });

    it('should handle custom column name', () => {
      const rows = [
        { timestamp: '2024-01-15T00:00:00.000', value: 100 },
        { timestamp: '2024-01-16T00:00:00.000', value: 200 }
      ];

      const cleaned = cleanDateColumn(rows, 'timestamp');

      expect(cleaned).toBe(true);
      expect(rows[0].timestamp).toBe('2024-01-15');
      expect(rows[1].timestamp).toBe('2024-01-16');
    });
  });

  describe('normalizeDateString', () => {
    it('should normalize ISO datetime at midnight with timezone', () => {
      expect(normalizeDateString('1999-11-10T00:00:00.000+00:00')).toBe('1999-11-10');
      expect(normalizeDateString('2024-01-15T00:00:00.000Z')).toBe('2024-01-15');
      expect(normalizeDateString('2024-01-15T00:00:00.000-08:00')).toBe('2024-01-15');
    });

    it('should normalize ISO datetime at midnight without timezone', () => {
      expect(normalizeDateString('2024-01-15T00:00:00.000')).toBe('2024-01-15');
    });

    it('should not normalize dates with non-midnight times', () => {
      const date = '2024-01-15T14:30:00.000';
      expect(normalizeDateString(date)).toBe(date);
    });

    it('should not normalize simple date format', () => {
      const date = '2024-01-15';
      expect(normalizeDateString(date)).toBe(date);
    });

    it('should handle whitespace', () => {
      expect(normalizeDateString('  2024-01-15T00:00:00.000+00:00  ')).toBe('2024-01-15');
    });

    it('should handle null/undefined', () => {
      expect(normalizeDateString(null as any)).toBe(null);
      expect(normalizeDateString(undefined as any)).toBe(undefined);
    });
  });

  describe('Integration: Complete workflow', () => {
    it('should clean dates from API response with midnight timestamps', () => {
      // Simulated API response with timezone-aware midnight timestamps
      const apiData = [
        { date: '1999-11-10T00:00:00.000+00:00', close: 10.5 },
        { date: '1999-11-11T00:00:00.000+00:00', close: 11.2 },
        { date: '1999-11-12T00:00:00.000+00:00', close: 10.8 }
      ];

      // Clean dates before saving to CSV
      const cleaned = cleanDateColumn(apiData, 'date');

      expect(cleaned).toBe(true);
      expect(apiData[0].date).toBe('1999-11-10');
      expect(apiData[1].date).toBe('1999-11-11');
      expect(apiData[2].date).toBe('1999-11-12');
    });

    it('should preserve non-midnight timestamps', () => {
      // Intraday data with various timestamps
      const intradayData = [
        { date: '2024-01-15T09:30:00.000', close: 100 },
        { date: '2024-01-15T10:00:00.000', close: 101 },
        { date: '2024-01-15T10:30:00.000', close: 102 }
      ];

      // Should not clean since times are not all at midnight
      const cleaned = cleanDateColumn(intradayData, 'date');

      expect(cleaned).toBe(false);
      expect(intradayData[0].date).toBe('2024-01-15T09:30:00.000');
      expect(intradayData[1].date).toBe('2024-01-15T10:00:00.000');
      expect(intradayData[2].date).toBe('2024-01-15T10:30:00.000');
    });
  });
});
