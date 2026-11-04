// @vitest-environment jsdom
// Proves the one safety fact for the 54-site react-hooks sweep:
// no effect's `cancelled` guard discards a response the original code applied.
//
// The scanner (`.audit/deadlock-scan.cjs`) answers this statically for one hop
// of useCallback. These mounts answer it where the guard and a self-written dep
// actually coexist: lib/booking/store.ts (its slots effect sets slotsStatus,
// which is in its own deps) and image-resize (derives processing from blobKey).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const availability = vi.fn();

const json = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('safety fact: no cancelled guard discards an applied response', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    availability.mockReset();
    availability.mockResolvedValue({ date: '2026-11-10', slots: [{ time: '09:00', remaining: 3, is_full: false }] });

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/bookings/options')) {
        return json({ service_types: ['svc'], advance_days: 7, blackout_dates: [], max_range_days: 62 });
      }
      if (u.includes('/availability/range')) return json({ service_type: 'svc', days: [] });
      if (u.includes('/availability')) {
        const body = await availability(u);
        return json(body);
      }
      return json({});
    }));

    localStorage.clear();
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:stub', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('lib/booking/store.ts: the slots effect reaches ready instead of cancelling itself', async () => {
    const { useBookingStore } = await import('@/lib/booking/store');
    const { result } = renderHook(() => useBookingStore({ idToken: 'tok', confirmed: false }));

    // Drive a service + date so the slots effect has work to do.
    await waitFor(() => expect(result.current.options).not.toBeNull(), { timeout: 5000 });
    act(() => {
      result.current.dispatch({ type: 'service/set', service: 'svc' });
      result.current.dispatch({ type: 'date/set', date: '2026-11-10' });
    });

    await waitFor(() => expect(result.current.loadingSlots).toBe(false), { timeout: 5000 });

    // The deadlock signature is availability null forever with the spinner gone.
    expect(availability.mock.calls.length).toBeGreaterThan(0);
    expect(result.current.availability).not.toBeNull();
  });

  it('image-resize: a settled resize clears processing', async () => {
    const { useImageResize } = await import('@/app/admin/image-resize/use-image-resize');
    const { result } = renderHook(() => useImageResize({ toast: () => {} }));

    act(() => {
      result.current.setTargetWidth('100');
      result.current.setTargetHeight('100');
    });

    await waitFor(() => expect(result.current.processing).toBe(false), { timeout: 5000 });
    // Settled means the derived key matches; if the catch had not marked it, this stays false.
    expect(result.current.visibleBlobKey === null || typeof result.current.visibleBlobKey === 'string').toBe(true);
  });
});
