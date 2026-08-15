# Session Summary — open_code — 2026-08-15T15:50:00+07:00

**Branch**: `main`  **HEAD**: `125be81`
**Checkpoint**: `.agents/state/checkpoints/handover-open_code-20260815-1550.json`
**Model**: GLM 5.3 (opencode-go)

> Continuation of the 20260815-1520 session (same working session, second
> handoff): post-merge code review of PR #192. No code changed this round.

## Objective

Two-axis code review (Standards + Spec) of PR #192 — the LIFF booking boot
false-timeout fix merged as squash `f952106` — following the review skill:
fixed point `26cd0e9...f952106`, parallel general-purpose sub-agents,
aggregated without reranking.

## Spec axis (all 4 numbered fix items verified implemented)

1. 15s budget on SDK *load* only; `liff.init()` never timed out ✅
2. `setError(null)` on successful boot ✅ (sits after the options fetch,
   not right after init — harmless now that the competing timer is gone)
3. Manual SDK inject after 5s grace if no `line-scdn` tag, with a
   `fallbackInjected` double-inject guard — an improvement over
   LiffStateBoot's unconditional inject ✅
4. Missing `NEXT_PUBLIC_LIFF_ID` errors immediately, decoupled from the
   SDK poll ✅

No missing requirements, no scope creep.

## Standards axis (0 hard violations; all judgement calls)

- **Worst smell — Duplicated Code:** the LIFF SDK URL now appears 4×
  across 2 files (LiffStateBoot inject, booking fallback inject, 2×
  `<Script>` in booking page). Minimum fix: extract `LIFF_SDK_URL`.
  Do NOT merge the full wait/inject logic — LiffStateBoot and booking have
  deliberately different timing budgets.
- Names: `pending` → `pendingTimers`, `const s` → `script`.
- Magic numbers 15000/5000/150 inline (comments justify them).
- Inconsistent liff truthiness checks (`!window.liff` vs
  `typeof window.liff !== 'undefined'`).
- Correctness verified sound: timer cleanup complete (no leak/spin after
  unmount), `cancelled` guard covers every setState, no stale closures.

## Cross-axis edge notes (low risk, follow-up candidates)

1. **Double-SDK-load window:** if Next's stuck `__next_s` queue flushes
   *after* the manual fallback inject, two same-src scripts execute and the
   second may reassign `window.liff` mid-poll/mid-init. Low probability;
   guard covers only "tag absent → inject".
2. **Cleanup deviation:** LiffStateBoot removes its injected script on
   unmount; booking's fallback never does (benign — removal wouldn't undo
   `window.liff` anyway).

Verdict: nothing blocking. Both notes + smells are optional follow-ups.

## Next Steps

1. User re-tests booking in LINE (fix live on prod since `f952106`).
2. Run the manual booking test per
   `.scratch/liff-booking-test/manual-test-checklist.md` (weekday;
   booking settings enabled).
3. Implement `fix/booking-list-filter` per the approved plan.
4. Optional cleanup: extract `LIFF_SDK_URL` constant + comment/guard the
   double-load window.

## Blockers

- None.
