import { describe, it, expect } from 'vitest';
import {
  BE_OFFSET,
  toBE,
  toCE,
  parseThaiDate,
  daysInMonth,
  isoToYMD,
  isoToHM,
} from '../utils';

describe('Buddhist Era conversion', () => {
  it('offset is 543', () => {
    expect(BE_OFFSET).toBe(543);
  });

  it('toBE adds 543 (ค.ศ. → พ.ศ.)', () => {
    expect(toBE(2024)).toBe(2567);
    expect(toBE(2016)).toBe(2559);
  });

  it('toCE subtracts 543 (พ.ศ. → ค.ศ.)', () => {
    expect(toCE(2567)).toBe(2024);
    expect(toCE(2569)).toBe(2026);
  });

  it('round-trips', () => {
    expect(toCE(toBE(1990))).toBe(1990);
  });
});

describe('parseThaiDate', () => {
  it('builds a CE Date from Thai (พ.ศ.) parts', () => {
    const d = parseThaiDate(15, 1, 2567);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0); // January is 0
    expect(d.getDate()).toBe(15);
  });

  it('handles December correctly', () => {
    const d = parseThaiDate(31, 12, 2569);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
  });
});

describe('daysInMonth', () => {
  it('returns 29 for February in a leap year', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('returns 28 for February in a non-leap year', () => {
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it('returns 30 for April', () => {
    expect(daysInMonth(2024, 4)).toBe(30);
  });
});

describe('isoToYMD', () => {
  it('returns empty string for null/empty/invalid', () => {
    expect(isoToYMD(null)).toBe('');
    expect(isoToYMD('')).toBe('');
    expect(isoToYMD('not-a-date')).toBe('');
  });

  it('preserves the LOCAL calendar day (no UTC off-by-one)', () => {
    // A local-midnight Date in a +07 zone serialized via toISOString() would be
    // the previous UTC day; isoToYMD must read local parts and keep the real day.
    const local = new Date(2024, 0, 15); // 15 Jan 2024, local midnight
    expect(isoToYMD(local.toISOString())).toBe('2024-01-15');
  });

  it('zero-pads month and day', () => {
    const d = new Date(2024, 2, 5); // 5 Mar 2024
    expect(isoToYMD(d.toISOString())).toBe('2024-03-05');
  });
});

describe('isoToHM', () => {
  it('returns empty string for null/empty/invalid', () => {
    expect(isoToHM(null)).toBe('');
    expect(isoToHM('')).toBe('');
    expect(isoToHM('nope')).toBe('');
  });

  it('formats local hours/minutes zero-padded', () => {
    const d = new Date(2024, 0, 15, 9, 5);
    expect(isoToHM(d.toISOString())).toBe('09:05');
  });
});
