import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CUSTOM_RANGE_MESSAGES,
  customRangeProblem,
  presetOptionToDates,
  resolveDateRange,
  resolveDateRangeWithFallback,
} from '@/lib/date-range';

const NOW = new Date('2026-11-04T12:00:00+07:00');

afterEach(() => {
  vi.useRealTimers();
});

function freezeNow() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

describe('customRangeProblem', () => {
  it('stays silent when the user has not started picking', () => {
    expect(customRangeProblem('', '')).toBeNull();
  });

  it('reports a missing bound as incomplete', () => {
    expect(customRangeProblem('2026-09-01', '')).toBe('incomplete');
    expect(customRangeProblem('', '2026-09-30')).toBe('incomplete');
  });

  it('reports start after end as reversed', () => {
    expect(customRangeProblem('2026-09-05', '2026-09-01')).toBe('reversed');
  });

  it('returns null for a complete, ordered range', () => {
    expect(customRangeProblem('2026-09-01', '2026-09-30')).toBeNull();
    expect(customRangeProblem('2026-09-01', '2026-09-01')).toBeNull();
  });

  it('ships Thai copy for both problems', () => {
    expect(CUSTOM_RANGE_MESSAGES.incomplete).toBe('กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด');
    expect(CUSTOM_RANGE_MESSAGES.reversed).toBe('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
  });
});

describe('resolveDateRange', () => {
  it('returns null when unfiltered', () => {
    freezeNow();
    expect(resolveDateRange(null, '', '')).toBeNull();
  });

  it('resolves a 7-day preset ending today', () => {
    freezeNow();
    expect(resolveDateRange('7d', '', '')).toEqual({
      start: '2026-10-28',
      end: '2026-11-04',
    });
  });

  it('passes a complete custom range through unchanged', () => {
    freezeNow();
    expect(resolveDateRange('custom', '2026-09-01', '2026-09-30')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });

  it('returns null for a half-picked custom range', () => {
    freezeNow();
    expect(resolveDateRange('custom', '2026-09-01', '')).toBeNull();
  });

  it('returns null for a reversed custom range instead of echoing it back', () => {
    freezeNow();
    expect(resolveDateRange('custom', '2026-09-05', '2026-09-01')).toBeNull();
  });
});

describe('presetOptionToDates', () => {
  it('starts a year-to-date preset on Jan 1 and ends today', () => {
    freezeNow();
    expect(presetOptionToDates({ key: 'year', label: 'ปีนี้', yearToDate: true })).toEqual({
      start: '2026-01-01',
      end: '2026-11-04',
    });
  });
});

describe('resolveDateRangeWithFallback', () => {
  it('falls back to a 30-day window for a reversed custom range', () => {
    freezeNow();
    expect(resolveDateRangeWithFallback('custom', '2026-09-05', '2026-09-01')).toEqual({
      start: '2026-10-05',
      end: '2026-11-04',
    });
  });
});
