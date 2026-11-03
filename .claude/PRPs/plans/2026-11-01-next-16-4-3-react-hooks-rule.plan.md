# Next.js 16.4.3 upgrade + `react-hooks` conformance — v4

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use `- [ ]` checkbox syntax.

**Goal:** Land `next@16.4.3` + `eslint-config-next@16.4.3` — clearing **all 3 production critical advisories to 0** (a 4th critical, `tinypool`, is dev-only and out of scope) — and bring all 54 `react-hooks` errors to zero in **two** independently revertable PRs.

**Approach:** Every fix comes from the probed shape table below, each verified against the installed `eslint-plugin-react-hooks@7.1.1`. Probes were deleted after measuring; the shape definitions are the surviving record.

**Tech stack:** Next.js 16.4.3 · React 19.2.3 · TypeScript 5.x · ESLint 9 flat config · `eslint-plugin-react-hooks@7.1.1` · Vitest 2.1.9 · Playwright 1.49

**Source PRD:** `.claude/PRPs/prds/2026-11-01-next-16-4-3-react-hooks-rule.prd.md` (APPROVED 2026-11-01)

## Metadata

| Field | Value |
|---|---|
| Complexity | High — 54 error sites, 42 files, 2 PRs |
| Branches | `chore/next-16-4-3-cve` (PR 1, exists) · `chore/react-hooks-booking-flow` (PR 2) |
| Source PRD | `.claude/PRPs/prds/2026-11-01-next-16-4-3-react-hooks-rule.prd.md` |
| PRD phases | PRD Phase 1 → plan Phase 1 · PRD Phase 2 → plan Phase 2 |

## Measured baseline (2026-11-02, `npx eslint -f json` in `frontend/`)

| Fact | Value |
|---|---|
| Errors | **54** — `set-state-in-effect` ×53, `immutability` ×1 |
| Files | **42** |
| Warnings | **7** — `react-hooks/incompatible-library` ×1, `@next/next/no-img-element` ×1, `@typescript-eslint/no-unused-vars` ×1, `no-location-assign-relative-destination` ×4 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | passes |
| `npm audit --omit=dev` | **0 critical, 3 high** (`lodash`, `source-map-js`, `zod` — **production** tree). Before the upgrade: 4 critical (3 Next.js + dev-only `tinypool`) and 16 high |
| `next` / `eslint-config-next` | 16.4.3 / 16.4.3 (both already in the working tree) |
| Rule source | `eslint-plugin-react-hooks` **7.0.1 → 7.1.1** in the lockfile. `eslint-config-next@16.1.1` declared `^7.0.0`; `eslint-config-next@16.4.3` declares **`^7.1.0`** — so the bump is what makes 7.1.1 mandatory, and 7.1.1 turns on `set-state-in-effect` at the recommended preset |

**Three rule behaviours that drive this whole plan — all probed:**

1. The rule reports **only the first synchronous `setState` per effect**. Fixing that line moves the error to the next synchronous `setState` in the same effect. Gate per **effect**, not per reported line.
2. Calling a **component-scoped** function that setStates from an effect body is flagged. A **module-scope** async function is not.
3. `ref.current` may not be **written or read** during render (`react-hooks/refs`). Writing it in an effect and reading it in a handler is fine.

**Measured but rejected anyway:** `void Promise.resolve().then(() => setX(1))` and `void Promise.resolve().then(() => dispatch(...))` from an effect body both **pass the rule** (probed, 0 errors). They are still banned here — they defer a state write to dodge the linter rather than removing it. If you see this pattern proposed, reject it on principle, not on lint.

## Conventions this repo already uses (copy these)

| Convention | SOURCE | Note |
|---|---|---|
| Shared API base | `lib/constants/api.ts:1` (`export const API_BASE = '/api/v1'`) — imported by exactly **6** files: `app/admin/files/page.tsx:34`, `lib/booking/store.ts:11`, `lib/booking.ts:8`, `lib/booking/service-mapping.ts:1`, `lib/business-hours.ts:2`, `hooks/useTaxonomyAdmin.ts:5` | **33 other files still declare a local `const API_BASE = '/api/v1'`** (34 declarations — `requests/[id]/page.tsx` has two, at :145 and :333). Leave them alone unless you are hoisting that page's fetcher to module scope — then delete the local const and import the shared one. `settings/telegram` and `debt-mediation` have no local const, so "delete it" is a no-op there |
| Hook-local constants | `app/admin/live-chat/_hooks/useOperatorRoster.ts:7` imports `API_BASE` from `../_lib/constants`, not `@/lib/constants/api` | Both files export `'/api/v1'` — the reason to leave it alone is import locality, not a different value |
| API error text | `lib/api-error.ts:30` — `export async function readErrorMessage(res, fallback)` | Import from `@/lib/api-error`; used at `lib/business-hours.ts:1` |
| Error surfacing differs by page | `app/admin/audit/page.tsx:106` logs only; `app/admin/settings/line/page.tsx:64-66` (readErrorMessage at :64, toast at :66) and `settings/custom/page.tsx:74-76` (readErrorMessage at :74, toast at :76) show it via `toast({variant:'error'})` | **Preserve whichever the file already does.** Do not unify them |
| Errors logged, not surfaced raw | `app/admin/audit/page.tsx:106` (`logger.error("Failed to fetch audit logs:", error)`) | `logger` from `@/lib/logger` |
| User-facing strings in Thai | `app/admin/settings/page.tsx:73` (`setError('ไม่สามารถโหลดข้อมูลได้')`) | |
| Loading state | `app/admin/audit/page.tsx:59` — `useState(false)`, **not** `true` | S1 requires flipping these to `true`; see the UX table |
| Tests beside the feature | `app/admin/bookings/__tests__/walkin.test.tsx` | Never modified |
| Import alias | `@/lib/...`, `@/components/...` | |

## NOT Building

- Not fixing the 3 **production** high advisories (`lodash`, `source-map-js`, `zod`) — upstream ranges, tracked separately.
- Not fixing the dev-only `tinypool` / `@vitest/mocker` / `jsdom` chain (behind Vitest 5).
- Not adding a data-fetching library.
- Not using `useSyncExternalStore` **for data fetching**, and never for a value the user mutates. It appears in exactly two places, both read-only browser values: `close-test`'s `userAgent` and `login`'s `isLocalhost` (PRD `prd:89` narrows the same way).
- Not adopting `await Promise.resolve()` or any deferral whose only purpose defeats the linter.
- Not modifying any test file.
- Not using a `warn` downgrade — the escape hatch was removed from the PRD.
- Not changing fetch behaviour, error handling, or the Thai messages.

## UX before / after

Two behaviour changes, both accepted deliberately:

| Surface | Before | After |
|---|---|---|
| Toasts | Rendered after hydration via a `mounted` flag; a toast raised during first paint appeared one frame late | Rendered as soon as `toasts.length > 0`; still never on the server |
| `/liff/booking` slot loading | `loadSlots` writes `slotsStatus`; `loadingSlots = slotsStatus === 'loading'` (`store.ts:233`) drives the spinner at `app/liff/booking/page.tsx:737` | **Unchanged.** Phase 2 Step 4's effect sets `slotsStatus('loading')` and `setError(...)` inside its async `run()`, and a mount probe confirms it reaches `'ready'` with slots and `'failed'` with the Thai error. `rangeStatus` (a different state) loses only its redundant `'loading'` write; after Step 3 deletes the preselect effect, `rangeStatus` has **no consumer at all** — see Step 2 |
| **`loading` initial value** | `useState(false)` on 5 files: `app/admin/audit/page.tsx:59`, `app/admin/analytics/page.tsx:94`, `app/admin/reports/page.tsx:199`, `components/admin/AssignModal.tsx:33`, `app/admin/live-chat/_hooks/useOperatorRoster.ts:47` | `useState(true)` — first paint is a spinner instead of empty content. Required by S1 (the fetcher no longer sets loading synchronously) |

Everything else is behaviour-preserving.

**Hydration constraint:** a lazy `useState` initializer that reads `window` differs between the server render and the client's first render. Where the value is server-rendered, either suppress the mismatch on the specific element or defer the write.

- `app/liff/close-test/page.tsx:92` renders `userAgent` → use **S8** (`useSyncExternalStore`), which has no mismatch.
- `app/login/page.tsx` renders `isLocalhost` (`:440`) and `rememberMe` on a controlled `<Checkbox checked>` (`:408`). `isLocalhost` is read-only → **S8**. `rememberMe` is user-toggleable, so it keeps real state, seeded in a post-hydration effect. `suppressHydrationWarning` was probed and does **not** help — see Step 4.

