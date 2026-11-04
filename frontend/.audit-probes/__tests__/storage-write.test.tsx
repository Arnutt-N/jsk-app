// @vitest-environment jsdom
// Does the render-phase dispatch in lib/booking/store.ts persist to
// sessionStorage on renders React later discards?
//
// dispatch -> store.dispatch -> saveDraft(state, storage)  (lib/booking/draft.ts:267)
// and store.ts:204-220 calls dispatch() during render to preselect a date.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

const json = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/bookings/options')) {
      return json({ service_types: ['svc'], advance_days: 7, blackout_dates: [], max_range_days: 62 });
    }
    if (u.includes('/availability/range')) {
      return json({
        service_type: 'svc',
        days: [{ date: '2026-11-10', is_open: true, remaining: 3 }],
      });
    }
    if (u.includes('/availability')) return json({ date: '2026-11-10', slots: [] });
    return json({});
  }));
}

describe('render-phase dispatch and sessionStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    stubFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('records how many times the draft is persisted during a single mount', async () => {
    const writes = [];
    const origSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (this === sessionStorage) writes.push(k);
      return origSet.call(this, k, v);
    });

    const { useBookingStore } = await import('@/lib/booking/store');
    const { result } = renderHook(
      () => useBookingStore({ idToken: 'tok', confirmed: false }),
      { wrapper: StrictMode },
    );

    await waitFor(() => expect(result.current.options).not.toBeNull(), { timeout: 5000 });
    // Let range load, then the preselect fires during render.
    await waitFor(() => expect(result.current.draft.date).not.toBe(''), { timeout: 5000 });

    const key = writes[0];
    const persisted = key ? sessionStorage.getItem(key) : null;
    const persistedDate = persisted ? JSON.parse(persisted).draft.date : undefined;

    console.log(JSON.stringify({
      storageWrites: writes.length,
      storageKey: key,
      persistedDate,
      liveDraftDate: result.current.draft.date,
    }));

    expect(writes.length).toBeGreaterThan(0);
    // The interesting question: does storage agree with the live draft?
    expect(persistedDate).toBe(result.current.draft.date);
  });
});
