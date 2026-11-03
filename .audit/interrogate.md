# Interrogate: next 16.4.3 + react-hooks sweep

## Intent

Ship the Next.js 16.4.3 security upgrade (3 production critical advisories to 0) and clear all 54 pre-existing `react-hooks/set-state-in-effect` violations it exposes, with behaviour unchanged except two declared exceptions: toasts render as soon as one exists, and five pages start `loading=true`. The author's stated contract: same requests, same loading transitions, same Thai error messages; `loadSlots`, `rangeInfo`, `dispatch` and `BookingStore` unchanged; no test file modified.

## Findings

### F1. A successful save leaves the error banner up forever (verified by inspection, level 3)

`app/admin/settings/telegram/page.tsx`

`setError` has exactly three sites: the declaration at `:47`, the failure write inside `fetchConfig` at `:56`, and a clear at `:66`. The clear sits inside the **mount-only** effect, not inside `fetchConfig`. `handleSave` calls `fetchConfig()` at `:83`.

The sweep moved `setError(null)` out of `fetchConfig` and into the effect. Before the change, `fetchConfig` began with `setError(null)`, so every call cleared it. Now nothing clears it after mount.

Repro path: initial GET fails, giving `config === null` and `loading === false`. The error banner renders. The edit form is reachable even when `config` is null. Saving succeeds. `fetchConfig()` succeeds and sets `config`, but the failed-load message stays on screen indefinitely.

Same file, `:67`: `if (cancelled) return;` sits **before** `await fetchConfig()`, so it can never be true and the guard is dead.

Severity: medium. Visible wrong state on an admin settings page, cleared only by a full reload.

### F2. Two of the sweep's guards are theatre, and the boilerplate is unnecessary (verified by run, level 4)

The `let cancelled` block appears in 40 effects. Probing the rule directly (`npx eslint` on three variants) shows:

| Variant | Result |
|---|---|
| `useEffect(() => { void load() }, [load])` | **1 error** `set-state-in-effect` |
| `const run = async () => { await load() }; void run()` — **no guard at all** | **0 errors** |
| with `let cancelled` + cleanup | 0 errors |

So the rule rejects only a *synchronous* setState in the effect body. The guard is not what satisfies it.

In the dominant shape the guard is also dead on its own terms:

```js
const run = async () => {
  await fetchLogs();
  if (cancelled) return;   // fetchLogs already wrote every state it writes
};
```

`fetchLogs` resolves only after its own setState calls have run. By the time the guard is evaluated there is nothing left to prevent. It protects nothing.

Blast radius of removing it: the guard is genuinely live in four places where a write follows the await — `app/admin/settings/telegram/page.tsx:67` (dead anyway, see F1), `app/login/page.tsx:104`, `lib/booking/store.ts:146` and `:186`. Those keep it.

Approximate cost: about 120 lines of boilerplate that lint does not require.

### F3. Three parallel requests became three sequential ones (verified by reading the diff)

`app/admin/requests/[id]/page.tsx:391-398`

Before: `void fetchDetail(); void fetchComments(); void fetchAuditLogs();` — three concurrent round trips.
After: `await fetchDetail(); await fetchComments(); await fetchAuditLogs();` — serialised, so the tab takes roughly the sum of three latencies instead of the max.

Each fetcher has its own try/catch, so error semantics survive. The cost is wall-clock only. A `Promise.all` keeps concurrency and still satisfies the rule because the writes happen inside the async boundary.

### F4. Stale search results show for the new query (verified by inspection, level 2)

`app/admin/live-chat/_components/ConversationList.tsx:188-190`

`searchResults = searchQuery.trim() ? searchResultList : []` hides results only when the query is empty. `searchResultList` is never cleared when the query *changes*, so clearing the field and typing a different term shows the previous term's results until the new fetch lands, with no "Searching…" in between.

### F5. Render-phase dispatch persists outside a commit boundary (verified by run, level 4)

`lib/booking/store.ts:217-220` calls `dispatch` during render; `dispatch` reaches `saveDraft` and a synchronous `sessionStorage.setItem`. Proof in `.audit-probe/__tests__/discarded-render.test.tsx`: the draft moves from `null` to `{"date":"2026-11-10"}` with no committed render. Full write-up in `.audit/blast-radius.md`, risk 1.

## Dropped

| Adversary | Dropped | Reason |
|---|---|---|
| opus | 0 reported, 3 noted as unproven | Ran no probes; named the same render-phase dispatch and the raw-vs-visible blob split I had already recorded. Correctly declined to report anything it had not run. |
| sonnet | 1 (`rich-menus/new` render-phase `actions` sync) | Needed a mounted save-path run it did not execute. Legitimate call. |
| thermo review | 1 (blob URL leak on the error path) | Real but pre-existing; the sweep did not introduce it. Worth a separate issue, not a blocker here. |
| thermo quality | 2 of 6 suggestions | The `useState(true)` claim is refuted below; the `hooks/useApiFetch` migration is out of scope for a lint conformance sweep. |

## Refuted by the author

Both adversaries and the thermo review claimed the five `loading` flips were never applied. Verified: they were never in this change. `grep 'useState(false)'` returns all five files unchanged, and the base-to-head diff contains no `loading` init flip. The sweep preserved each fetcher's own `setLoading(true)`, so the declared exception in the PR body is **inaccurate**. The behaviour is unchanged, but the PR description overstates what shipped. Correction belongs in the PR body, not the code.