---

## Shape table (the only approved fixes)

Lint-verified against `eslint-plugin-react-hooks@7.1.1`. A shape not listed is not approved. **This table is normative** — if the PRD's summary table disagrees on an ID, this one wins.

### S1 — module-scope loader + effect-local guarded wrapper

```tsx
import { API_BASE } from '@/lib/constants/api'      // shared const — do NOT redeclare locally
import { readErrorMessage } from '@/lib/api-error'   // lib/api-error.ts:30
import { logger } from '@/lib/logger'

// module scope, outside the component
async function loadRows(filter: string): Promise<Row[]> {
  const res = await fetch(`${API_BASE}/rows?f=${encodeURIComponent(filter)}`)
  if (!res.ok) throw new Error(await readErrorMessage(res, 'ไม่สามารถโหลดข้อมูลได้'))
  return res.json()
}

export default function Page() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)        // must be true — nothing sets it before the first await

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const data = await loadRows(filter)
        if (cancelled) return
        setRows(data)
      } catch (err) {
        if (cancelled) return
        logger.error('Failed to fetch rows:', err)
        setError('ไม่สามารถโหลดข้อมูลได้')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [filter])

  // handler: same loader, same error handling, no duplication of the request
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await loadRows(filter))
    } catch (err) {
      logger.error('Failed to fetch rows:', err)
      setError('ไม่สามารถโหลดข้อมูลได้')
    } finally {
      setLoading(false)
    }
  }, [filter])
  ...
}
```

**Use for:** every fetcher called from both an effect and a handler. Do **not** keep a component-scoped `useCallback` fetcher that the effect calls.

**⚠️ The `cancelled` flag is only safe when the effect's own body does not change a dependency.** If the body writes a state that appears in the deps array (e.g. `setSlotsStatus('loading')` with `slotsStatus` in deps), the write re-runs the effect, the cleanup fires, and `if (cancelled) return` throws away the successful response — a permanent spinner. Lint does not catch this. When the effect must set a status that is itself a dep, drop `cancelled` and rely on a request-key comparison instead; Phase 2 Step 4 does exactly that and was verified by a mount probe.

### S2 — S1 with a `reloadKey`, when the handler must reuse the effect's exact path

```tsx
const [reloadKey, setReloadKey] = useState(0)
useEffect(() => { /* same as S1 */ }, [filter, reloadKey])
const refresh = () => { setLoading(true); setReloadKey(k => k + 1) }
```

**Use for:** `app/admin/analytics/page.tsx` only (its 30 s interval and its refresh button must drive one path).

### S3 — derive the emptied value during render, **and delete the effect's early-return write**

```tsx
const [fetched, setFetched] = useState<string[]>([])
const results = query ? fetched : []        // derive …
useEffect(() => {
  if (!query) return                          // … and REMOVE the old `setX([])` that sat here
  ...
}, [query])
```

**Both halves are required.** Deriving the read alone leaves the effect's `setX([])` in place and the error stays. Probed: literal derive-only → 1 error; derive + deleted early-return write → 0 errors.

**Use for:** an effect whose only job on a falsy input is to clear state.

### S4 — adjust state during render with a prev-value state

```tsx
const [prevX, setPrevX] = useState(x)
if (prevX !== x) {
  setPrevX(x)
  if (x) setForm({ ...initialFrom(x) })
}
```

**Forbidden inside this block:** writing `ref.current` (probed: `react-hooks/refs`). Keep ref writes in an effect (S7).

**Use for:** prop→state mirroring, open/close reset, filter-changes-reset-page.

### S5 — lazy `useState` initializer

```tsx
const [v] = useState(() => typeof window === 'undefined' ? '' : readBrowserValue())
```

**Use only when the value is NOT server-rendered.** See the hydration constraint above.

### S6 — gate render on real data

```tsx
if (toasts.length === 0) return null
```

**Use for:** `components/ui/Toast.tsx` only.

### S7 — ref write in its own effect

```tsx
const keyRef = useRef('seed')
useEffect(() => { if (open) keyRef.current = crypto.randomUUID() }, [open])
// read keyRef.current only in handlers/effects — never in render
```

**Use for:** `WalkinBookingDialog` `idempotencyKey` (written :59, read only at :114 in `handleSave`).

### S8 — `useSyncExternalStore` for a **read-only** browser value

```tsx
const ua = useSyncExternalStore(() => () => {}, () => navigator.userAgent, () => '')
```

**Use for:** browser-only values that are server-rendered **and never written by the user** — `close-test`'s `userAgent`, `login`'s `isLocalhost`. Precedent: `components/providers/ThemeProvider.tsx:33`. Probed: 0 errors.

**Do NOT use for a value the user mutates.** The no-op subscribe never fires, so there is no re-render on change — a Checkbox wired this way cannot be toggled. `login`'s `rememberMe` is exactly that case: it keeps real `useState`, seeded in a post-hydration effect (Step 4).

**Why not `suppressHydrationWarning` instead:** probed, it does not work — the prop lands on a different element than the one that mismatches. See Step 4.

### S9 — reorder declarations (`immutability` rule)

`app/liff/service-request/page.tsx:75` — move `INITIAL_FORM_DATA` (line 98) and `const [formData, setFormData] = useState(INITIAL_FORM_DATA)` (120) **above** the `useLocationCascade(...)` call at line 73. `INITIAL_FORM_DATA` must move too, because `useState` reads it.

**Do not move `fieldErrors`** — it is already declared at line **57**, above the hook. An earlier draft said to move it; that is a no-op and will only confuse.

### S10 — move the write into the async boundary that already exists

An effect flagged for a **synchronous** write usually already contains an async boundary (a `.then()` chain, a `setTimeout`, or an effect-local `run()`). Move the write across that boundary and the error clears — nothing else about the effect has to change.

```tsx
// BEFORE (flagged): sync write in the effect body
useEffect(() => {
  if (!ready) { if (stale) clearOutput(); return }   // ← sync write
  setProcessing(true)                                 // ← sync write
  const t = setTimeout(async () => { ... }, 300)
  return () => clearTimeout(t)
}, [deps])

// AFTER (clean): guard returns without writing; the two writes move into the callback
const visible = ready ? value : null                  // derive the emptied case instead of writing it

useEffect(() => {
  if (!ready) return
  const t = setTimeout(async () => {
    setProcessing(true)                               // ← now inside the callback, not sync
    ...
  }, 300)
  return () => clearTimeout(t)
}, [deps])
```

**Use for:** `app/admin/image-resize/use-image-resize.ts` (Step 11) and `lib/booking/store.ts`'s range effect (Phase 2, Step 2) — both already have the boundary; the write just moves across it.

**Do not reach for a state-shape rewrite.** An earlier draft of this plan collapsed `processing`/`blob`/`error` into one `{ key, ... }` object and derived each status. That is not needed for either file, it breaks `outputUrl`, and it forced changes to `rangeInfo` (`store.ts:234`) that the LIFF page consumes. The minimal move above is enough.

### S11 — render-phase dispatch

A component-scoped `dispatch` that setStates may be called **during render**; the rule only fires on effect bodies.

```tsx
if (service && !draft.date && !confirmed && dateOptions.length > 0 &&
    preselected !== service && (rangeStatus === 'ready' || rangeStatus === 'failed')) {
  setPreselected(service)
  dispatch({ type: 'date/set', date: firstBookable })
}
```

Probed: 0 errors. Two conditions are load-bearing:
- `preselected !== service` makes it fire **once per service** — `setPreselected(service)` fails that term on the next render, so the render-phase `dispatch` (which writes sessionStorage via `saveDraft`) runs exactly once.
- `(rangeStatus === 'ready' || 'failed')` stops it firing while the range is still loading, which would preselect today instead of the first bookable day.

**Use for:** `lib/booking/store.ts:204-216`'s preselect branch (Phase 2, Step 3).

### Rejected (probed, fails lint)

| Shape | Rule fired |
|---|---|
| `setState` directly in an effect body | `set-state-in-effect` |
| Sync `setState` before an `await` / `.then` | `set-state-in-effect` |
| Component-scoped `useCallback` fetcher called from an effect | `set-state-in-effect` |
| `useCallback` that setStates, invoked from an effect | `set-state-in-effect` |
| Writing **or** reading `ref.current` during render | `react-hooks/refs` |
| An effect whose early return writes state — **S3 must delete that write**, not just derive the read | `set-state-in-effect` |

