# Code evidence: A11Y-01 / A11Y-02 / NET-01

Source files read directly. No prod code changed. Line numbers from current checkout.

## A11Y-01: mobile sidebar drawer — verdict CONFIRMED

Hidden drawer uses off-canvas translate, not removal from the tab order.

`frontend/app/admin/layout.tsx:303`
```
isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
```

No `inert`, no `aria-hidden`, no focus trap, no focus restore. Grep of `layout.tsx` for `keydown`, `Escape`, `inert`, `trap`, `useRef` returns nothing except the unrelated resize listener. Close paths found:

`frontend/app/admin/layout.tsx:310`
```
onClick={() => setIsMobileMenuOpen(false)}
```
(close button), overlay click at ~469 `onClick={() => setIsMobileMenuOpen(false)}`, and route-change effect at ~200 `setIsMobileMenuOpen(false)` on `pathname`. No Escape handler anywhere in the file.

So the audit concern holds at code level. A keyboard user can Tab into the off-canvas sidebar, and Escape does not close it. Browser step still useful to record the Tab sequence on video, but the defect does not need the browser to confirm.

## A11Y-02: SessionTimeoutWarning dialog semantics — verdict CONFIRMED; live-chat exclusion REFUTED

`frontend/components/admin/SessionTimeoutWarning.tsx:17`
```
if (!showWarning) return null;
```
`SessionTimeoutWarning.tsx:20`
```
<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
```
No `role="dialog"`, no `aria-modal`, no `aria-labelledby`. The heading exists but is unlinked:

`SessionTimeoutWarning.tsx:26-28`
```
<h2 className="text-lg font-semibold text-slate-800">
  Session Expiring Soon
</h2>
```

No focus handling. Component has no `autoFocus`, no `useEffect` focus move, no Escape handler. `useSessionTimeout` only runs inactivity/countdown timers and exposes `showWarning`, `remainingTime`, `extendSession`. A screen reader gets no dialog announcement, and focus stays where it was.

Live-chat exclusion: the mount at `layout.tsx:476` (`<SessionTimeoutWarning />`) is only reached past the early return at `layout.tsx:275` (`if (isLiveChat) { return <>{children}</>; }`). So `/admin/live-chat` never mounts the warning. The leak concern is refuted. The semantics concern stands.

## NET-01: requests page stale-response race — verdict CONFIRMED

`frontend/app/admin/requests/page.tsx:116-156`: `fetchRequests` builds the query and calls `apiFetch` with no abort signal and no request id. Grep for `AbortController`, `signal`, `requestId`, `seq`, `cancelled` in the page returns nothing.

```
query.append('skip', String(page * PAGE_LIMIT));
...
const result = await apiFetch<ServiceRequest[]>(`/admin/requests?${query.toString()}`);
```

Effects at `page.tsx:158-171`:

```
useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); }, 500);
    return () => clearTimeout(timer);
}, [search]);

useEffect(() => {
    setPage(0);
}, [filter.status, filter.category, debouncedSearch, filter.startDate, filter.endDate]);

useEffect(() => {
    void fetchRequests();
}, [fetchRequests]);
```

`apiFetch` (`frontend/lib/api-error.ts`) forwards `init` to `fetch` but the page never passes a signal, so overlapping requests all resolve and the last resolver wins regardless of issue order. Rapid typing or filter flips under throttle can paint stale results. Separate reset-page effect also fires an extra fetch cycle per filter change. Browser step (type fast + throttle, check final list matches last query) will show the user-visible paint, but the missing guard is already proven in code.

## Summary

- A11Y-01: CONFIRMED (translate-hide, no trap, no Escape).
- A11Y-02: CONFIRMED on dialog semantics and focus; REFUTED on live-chat leak (early return excludes it).
- NET-01: CONFIRMED (no AbortController or sequence guard; separate reset-page effect).
