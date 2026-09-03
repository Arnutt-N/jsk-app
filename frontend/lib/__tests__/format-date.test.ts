import { describe, it, expect } from 'vitest';
import {
  formatThaiDate,
  formatThaiDateOnly,
  formatThaiDateTime,
  parseDateParts,
} from '@/lib/format-date';

describe('formatThaiDate', () => {
  it('formats full ISO string with time and 4-digit BE year', () => {
    const result = formatThaiDate('2026-09-03T07:44:00+07:00', {
      includeTime: true,
      yearFormat: 'numeric',
    });
    expect(result).toBe('03 ก.ย. 2569 07:44 น.');
  });

  it('formats with 2-digit BE year and leading-zero midnight hour', () => {
    const result = formatThaiDate('2026-09-03T00:44:00+07:00', {
      includeTime: true,
      yearFormat: '2-digit',
    });
    expect(result).toBe('03 ก.ย. 69 00:44 น.');
  });

  it('formats date-only string without UTC day rollback', () => {
    const result = formatThaiDate('2026-09-03');
    expect(result).toBe('03 ก.ย. 2569');
  });

  it('supports unpadded single digit day format', () => {
    const result = formatThaiDate('2026-09-03', { dayFormat: 'numeric' });
    expect(result).toBe('3 ก.ย. 2569');
  });

  it('supports long Thai month format', () => {
    const result = formatThaiDate('2026-09-03', { monthFormat: 'long' });
    expect(result).toBe('03 กันยายน 2569');
  });

  it('handles leap year 29 Feb correctly', () => {
    const result = formatThaiDate('2024-02-29T12:00:00+07:00');
    expect(result).toBe('29 ก.พ. 2567');
  });

  it('handles year boundary rollover (31 Dec 2025 -> 31 ธ.ค. 2568)', () => {
    const result = formatThaiDate('2025-12-31T10:00:00+07:00');
    expect(result).toBe('31 ธ.ค. 2568');
  });

  it('returns default fallback on null, undefined, or empty string', () => {
    expect(formatThaiDate(null)).toBe('—');
    expect(formatThaiDate(undefined)).toBe('—');
    expect(formatThaiDate('')).toBe('—');
  });

  it('returns custom fallback when specified', () => {
    expect(formatThaiDate(null, { fallback: '-' })).toBe('-');
    expect(formatThaiDate(undefined, { fallback: 'ไม่ได้กำหนด' })).toBe('ไม่ได้กำหนด');
  });

  it('returns fallback on invalid date string', () => {
    expect(formatThaiDate('not-a-valid-date')).toBe('—');
  });

  it('handles Date objects directly', () => {
    const date = new Date('2026-09-03T07:44:00+07:00');
    expect(formatThaiDate(date, { includeTime: true })).toBe('03 ก.ย. 2569 07:44 น.');
  });
});

describe('formatThaiDateOnly and formatThaiDateTime convenience helpers', () => {
  it('formatThaiDateOnly formats without time', () => {
    expect(formatThaiDateOnly('2026-09-03T07:44:00+07:00')).toBe('03 ก.ย. 2569');
  });

  it('formatThaiDateTime formats with time', () => {
    expect(formatThaiDateTime('2026-09-03T07:44:00+07:00')).toBe('03 ก.ย. 2569 07:44 น.');
  });
});

describe('parseDateParts', () => {
  it('returns null on null, undefined, or invalid inputs', () => {
    expect(parseDateParts(null)).toBeNull();
    expect(parseDateParts(undefined)).toBeNull();
    expect(parseDateParts('')).toBeNull();
    expect(parseDateParts('garbage')).toBeNull();
  });

  it('parses Bangkok calendar components accurately from UTC ISO string', () => {
    // 00:44 UTC = 07:44 Bangkok (+7)
    const parts = parseDateParts('2026-09-03T00:44:00.000Z');
    expect(parts).toEqual({
      year: 2026,
      month: 8, // September (0-indexed)
      day: 3,
      hours: 7,
      minutes: 44,
    });
  });
});