**Passes lint but still banned on principle:** `void Promise.resolve().then(() => setX(1))` and `void Promise.resolve().then(() => dispatch(...))` from an effect body (both probed at 0 errors). Reject these — they defeat the rule instead of fixing the write.

### SOURCE refs (all verified present)

| Shape | SOURCE | Shows |
|---|---|---|
| S1 loader + guard | `components/forms/ThaiAddressCascade.tsx:88-104` | Effect-local async fn + `let cancelled` + `if (!cancelled) setX` |
| S1 promise form | `lib/booking/store.ts:101-130` then `:185-199` | An async loader, and a guarded `.then()` chain that sets state after `await` |
| S3 target idiom | `app/admin/friends/page.tsx:127-131` | `filteredFriends` derived during render |
| S3 offender | `app/admin/live-chat/_components/ConversationList.tsx:192-197` | The `if (!q) { setSearchResults([]); return }` this plan replaces |
| S4 offender | `components/ui/CalendarPickerTH.tsx:111-131` | The `prevValueRef` effect the rule rejects |
| S5 | `components/liff/booking/DateSection.tsx:80`, `lib/booking/store.ts:69` | Lazy initializers reading an external value once |
| S8 | `components/providers/ThemeProvider.tsx:33` | Existing `useSyncExternalStore` for a browser-only value |
| S10 | `lib/booking/store.ts:185-199` | A `.then()` chain with `if (cancelled) return` guards — the writes already live inside the async callback, which is why this effect's *only* violation is the sync `setRangeStatus('loading')` at :178 |
| S11 offender | `lib/booking/store.ts:204-216` | The preselect effect this shape replaces |

### Probing record

Every shape was verified two ways: `npx eslint` against the installed `eslint-plugin-react-hooks@7.1.1`, and — for the three places where a logic bug can hide behind a clean lint — an actual React 19 jsdom mount.

| Probe | Method | Result |
|---|---|---|
| S1–S11 as described | eslint on a throwaway file | 0 errors |
| S4 with a `ref.current` write inside the render block | eslint | 1 error `react-hooks/refs` — the reason S7 exists |
| Phase 2 Step 3 (render-phase `setPreselected` + `dispatch`) | eslint + mount incl. StrictMode | 0 errors; exactly **1** store write per service |
| Phase 2 Step 4 **with** a `cancelled` cleanup | mount, React 19 jsdom | **deadlock** — `status: 'loading'`, slots never arrive |
| Phase 2 Step 4 **without** `cancelled` (this plan) | mount | `status: 'ready'`, slots populated; reject path → `'failed'` + error message |
| Phase 2 Steps 2-4 together | eslint + `tsc --noEmit` | 0 errors, `tsc` clean |
| Phase 2 Step 4 deps **without** `store` | eslint | 1 missing-dependency warning (8 total) — `store` must be listed |
| Phase 2 Step 4 under StrictMode | mount | 2 requests on mount — **same as the current code** (`loadSlots` sets `'loading'` after its cache check), harmless via the key guard. Noted so it is not mistaken for a regression |
| Phase 2 Step 4 **failure** path | mount | `'failed'` + the Thai message; `rangeStatus` has no surviving reader |
| Step 9 fallback "move only `setLoading` to the callers" | eslint | **still fails** `set-state-in-effect` — five pre-`await` writes remain. Fallback deleted; the effect gets its own path |
| Step 11 catch **without** `setBlobKey(currentKey)` | mount | `processing` stays `true` forever after a failed resize — the spinner never clears. Fixed in the snippet |
| Step 11 `visible*` swap targets | reading `page.tsx` | `:42`,`:43` feed `sizeDelta`; `:150`,`:153` are the badge gate and text; `:270`,`:282` are the button guards — all six move to `visibleBlob` |
| Step 4 login — attempt 1: `rememberMe` as a read-only `useSyncExternalStore` | mount | checkbox could not be toggled — **rejected** |
| Step 4 login — attempt 2: `suppressHydrationWarning` on the Checkbox | mount | **ineffective** — the prop lands on the `<input>` (`Checkbox.tsx:31`), the mismatch is the `<svg>` in its `<label>`; error count identical with and without — **rejected** |
| Step 4 login — final (S8 for `isLocalhost`, real `useState` + post-hydration effect for `rememberMe`) | eslint | 0 errors, 0 warnings |
| Step 11 image-resize — attempt 1: move `setProcessing` into the `setTimeout` | mount | **300 ms hole** — buttons stay enabled against a stale blob while the UI shows the new dimensions; the downloaded filename mismatches the image — **rejected** |
| Step 11 image-resize — final: derive `processing` from `blobKey !== currentKey` | eslint + mount | 0 errors, 0 warnings; `processing` is `true` on the same render the dimensions change and `visibleBlob` is `null` in that same commit |
| `useOperatorRoster` AbortController variant of S1 | eslint | 0 errors |

Everything else was verified by reading the cited `file:line`s.

---

## Group map (script-verified against `npx eslint -f json`)

The old draft's claim that most files are "pure single-call-site fetchers" was **false** — verified by grepping each fetcher: most are reachable from at least one handler (e.g. `settings/n8n:89`, `users/[id]:144`, `CredentialForm:119/137/165`, `rich-menus/page:114/133`). Two exceptions exist where the fetcher really is effect-only (`components/admin/AssignModal.tsx`, `useOperatorRoster.ts`) — S1 works for both cases, so no `reloadKey` is needed and the old Phase 1/2 split is gone.

### Group A — fetcher shared by effect + handler (30 files, 42 errors)

| Errors | Lines | File |
|---|---|---|
| 3 | 154,158,162 | `app/admin/friends/history/page.tsx` |
| 3 | 51,66,240 | `components/admin/WalkinBookingDialog.tsx` |
| 3 | 178,208,223 | `lib/booking/store.ts` |
| 2 | 120,124 | `app/admin/friends/page.tsx` |
| 2 | 175,179 | `app/admin/requests/page.tsx` |
| 2 | 260,267 | `app/admin/rich-menus/new/page.tsx` |
| 2 | 18,70 | `app/liff/close-test/page.tsx` |
| 2 | 56,62 | `components/admin/AssignModal.tsx` |
| 2 | 85,109 | `components/forms/ThaiAddressCascade.tsx` |
| 1 | 159 | `app/admin/analytics/page.tsx` |
| 1 | 113 | `app/admin/audit/page.tsx` |
| 1 | 76 | `app/admin/auto-replies/[id]/page.tsx` |
| 1 | 126 | `app/admin/bookings/page.tsx` |
| 1 | 131 | `app/admin/chat-histories/[lineUserId]/page.tsx` |
| 1 | 153 | `app/admin/chat-histories/page.tsx` |
| 1 | 94 | `app/admin/chatbot/broadcast/[id]/page.tsx` |
| 1 | 106 | `app/admin/chatbot/broadcast/page.tsx` |
| 1 | 181 | `app/admin/files/page.tsx` |
| 1 | 190 | `app/admin/friends/[lineUserId]/page.tsx` |
| 1 | 141 | `app/admin/image-resize/use-image-resize.ts` |
| 1 | 195 | `app/admin/live-chat/_components/ConversationList.tsx` |
| 1 | 76 | `app/admin/live-chat/_hooks/useOperatorRoster.ts` |
| 1 | 49 | `app/admin/reply-objects/[object_id]/edit/page.tsx` |
| 1 | 252 | `app/admin/reports/page.tsx` |
| 1 | 390 | `app/admin/requests/[id]/page.tsx` |
| 1 | 113 | `app/admin/rich-menus/[id]/edit/page.tsx` |
| 1 | 129 | `app/admin/rich-menus/[id]/insights/page.tsx` |
| 1 | 74 | `app/admin/rich-menus/aliases/page.tsx` |
| 1 | 73 | `app/admin/rich-menus/page.tsx` |
| 1 | 167 | `app/admin/users/page.tsx` |

### Group B — settings + single-fetcher pages (9 files, 9 errors)

| Errors | Lines | File |
|---|---|---|
| 1 | 86 | `app/admin/settings/custom/page.tsx` |
| 1 | 76 | `app/admin/settings/line/page.tsx` |
| 1 | 74 | `app/admin/settings/n8n/page.tsx` |
| 1 | 80 | `app/admin/settings/page.tsx` |
| 1 | 65 | `app/admin/settings/telegram/page.tsx` |
| 1 | 119 | `app/admin/users/[id]/page.tsx` |
| 1 | 62 | `components/admin/CredentialForm.tsx` |
| 1 | 140 | `app/liff/debt-mediation/page.tsx` |
| 1 | 116 | `components/ui/CalendarPickerTH.tsx` |

