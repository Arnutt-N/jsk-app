// The race: a slower earlier query resolving after a newer one.
// Models the component's state machine directly, since the defect lives in
// which write wins, not in React's scheduling.
import { describe, expect, it } from 'vitest';

// Mirrors ConversationList's state: list, resultQuery, and the live query.
function makeSearch() {
  let list: string[] = [];
  let resultQuery = '';
  let liveQuery = '';

  const view = () => ({
    searching: Boolean(liveQuery) && liveQuery !== resultQuery,
    results: liveQuery && resultQuery === liveQuery ? list : [],
  });

  const type = (q: string) => { liveQuery = q.trim(); };

  // The guard the component now applies before writing.
  const resolve = (q: string, items: string[]) => {
    if (liveQuery !== q) return;      // stale response, dropped
    list = items;
    resultQuery = q;
  };

  // The previous behaviour: write unconditionally.
  const resolveUnguarded = (q: string, items: string[]) => {
    list = items;
    resultQuery = q;
  };

  return { view, type, resolve, resolveUnguarded };
}

describe('search response ordering', () => {
  it('unguarded: a late response from an older query strands the view', () => {
    const s = makeSearch();
    s.type('a');
    s.type('ab');
    s.resolveUnguarded('ab', ['ab-result']);   // newer lands first
    s.resolveUnguarded('a', ['a-result']);     // older lands late
    const v = s.view();
    expect(v.results).toHaveLength(0);         // shows nothing for 'ab'
    expect(v.searching).toBe(true);            // and looks stuck
  });

  it('guarded: the late older response is dropped', () => {
    const s = makeSearch();
    s.type('a');
    s.type('ab');
    s.resolve('ab', ['ab-result']);
    s.resolve('a', ['a-result']);
    const v = s.view();
    expect(v.results).toEqual(['ab-result']);
    expect(v.searching).toBe(false);
  });

  it('guarded: searching is true from the moment a term is typed', () => {
    const s = makeSearch();
    s.type('x');
    expect(s.view().searching).toBe(true);     // no 300ms gap of "no results"
    s.resolve('x', ['x-result']);
    expect(s.view().searching).toBe(false);
    expect(s.view().results).toEqual(['x-result']);
  });
});
