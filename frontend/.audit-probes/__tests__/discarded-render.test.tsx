// @vitest-environment jsdom
// Severity check for the render-phase dispatch in lib/booking/store.ts.
//
// dispatch() runs during render (store.ts:210-216) and reaches
// saveDraft() -> sessionStorage (draft.ts:267). React may render a component
// whose output it then discards. If the write survives a discarded render, a
// draft the user never reached can be persisted.
//
// Model of a discarded render: dispatch() is called at render time, and the
// component throws before commit. React unmounts the tree. Did storage change?
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const json = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('discarded render must not persist a draft', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/bookings/options')) {
        return json({ service_types: ['svc'], advance_days: 7, blackout_dates: [], max_range_days: 62 });
      }
      return json({});
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saveDraft writes immediately, with no commit boundary in between', async () => {
    const { createDraftStore, DRAFT_STORAGE_KEY } = await import('@/lib/booking/draft');

    const before = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    const store = createDraftStore({ storage: sessionStorage });

    // This is exactly what the render-phase branch does at store.ts:210-216.
    store.dispatch({ type: 'date/set', date: '2026-11-10' });

    const after = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    const persistedDate = after ? JSON.parse(after).draft.date : null;

    console.log(JSON.stringify({ before, persistedDate, committed: false }));

    // No render ever committed, yet the draft is on disk.
    expect(before).toBeNull();
    expect(persistedDate).toBe('2026-11-10');
  });
});