### Group C — hydration guards and a declaration reorder (3 files, 3 errors)

| Errors | Lines | File | Shape |
|---|---|---|---|
| 1 | 84 | `components/ui/Toast.tsx` | S6 |
| 1 | 94 | `app/login/page.tsx` | S8 for `isLocalhost`; `rememberMe` keeps `useState`, seeded post-hydration |
| 1 | 75* | `app/liff/service-request/page.tsx` | S9 (`*` = `immutability`, not `set-state-in-effect`) |

**Totals:** 30 + 9 + 3 = **42 files** · 42 + 9 + 3 = **54 errors** · no duplicates · no ungrouped file.

### Per-file shape assignment (do not improvise)

Every flagged effect is one of two kinds. Classify it before editing:

| Kind | Test | Shape |
|---|---|---|
| **Fetch** | the effect calls something that hits the network | S1 (S2 if it also polls) |
| **Reset / mirror** | the effect only writes state from other state/props | S3, S4, S5, S6, S7, S9 |
| **Sync write, async boundary already present** | the effect already has a `.then()` / `setTimeout` / effect-local `run()` | S10 — move the write across the boundary |
| **Dispatch during render** | a component-scoped dispatch setStates and you need it at render time | S11 |

**Per-file shape assignment.** This table lists the **9 error sites in 7 files** that are *not* plain S1 fetches. Every other flagged effect in Group A is S1.

| File:line | Shape |
|---|---|
| `app/admin/requests/page.tsx:175` (`setPage(0)` on filter change) | S4 |
| `app/admin/friends/history/page.tsx:162` (`setPage(1)` on filter change) | S4 |
| `components/admin/AssignModal.tsx:62` (clear on close) | S4 |
| `app/admin/rich-menus/new/page.tsx:260` (mirror template on modal open) | S4 |
| `app/admin/rich-menus/new/page.tsx:267` (build actions from template) | S4 |
| `app/admin/live-chat/_components/ConversationList.tsx:195` (clear results) | S3 |
| `app/admin/auto-replies/[id]/page.tsx:76` (mirror category → form) | S4 |
| `components/forms/ThaiAddressCascade.tsx:85` (clear districts) | S3 |
| `components/forms/ThaiAddressCascade.tsx:109` (clear sub-districts) | S3 |

Two files appear in both categories — handle the non-fetch site in Step 10 and the fetch site in Step 9:
`app/admin/friends/history/page.tsx` (:154, :158 = S1, :162 = S4) and `app/admin/requests/page.tsx` (:179 = S1, :175 = S4).

---

## Phase 1 — upgrade + 40 files, 48 errors

**Branch:** `chore/next-16-4-3-cve` (exists; working tree already at `next@16.4.3` + `eslint-config-next@16.4.3`)

- [ ] **Step 1 — confirm the tree.** From `frontend/`: `node -e "const p=require('./package.json');console.log(p.dependencies.next, p.devDependencies['eslint-config-next'])"` must print `16.4.3 16.4.3`; if not, `npm pkg set devDependencies.eslint-config-next=16.4.3 && npm install` first.
  **VALIDATE:** output is exactly `16.4.3 16.4.3`.

- [ ] **Step 2 — record the baseline.** `cd frontend && npx eslint -f json > /d/genAI/jsk-app/.scratch/baseline.json` (~4 min).
  **VALIDATE:** the JSON totals exactly **54 errors / 42 files / 7 warnings**. Anything else means the tree moved — stop and re-measure.

- [ ] **Step 3 — `components/ui/Toast.tsx:84` (S6).** Delete the `mounted` state and its effect; replace `if (!mounted) return null` with `if (toasts.length === 0) return null`.
  **VALIDATE:** `npx eslint components/ui/Toast.tsx` → 0 errors · a toast raised on a page's first paint renders without an extra frame.

- [ ] **Step 4 — `app/login/page.tsx:92-103` (S8 for one, S5 for the other).** The effect writes two states: `setIsLocalhost` (94) and `setRememberMe(true)` (101). **They are not the same kind of value — fix them differently:**

  **`isLocalhost`** is derived and read-only (never toggled) → **S8**, no setter needed:
  ```tsx
  const isLocalhost = useSyncExternalStore(
    () => () => {},
    () => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    () => false,
  )
  ```

  **`rememberMe` is user-mutable** — the Checkbox calls `setRememberMe` at `:408`, and the submit path reads it at `:186`. **Do NOT replace it with a `useSyncExternalStore` snapshot**: a no-op subscribe never fires, so the checkbox could not be toggled and the remember-me write at `:187-189` would become unreachable. Keep real state, but **seed it in a post-hydration effect rather than a lazy initializer**:
  ```tsx
  const [rememberMe, setRememberMe] = useState(false)

  useEffect(() => {
    // Runs after hydration, so the server HTML and the client's first render agree.
    if (localStorage.getItem('jsk-remember-user')) setRememberMe(true)
  }, [])
  ```
  **Do not use `suppressHydrationWarning` here.** It was probed and is ineffective: `Checkbox` spreads `{...props}` onto its `<input>` (`components/ui/Checkbox.tsx:31`) while the mismatched node is the `<svg>` check icon inside the `<label>` (`:36-38`), so the prop never reaches it — the console error count is identical with and without it, and React regenerates the whole login subtree on the client.

  `setRememberMe` inside an effect body is a synchronous `setState`… but this effect runs **once on mount** and the flagged site is a different effect. To clear the rule cleanly, mount it the same way as S1: guard with a `cancelled` flag inside an effect-local `run()` — this effect has no state in its deps, so the S1 deadlock caveat does not apply. Probed: 0 errors, 0 warnings.

  Keep the `usernameInputRef.current.value = remembered` write in a small effect — a ref write in an effect is legal and sets no state.
  **VALIDATE:** `npx eslint app/login/page.tsx` → 0 errors, warnings stay 7 · `npx tsc --noEmit` → exit 0 · `npx vitest run app/login` → 3 pass · open `/login` with a saved user: the checkbox is ticked · click it: it unticks and the submit path honours the new value.

- [ ] **Step 5 — `app/liff/close-test/page.tsx` (S8 at :18, deferred call at :70).**
  - `:18` — `setUserAgent` feeds rendered output (`:92`). Use **S8**: `const userAgent = useSyncExternalStore(() => () => {}, () => navigator.userAgent, () => '')`.
  - `:70` — the countdown effect calls `handleClose()`, which setStates. Wrap it in `useCallback` **and add it to the effect's dep array** — otherwise `exhaustive-deps` emits a missing-dependency warning, taking warnings to 8 and breaking the gate (probed). Invoke it from `setTimeout(...)` inside the effect's `else` branch so no setState runs synchronously in the effect body.
  **VALIDATE:** `npx eslint app/liff/close-test/page.tsx` → 0 errors, **warnings still 7** · `npx tsc --noEmit` → exit 0.

- [ ] **Step 6 — `components/ui/CalendarPickerTH.tsx:116` (S4).** Replace the `prevValueRef` effect with prev-value **state**; keep the DOM-sync block (119-130) in its own effect with no state writes.
  **VALIDATE:** `npx eslint components/ui/CalendarPickerTH.tsx` → 0 errors · `npx vitest run components/ui/__tests__/CalendarPickerTH.test.tsx` → 16 pass.

- [ ] **Step 7 — `app/liff/service-request/page.tsx:75` (S9).** Move `INITIAL_FORM_DATA` (98) and the `formData` state (120) **above** the `useLocationCascade(...)` call (73). `fieldErrors` is already at line 57 — leave it.
  **VALIDATE:** `npx eslint app/liff/service-request/page.tsx` → 0 errors · `npx vitest run app/liff` → all pass.

- [ ] **Step 8 — Group B (S1, 8 files — `CalendarPickerTH` is S4 in Step 6).** The 8 files: `settings/custom`, `settings/line`, `settings/n8n`, `settings`, `settings/telegram`, `users/[id]`, `components/admin/CredentialForm`, `app/liff/debt-mediation`. For each: hoist the `useCallback` fetcher's body to a module-level `async function`; the effect calls it inside a guarded `run()`; delete the now-unused page-local `const API_BASE` and import the shared one if the hoisted fn needs it.

  **Handler call sites differ per file — update every one, or the old component-scoped fetcher is left dangling:**
  | File | Handler call sites |
  |---|---|
  | `settings/page.tsx` | `:99` `onClick={fetchOverview}` → `onClick={() => { void refresh() }}` |
  | `settings/line/page.tsx` | `:154` `await fetchSettings()` inside a save handler |
  | `settings/n8n/page.tsx` | `:89` `await fetchConfig()` inside a save handler |
  | `settings/telegram/page.tsx` | `:75` `await fetchConfig()` inside a save handler |
  | `settings/custom/page.tsx` | `:141`, `:163` `await fetchIntegrations()` inside save/delete handlers |
  | `users/[id]/page.tsx` | `:144` `fetchUser()` after save |
  | `components/admin/CredentialForm.tsx` | `:119`, `:137`, `:165` after create/update/delete |
  | `app/liff/debt-mediation/page.tsx` | `:396` `onClick={() => void loadProvinces()}` |

  **VALIDATE (per file):** `npx eslint <file>` → 0 errors · `grep -n 'fetch[A-Z]' <file>` shows no remaining reference to a deleted component-scoped fetcher.

