// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useDatePresetFilter } from '@/hooks/useDatePresetFilter';

const NOW = new Date('2026-11-04T12:00:00+07:00');

afterEach(() => {
  vi.useRealTimers();
});

function freezeNow() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

describe('useDatePresetFilter', () => {
  it('starts unfiltered with empty params', () => {
    const { result } = renderHook(() => useDatePresetFilter());
    expect(result.current.datePreset).toBeNull();
    expect(result.current.range).toBeNull();
    expect(result.current.params).toEqual({});
    expect(result.current.hasFilter).toBe(false);
    expect(result.current.isBlocked).toBe(false);
  });

  it('resolves a preset into the same range the pickers would hold', () => {
    freezeNow();
    const { result } = renderHook(() => useDatePresetFilter());
    act(() => {
      result.current.handlePresetChange('7d');
    });
    expect(result.current.range).toEqual({ start: '2026-10-28', end: '2026-11-04' });
    expect(result.current.params).toEqual({ start_date: '2026-10-28', end_date: '2026-11-04' });
    expect(result.current.hasFilter).toBe(true);
  });

  it('marks a reversed pair blocked so the caller skips the fetch', () => {
    const { result } = renderHook(() => useDatePresetFilter());
    act(() => {
      result.current.handleCustomStartChange('2026-09-05');
    });
    act(() => {
      result.current.handleCustomEndChange('2026-09-01');
    });
    expect(result.current.isBlocked).toBe(true);
    expect(result.current.params).toEqual({});
  });

  it('clears back to the unfiltered state', () => {
    freezeNow();
    const { result } = renderHook(() => useDatePresetFilter());
    act(() => {
      result.current.handlePresetChange('7d');
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.range).toBeNull();
    expect(result.current.params).toEqual({});
    expect(result.current.hasFilter).toBe(false);
  });

  it('pins a single day for calendar day-pick flows', () => {
    const { result } = renderHook(() => useDatePresetFilter());
    act(() => {
      result.current.pinSingleDay('2026-09-02');
    });
    expect(result.current.params).toEqual({ start_date: '2026-09-02', end_date: '2026-09-02' });
  });
});