- [ ] **Step 9 — Group A fetchers (S1, 23 files).** Group A has 30 files; 7 of them carry only non-fetch effects (Step 10). `friends/history` and `requests/page` appear in both steps — fix their fetch site here, their reset site in Step 10. Do the high-traffic ones first: `app/admin/audit/page.tsx`, `app/admin/rich-menus/page.tsx`, `app/admin/requests/page.tsx`.
  Note `app/admin/audit/page.tsx:169` is `onClick={fetchLogs}` → `onClick={() => { void refresh() }}`.

  **Enumerate each file's handler call sites before editing.** Unlike Step 8 there is no table here — grep for the fetcher name and record every call site that is not the declaration or the effect. Known sites worth checking (not exhaustive): `rich-menus/page.tsx:114,133`; `friends/page.tsx:221,246,277`; `bookings/page.tsx:317,561`; `requests/[id]/page.tsx:414`; `audit/page.tsx:355,366` (pagination).

  **⚠️ `app/admin/requests/page.tsx` cannot use the module-scope S1 shape, and there is no cheap fallback.** Read `:118-165` before touching it. `fetchRequests` performs **five** synchronous writes before its first `await` — `setDateRangeError(msg)` + `setLoading(false)` in the validation branch (`:124-128`), then `setDateRangeError(null)` + `setLoading(true)` + `setFetchError(null)` (`:129-131`) — and owns an `AbortController` (`:119-121`) plus a `seqRef` supersede guard (`:122-123`, `:163`). Hoisting it to module scope would have to carry five setters and two refs across the boundary; moving "just `setLoading`" into the callers does **not** clear the error (probed: `set-state-in-effect` still fires on the remaining writes).

  **Do this instead — keep `fetchRequests` untouched and give the effect its own path:**
  ```tsx
  useEffect(() => {
    if (filter.startDate && filter.endDate && filter.startDate > filter.endDate) return
    let cancelled = false
    const run = async () => {
      // Same request the fetcher makes. Keep the refs and the seq comparison.
      const seq = ++seqRef.current
      try {
        const res = await fetch(/* the same URL the fetcher builds */, {
          headers: /* the same */,
          signal: abortRef.current?.signal,
        })
        if (cancelled || seq !== seqRef.current) return
        // ...the same setRequests/setTotal/setTotalPages the fetcher does...
      } catch (err) {
        if (cancelled || seq !== seqRef.current) return
        logger.error('Failed to fetch requests:', err)
        // ...the same setFetchError...
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [/* the same deps fetchRequests closes over */])
  ```
  The duplication is the price of clearing the rule without touching the handler path. **Do not** "simplify" it by deleting the seq guard or the abort — those protect against out-of-order responses, and `tsc` cannot see their absence.

  **`app/admin/live-chat/_hooks/useOperatorRoster.ts` needs care.** Its fetcher takes an `AbortSignal` and aborts on close (`:50-78`, `AbortController` at :75, `AbortError` branch at :62). A mechanical S1 (a `cancelled` flag, no signal) silently drops abort-on-close and leaves the `AbortError` branch dead. Keep the `controller`/`signal` plumbing: pass `controller.signal` into the module-level fetcher and keep `return () => controller.abort()`.
  **VALIDATE (per file):** `npx eslint <file>` → 0 errors (for `friends/history` and `requests/page`, expect only their Step-10 site left) · after every 5 files, `npx tsc --noEmit` → exit 0. `tsc` catches a deleted-but-still-referenced fetcher; it does **not** catch a handler left calling a stale wrapper, so grep after each file.

- [ ] **Step 10 — Group A non-fetch effects (S3/S4 — 9 sites in 7 files).** The table above. `ThaiAddressCascade.tsx:85,109` needs S3 **including deleting the early-return `setDistricts([])` / `setSubDistricts([])`**; without that deletion the error stays.

  **`ThaiAddressCascade` also needs every read swapped to the derived value.** The file reads `districts` at `:61` (find the selected district for the label), `:136` (the `onChange` lookup), and `:179` (the `<option>` list). After S3 those must read the derived array, not the raw state, or clearing the province leaves the old options visible. Same for `subDistricts`.
  **VALIDATE (per file):** `npx eslint <file>` → 0 errors · for `ThaiAddressCascade`: select a province → districts appear; clear the province → the district select **and** its option list both empty.

- [ ] **Step 11 — `app/admin/image-resize/use-image-resize.ts:139-168` (S10).** Two sync writes are flagged: `clearOutput()` at `:141` and `setProcessing(true)` / `setError(null)` at `:145-146`.

  **⚠️ Do not simply move `setProcessing` into the `setTimeout`.** That was tried and a mount probe showed it opens a **300 ms window where Download/Upload stay enabled against a stale blob**: after changing width 100→200 the UI shows `200×200` (from `parsedWidth`) beside a `100×100` blob, and `downloadOutput`/`uploadToMedia` name the file `..._resized_200x200.png` for a 100×100 image (`use-image-resize.ts:183`, `:213`). The current code disables the buttons synchronously via `setProcessing(true)`; moving that write across the debounce loses that guarantee.

  **Correct shape — derive `processing` from "which inputs the current blob was built for":**
  ```tsx
  const [blobKey, setBlobKey] = useState<string | null>(null)   // new state, alongside outputBlob

  const ready = Boolean(sourceFile && parsedWidth && parsedHeight)
  const currentKey = ready ? `${parsedWidth}x${parsedHeight}|${format}|${quality}` : null

  // DERIVED — busy the instant the inputs stop matching the blob
  const processing = ready && blobKey !== currentKey

  // DERIVED — never render a blob built for different inputs
  const visibleBlob  = ready && blobKey === currentKey ? outputBlob : null
  const visibleUrl   = ready && blobKey === currentKey ? outputUrl  : null
  const visibleError = ready ? error : null

  useEffect(() => {
    if (!currentKey || !sourceFile || !parsedWidth || !parsedHeight) return
    const gen = ++generationRef.current
    const timer = setTimeout(async () => {
      try {
        const blob = await resizeImage(sourceFile, parsedWidth, parsedHeight, format, quality)
        if (generationRef.current !== gen) return
        // ...revoke old url, create new url as today...
        setOutputBlob(blob)
        setOutputUrl(url)
        setBlobKey(currentKey)      // ← records what this blob is for
        setError(null)
      } catch (err) {
        if (generationRef.current !== gen) return
        setOutputBlob(null)
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ')
        setBlobKey(currentKey)   // ← mark the attempt as SETTLED, or `processing` stays true forever
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [currentKey, format, parsedHeight, parsedWidth, quality, sourceFile])
  ```
  `processing` flips to `true` **synchronously on the render where the inputs change** — no 300 ms hole — and `visibleBlob` goes `null` in the same commit, so the buttons disable and the stale preview disappears together.

  **Mount-probed (React 19 jsdom):** after `setTargetWidth('200')`, `parsedWidth=200`, `processing=**true**`, `visibleBlob=**null**`; once the debounce resolves, `processing=false`. Lint: **0 errors, 0 warnings.**

  **What must NOT change:**
  - `outputUrl` (:36), `outputUrlRef` (:43) and their revoke sites — untouched
  - `clearOutput` (:48-58) keeps its URL revocation; add `setBlobKey(null)` to it
  - `clearOutput`'s user-initiated call sites (`:80` in `selectFile`, `:94`) stay
  - the `:170-177` unmount cleanup effect stays
  - **Return `visibleBlob`, and swap the `page.tsx` reads in this exact pattern.** There are six `r.outputBlob` reads and they do not all play the same role:
    | Line | What it does | Change to |
    |---|---|---|
    | `:42`, `:43` | compute `sizeDelta` — `(1 - outputBlob.size / sourceFile.size)` | **`visibleBlob`** — otherwise the badge compares a hidden blob against the source while labelling the visible one |
    | `:150`, `:153` | the badge row's gate (`{r.outputBlob && (`) and the size badge text | **`visibleBlob`** — otherwise the badge row disappears the moment a stale blob is hidden, taking the parsed-dimension badge with it |
    | `:270` | `disabled={!r.outputBlob \|\| r.processing}` on **Download** | **`visibleBlob`** |
    | `:282` | same guard on **Upload** | **`visibleBlob`** |

    Leave the hook-internal `downloadOutput` (`:181`) and `uploadToMedia` (`:210`) guards on the raw `outputBlob` — they run from handlers, after the user has seen a settled result.

  **3. Delete the `// eslint-disable-line` at `:168`.** `eslint --print-config` reports `linterOptions.reportUnusedDisableDirectives: 1`, so once the deps array is complete the directive is "unused" and emits a warning.

  **VALIDATE:** `npx eslint app/admin/image-resize/use-image-resize.ts` → 0 errors, warnings stay 7 · `npx tsc --noEmit` → exit 0 · `npx vitest run app/admin/image-resize` → 15 pass · upload an image: spinner, then preview, **Download/Upload enabled** · **change the target width: both buttons disable and the preview disappears immediately, and the filename matches the new dimensions only after the new preview appears** · blank the width: preview disappears, buttons disabled · invalid file: Thai error shows

- [ ] **Step 12 — `app/admin/analytics/page.tsx:159` (S2).** `fetchData` polls every 30 s, backs the refresh button at `:210`, and is bound to `days` / `selectedOperator`. Module-level `loadAnalytics(days, operator)`, effect-local guarded `run()`, `reloadKey` bumped by the interval **and** the button.
  **VALIDATE:** `npx eslint app/admin/analytics/page.tsx` → 0 errors · with the socket disconnected, a second data update at 30 s · pressing refresh updates immediately.

- [ ] **Step 13 — loading-initial flips.** `app/admin/audit/page.tsx:59`, `app/admin/analytics/page.tsx:94`, `app/admin/reports/page.tsx:199`, `components/admin/AssignModal.tsx:33`, `app/admin/live-chat/_hooks/useOperatorRoster.ts:47` — change `useState(false)` → `useState(true)` (required by S1, and already listed in the UX table).
  **VALIDATE:** `npx tsc --noEmit` → exit 0 · each page shows a spinner on first paint instead of empty content.

- [ ] **Step 14 — gates.**
  ```
  cd frontend && npx tsc --noEmit          # exit 0
  cd frontend && npx eslint               # 6 errors remain (Phase 2 only), 7 warnings, 0 from Phase 1 files
  cd frontend && npm run build             # ✓ Compiled successfully
  cd frontend && npm audit --omit=dev      # 0 critical, 3 high
  ```
  `npm run build` rewrites `frontend/next-env.d.ts` — `git checkout -- frontend/next-env.d.ts` afterwards; never stage it.

- [ ] **Step 15 — tests, unmodified.**
  ```
  cd frontend && npx vitest run components/ui/__tests__/CalendarPickerTH.test.tsx
  cd frontend && npx vitest run app/login
  cd frontend && npx vitest run app/liff
  cd frontend && npx vitest run app/admin/image-resize
  cd frontend && npx vitest run app/admin/live-chat
  cd frontend && npx vitest run app/admin/bookings
  cd frontend && npx vitest run app/admin/requests
  cd frontend && npx vitest run app/admin/rich-menus
  ```
  **VALIDATE:** all pass; `git status --short` shows no modified test file.

  **What these suites do and do not cover.** They are the safety net, not a guarantee:
  - `app/admin/live-chat` matches the nested `_components/`, `_context/`, `_hooks/`, `_store/` suites — there is **no test for `useOperatorRoster` itself**, and that hook is the one Step 9 changes behaviour in (it must keep its `AbortController`). Verify its abort-on-close by hand: open the transfer picker, close it immediately, confirm no state update lands.
  - `app/admin/image-resize` (15) covers the pure helpers, not the debounce; the Step 11 VALIDATE covers the rest by hand.
  - `app/liff/booking` (57) **does** mount the store and assert slot buttons — it is the primary signal for Phase 2 Step 4.

- [ ] **Step 16 — commit and open PR 1.** Stage **files individually** — never a directory.
  ```
  git add frontend/package.json frontend/package-lock.json
  git add frontend/components/ui/Toast.tsx frontend/components/ui/CalendarPickerTH.tsx
  git add frontend/components/forms/ThaiAddressCascade.tsx
  git add frontend/components/admin/AssignModal.tsx frontend/components/admin/CredentialForm.tsx
  git add frontend/app/login/page.tsx
  git add frontend/app/liff/close-test/page.tsx frontend/app/liff/service-request/page.tsx
  git add frontend/app/liff/debt-mediation/page.tsx
  git add frontend/app/admin/image-resize/use-image-resize.ts
  git add frontend/app/admin/live-chat/_components/ConversationList.tsx
  git add frontend/app/admin/live-chat/_hooks/useOperatorRoster.ts
  git add 'frontend/app/admin/auto-replies/[id]/page.tsx'
  git add 'frontend/app/admin/reply-objects/[object_id]/edit/page.tsx'
  git add 'frontend/app/admin/chat-histories/[lineUserId]/page.tsx'
  git add 'frontend/app/admin/chatbot/broadcast/[id]/page.tsx'
  git add 'frontend/app/admin/rich-menus/[id]/edit/page.tsx'
  git add 'frontend/app/admin/rich-menus/[id]/insights/page.tsx'
  git add 'frontend/app/admin/rich-menus/new/page.tsx'
  git add 'frontend/app/admin/users/[id]/page.tsx'
  git add 'frontend/app/admin/requests/[id]/page.tsx'
  git add 'frontend/app/admin/friends/[lineUserId]/page.tsx'
  git add frontend/app/admin/analytics/page.tsx frontend/app/admin/audit/page.tsx
  git add frontend/app/admin/bookings/page.tsx frontend/app/admin/chat-histories/page.tsx
  git add frontend/app/admin/chatbot/broadcast/page.tsx frontend/app/admin/files/page.tsx
  git add frontend/app/admin/friends/page.tsx frontend/app/admin/friends/history/page.tsx
  git add frontend/app/admin/reports/page.tsx frontend/app/admin/requests/page.tsx
  git add frontend/app/admin/rich-menus/page.tsx frontend/app/admin/rich-menus/aliases/page.tsx
  git add frontend/app/admin/users/page.tsx
  git add frontend/app/admin/settings/page.tsx frontend/app/admin/settings/line/page.tsx
  git add frontend/app/admin/settings/n8n/page.tsx frontend/app/admin/settings/telegram/page.tsx
  git add frontend/app/admin/settings/custom/page.tsx
  git commit -m "fix(deps): upgrade next + eslint-config-next to 16.4.3, fix 48 react-hooks sites"
  ```
  PR body must state **6 errors remain** (`components/admin/WalkinBookingDialog.tsx` ×3, `lib/booking/store.ts` ×3) and name them.

- [ ] **Step 17 — watch CD.** After merge, confirm `Deploy Frontend (Vercel)` ran (not skipped) and the build log has no `outputFileTracingRoot` warning.

---

## Phase 2 — booking flow (2 files, 6 errors)

**Branch:** `chore/react-hooks-booking-flow` off `main` after PR 1 merges.

- [ ] **Step 1 — `components/admin/WalkinBookingDialog.tsx` (S4 + S7 + S3).**
  - `:51-62` — resets **9** states (`setService`, `setDate`, `setSlots`, `setSlotTime`, `setName`, `setPhone`, `setNote`, `setEmail`, `setError`) **and** writes `idempotencyKey.current` (59). The effect's deps are `[open, initialDate]` (`:62`) — the S4 prev-state must key on **both**, or changing `initialDate` while open would no longer reset the form. Split it: **S4** for all 9 state writes; **S7** for the ref (`useEffect(() => { if (open) idempotencyKey.current = crypto.randomUUID() }, [open])`). The ref is read only at `:114` in `handleSave`, never in render, so S7 is legal. Do **not** put the ref write inside the S4 block (`react-hooks/refs`). Missing any one of the 9 states leaves a second flagged `setState`.
  - `:66` — `setSlots([])` when the dialog is not ready. **S3**: `const visibleSlots = open && service && date ? slots : []`, and **replace every read of `slots` with `visibleSlots`** at the places the component renders them (`:90` `slotOptions`, `:163`) — otherwise the derived value is dead code and the stale slots still show.
  - `:240-245` — `EditContactDialog`'s mirror of `booking` into 4 fields **plus `setError(null)` at :244** (5 writes, not 4). **S4** with a prev-`booking` state; missing the `setError` leaves a second flagged `setState`.
  **VALIDATE:** `npx eslint components/admin/WalkinBookingDialog.tsx` → 0 errors · `npx vitest run app/admin/bookings` → all pass · manually open/close: form resets, slots clear.

- [ ] **Step 2 — `lib/booking/store.ts:175-200` (range effect).** Two changes only:
  1. Delete `setRangeStatus('loading')` at :178. Nothing replaces it. **Why this is safe:** `rangeStatus`'s only reader is `store.ts:206` — inside the preselect effect that Step 3 deletes. After Step 3 there is no consumer at all (`app/liff/booking/page.tsx:381` reads `rangeInfo`, not `rangeStatus`), so the value is write-only and the deletion cannot change anything observable. Verify with `grep -n rangeStatus lib/booking/store.ts app/liff/booking/page.tsx` before and after.
  2. The remaining writes are already inside the existing `.then()`/`.catch()`, so they are not flagged. Leave them there.

  ```tsx
  useEffect(() => {
    if (!idToken || !service || confirmed || dateOptions.length === 0) return
    let cancelled = false
    const clipped = clipRangeWindow(dateOptions, options?.max_range_days)
    const last = clipped[clipped.length - 1] ?? dateOptions[0]
    void fetchAvailabilityRange(idToken, service, dateOptions[0], last)
      .then((range) => {
        if (cancelled) return
        setRangeByDate(new Map(range.days.map((day) => [day.date, day])))
        setRangeStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        logger.error('Failed to load availability range:', err)
        setRangeByDate(null)
        setRangeStatus('failed')
      })
    return () => { cancelled = true }
  }, [confirmed, dateOptions, idToken, options, service])
  ```

  **No other change to this effect.** `rangeByDate` stays as it is (`rangeInfo: rangeByDate` at :234 keeps working), `dispatch` is untouched, and there is no derived status.
  **VALIDATE:** `npx eslint lib/booking/store.ts` → 2 errors remain (from 3) · `npx tsc --noEmit` → exit 0.

- [ ] **Step 3 — `lib/booking/store.ts:204-216` (preselect effect → render-phase).** Delete the effect and move its pure decision into render. The `preselected === service` term makes it fire once per service; `setPreselected(service)` makes that term false on the next render, so the render-phase `dispatch` runs exactly once.

  ```tsx
  const firstBookable = (() => {
    if (!service || draft.date || confirmed || dateOptions.length === 0) return null
    if (rangeStatus !== 'ready' && rangeStatus !== 'failed') return null
    if (preselected === service) return null
    const pick = dateOptions.find((iso) => {
      const info = rangeByDate?.get(iso)
      return Boolean(info?.is_open && info.remaining > 0)
    })
    return pick ?? dateOptions[0]
  })()

  if (firstBookable && service) {
    setPreselected(service)
    dispatch({ type: 'date/set', date: firstBookable })
  }
  ```

  **Two details that matter:**
  - `firstBookable` must be `string`, not `string | undefined` — `DraftAction['date/set']` requires `string | null` (`lib/booking/draft.ts:33`); the `?? dateOptions[0]` fallback (original :213) guarantees it.
  - The old effect's `void loadSlots(service, target)` (:215) is **deleted**, not moved — Step 4's effect already loads slots whenever `draft.date` and `slotsStatus === 'idle'`, which is exactly the state this preselect creates.

  Probed: 0 errors.
  **VALIDATE:** `npx eslint lib/booking/store.ts` → 1 error remains · `npx tsc --noEmit` → exit 0 · open `/liff/booking`: the nearest bookable day preselects once, and slots load for it.

- [ ] **Step 4 — `lib/booking/store.ts:220-225` (cold-open slots effect).** The last flagged effect, and the only one that needs new code. `loadSlots` is a component-scoped `useCallback` that setStates, so calling it from an effect body is what the rule rejects. Inline the same work in an effect-local guarded run:

  ```tsx
  useEffect(() => {
    if (!idToken || !options || confirmed) return
    if (!service || !draft.date || slotsStatus !== 'idle') return
    // Hoist to consts: `service` / `draft.date` are narrowed above but WIDEN back to
    // `string | null` inside the async closure. Without this, tsc fails TS2345.
    const svc = service
    const day = draft.date
    const key = `${svc}|${day}`
    latestSlotKeyRef.current = key
    const run = async () => {
      setSlotsStatus('loading')      // keeps loadingSlots (store.ts:233) → spinner (page.tsx:737)
      setError(null)
      try {
        const loaded = await fetchAvailability(idToken, svc, day)
        // NO `cancelled` flag here — see the deadlock note below.
        if (latestSlotKeyRef.current !== key) return   // newest-request-wins (store.ts:119,124)
        store.setSlots(key, loaded)
        setSlots(loaded)
        setSlotsStatus('ready')
      } catch (err) {
        logger.error('Failed to load availability:', err)
        if (latestSlotKeyRef.current !== key) return
        setError(err instanceof Error ? err.message : 'โหลดช่วงเวลาไม่สำเร็จ')
        setSlots(null)
        setSlotsStatus('failed')
      }
    }
    void run()
  }, [confirmed, draft.date, idToken, options, service, slotsStatus, store])
  ```

  **⚠️ There is NO cleanup / `cancelled` flag in this effect, and that is deliberate.**
  The body writes `setSlotsStatus('loading')`, and `slotsStatus` is in the deps array — so setting it **re-runs the effect**. If a `cancelled` flag were set by a cleanup function, the cleanup would fire on that re-run and the in-flight `run()` would hit `if (cancelled) return` and **discard the loaded Availability**. The grid would never appear and the Thai error would never show: a permanent spinner.

  A runtime probe (React 19, jsdom) of both variants:
  | Variant | After the fetch resolves |
  |---|---|
  | with `cancelled` + cleanup | `status: "loading"`, `slots: null` ← **deadlock** |
  | without `cancelled`, key guard only | `status: "ready"`, slots populated |

  The `latestSlotKeyRef` comparison already gives newest-request-wins, so the `cancelled` flag is redundant *and* harmful here. Lint does not catch this — it is a logic defect, not a rule violation. StrictMode is on (`next.config.js:3`), so it ships.

  **Preserved deliberately — reviewers verified each of these must not change:**
  - `fetchAvailability` returns `Promise<Availability>` (`lib/booking.ts:231-242`) and `slots` state is `Availability | null` (`store.ts:74`). Pass it through **unwrapped** — do not retype it.
  - `setSlotsStatus('loading')` and `setError(...)` are inside the async `run()`, not synchronous in the effect body. That is what makes them legal (probed).
  - `latestSlotKeyRef` (`store.ts:83`, used at :105/:119/:124) is the newest-request-wins guard. Dropping it reintroduces a stale-response race.
  - `store.setSlots(key, loaded)` is the cache write. It stays.
  - **`loadSlots` itself (`:101-130`) is unchanged.** The UI still calls it from handlers (`app/liff/booking/page.tsx:394,448`). Only its *effect* call site is replaced.
  - `rangeInfo: rangeByDate` (`:234`) and the whole `BookingStore` interface (`:28-39`) are untouched.
  - `dispatch` (`:85-99`) is **not modified** — its `setSlotsStatus`/`setRangeStatus` writes run in event handlers, not effects, so the rule never flagged them.

  **Deps array — use exactly this:** `[confirmed, draft.date, idToken, options, service, slotsStatus, store]`. Both `service` (the body reads the alias) and `store` are required: omitting either emits a `react-hooks/exhaustive-deps` warning, taking the total to 8 and failing the gate (probed against the installed ESLint 9 / react-hooks 7.1.1). `store` is a stable `useState` accessor (`store.ts:69`), so listing it does not re-run the effect.

  **StrictMode note — this is not a regression.** `next.config.js:3` sets `reactStrictMode: true`, and a mount probe of the plan's exact effect fires `fetchAvailability` **twice** on mount. The current code does the same: `loadSlots` sets `slotsStatus('loading')` only *after* its cache check and *before* the `await` (`store.ts:114`), so under StrictMode's double-invoke the second call also passes the `slotsStatus === 'idle'` guard (`:222`) and requests again. The `latestSlotKeyRef` comparison (`:119`) makes the duplicate harmless in both versions. **Do not** try to dedupe it with a ref in the effect body — that would be a new behaviour, and this plan is behaviour-preserving.

  **VALIDATE:** `npx eslint lib/booking/store.ts` → 0 errors, **warnings still 7** · `npx tsc --noEmit` → exit 0 · `npx vitest run app/liff` → all pass — **`app/liff/booking/__tests__/page.test.tsx` mounts this store and asserts slot buttons, so it catches the deadlock; treat a failure there as the primary signal, not the manual checks** · then by hand: cold-open a saved draft, spinner → slots appear; switch dates rapidly, last click wins; force a 500 on `/availability`, the Thai error appears.

- [ ] **Step 5 — gates.** `npx tsc --noEmit` exit 0 · `npx eslint` → **0 errors, 7 warnings** · `npm run build` success.

- [ ] **Step 6 — tests, unmodified.** `npx vitest run app/liff` · `npx vitest run app/admin/bookings`.

- [ ] **Step 7 — open PR 2.** Body lists the 6 changed sites with their shape IDs and states that the LIFF booking flow is the riskiest surface.

---

## Testing strategy

No new test files. Verification is **lint-as-test**, with one correction that matters:

> **Gate per effect, not per reported line.** The rule reports only the **first** sync `setState` per effect. Re-run eslint on the file after every fix; if an error reappears elsewhere in the same effect, that effect had multiple writes (probed: `login/page.tsx` had 94 and 101; `image-resize` had 141 then 145/146).

| Shape | Input | Expected |
|---|---|---|
| S1 | Fetcher shared by effect + handler | 0 errors; one request on mount; the handler issues exactly one more; a thrown loader still shows the Thai error |
| S2 | Polling + manual refresh | 0 errors; interval and button both update |
| S3 | Effect clearing state on a falsy input | 0 errors; the emptied value is visible on the same render as the input change |
| S4 | Prop mirror / reset-on-change | 0 errors; changing the prop resets the field exactly once |
| S5 | Browser read, not server-rendered | 0 errors; no hydration warning |
| S6 | Toast | 0 errors; toast appears immediately; nothing renders when empty |
| S7 | Ref tied to a prop | 0 errors; ref is fresh per open, read only in handlers |
| S8 | Browser read that IS rendered | 0 errors; no hydration mismatch |
| S9 | Use-before-declare | 0 errors; no `ReferenceError` |
| S10 | Sync write inside an effect that already has an async boundary | 0 errors; the derived `visible*` values clear when inputs disappear, and the callback still sets its state |
| S11 | Dispatch at render | 0 errors; preselect happens once per service, never while the range is loading |

### Per-file edge-case checklist

- [ ] Unmount mid-fetch sets no state (guard checked after **every** `await`)
- [ ] `loading` starts `true` on fetch pages — no flash of empty content
- [ ] Error path still sets the same state and the same Thai message
- [ ] Every handler call site of the loader still fires exactly one request
- [ ] Re-running `npx eslint <file>` after the first fix is clean (multi-`setState` effects)
- [ ] No unused `eslint-disable` directive left behind
- [ ] Warnings still total **7**

## Verification matrix

| Check | Phase 1 | Phase 2 | Command (from `frontend/`) |
|---|---|---|---|
| TypeScript | exit 0 | exit 0 | `npx tsc --noEmit` |
| Lint errors | **6** (booking pair only) | **0** | `npx eslint` |
| Lint warnings | 7 | 7 | `npx eslint` |
| Build | passes | passes | `npm run build` |
| Unit tests | 8 commands (~35 test files) | 2 commands | `npx vitest run <path>` |
| Production audit | 0 critical | 0 critical | `npm audit --omit=dev` |
| Playwright smoke | CI | CI | `gh pr checks` |
| CD deploy | frontend job runs | same | `gh run view <id> --json jobs` |

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| **An effect holds several sync `setState`s; fixing one moves the error to the next** | Re-lint per file after every fix (Step 8/9 VALIDATE). Probed on `login` and `image-resize` |
| **`react-hooks/refs` when a ref write lands in render** | S7 keeps ref writes in effects; probed — writing *or reading* `ref.current` in render is an error |
| `store.ts` regression breaks the LIFF booking flow | Own PR; all three Phase 2 shapes probed clean; `liff/booking` + `walkin.test.tsx` gate it; `loadSlots`, `rangeInfo`, `dispatch` and the `BookingStore` interface are all explicitly untouched |
| **A `cancelled` flag in an effect whose own body changes a dep causes a self-cancelling deadlock** — the effect re-runs, the cleanup fires, and the successful response is discarded | Phase 2 Step 4 has **no** cleanup function; `latestSlotKeyRef` alone provides newest-request-wins. Verified by a React 19 jsdom mount probe: with `cancelled` → `status: 'loading'`, `slots: null` forever; without it → `status: 'ready'`. Lint cannot catch this class |
| Missing-dependency warnings push the total past 7 | Every step's VALIDATE names "warnings still 7". Two known traps: dropping a `service` alias from the slots deps, and `handleClose` in the close-test deps |
| Deriving a value that users can still toggle (login `rememberMe`) silently disables the control | `rememberMe` keeps real `useState`; only `isLocalhost` is derived. Documented in Step 4 |
| Removing `setRangeStatus('loading')` changes a status transition | It cannot — after Step 3 deletes the preselect effect, `rangeStatus` has no reader anywhere (`page.tsx:381` reads `rangeInfo`). Confirm with `grep -n rangeStatus` across `lib/booking` and `app/liff` |
| Analytics polling or refresh silently stops | Both drive one `reloadKey`; verify a 30 s update with the socket disconnected and an immediate update on the button |
| Hydration mismatch on `login` / `close-test` | `close-test` uses S8 (read-only value, no mismatch). `login`'s `isLocalhost` uses S8; `rememberMe` keeps real state seeded in a post-hydration effect. **`suppressHydrationWarning` is rejected — probed ineffective** (the prop lands on Checkbox's `<input>` while the mismatch is the `<svg>` in its `<label>`) |
| First paint changes on 5 pages (loading false→true) | Declared in the UX table; Step 13; verify each page shows a spinner instead of empty content |
| **Step 11 opens a window where Download/Upload act on a stale blob** | Avoided by deriving `processing` from `blobKey !== currentKey` rather than moving `setProcessing` across the debounce — mount-probed: the buttons disable on the same render the dimensions change |
| Step 9's 23 files may carry state the module-scope S1 shape cannot hold (AbortController / seq guards) | Step 9 names the known ones (`useOperatorRoster`, and the handler sites in the note); `tsc` plus each file's own lint gate surface the rest. If a file has a race guard, keep it — pass the `signal` into the module fetcher |
| `npm run build` dirties `next-env.d.ts` | `git checkout -- frontend/next-env.d.ts` after every build; never stage it |
| Unused `eslint-disable` after the image-resize fix | Step 11 removes it; checklist item covers the rest |
| PR 1 staging sweeps unrelated work | Every `git add` names a file; no directory adds |
| PRD and plan drift on shape IDs or phase counts | The plan is normative (stated in the shape table); the alignment section at the end is checked before PR 1 opens |

## Rollback

Two PRs, two reverts. Reverting Phase 2 restores only the booking flow. Reverting Phase 1 restores `next@16.1.1` and its 3 critical advisories — last resort, require a recorded reason.

## PRD alignment (updated 2026-11-03)

The PRD was rewritten to match this plan's two-phase split and its S1–S11 shape IDs, and its outdated risk rows were replaced. **Re-read the PRD before opening PR 1** — the checklist below is what must be true, not a claim that it already is:

- [ ] `prd` § Solution describes **two** phases — Phase 1 = upgrade + 40 files/48 errors, Phase 2 = booking flow 2 files/6 errors. The retracted 29/33 + 11/15 split is recorded there as a measured-false premise.
- [ ] `prd` D2 carries the S1–S11 table and marks the plan as the normative source for shape definitions.
- [ ] `prd` § Risks contains the multi-`setState`-per-effect caveat and the `loading` false→true first-paint row.
- [ ] `prd` § Risks contains the `cancelled`-self-cancel row, and **no row** still describes a derived `rangeStatus` (that design was dropped).
- [ ] `prd` § Risks' analytics row says both the interval and the manual refresh bump one `reloadKey` (not "its own effect").
- [ ] `prd` Open Questions item 1 says **two** PRs, not three.
- [ ] Success Criterion 6 says "each phase is a separate PR" — true for two phases.
- [ ] `prd:3` = APPROVED · Non-Goals narrow `useSyncExternalStore` to "not for data fetching" · Open Questions struck through · 3 production highs recorded.

If any box is unchecked, fix the PRD in the same docs-only commit as PR 1.
