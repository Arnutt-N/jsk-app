# Session Summary — open_code — 2026-08-15T15:20:00+07:00

**Branch**: `main`  **HEAD**: `f952106`
**Checkpoint**: `.agents/state/checkpoints/handover-open_code-20260815-1520.json`
**Model**: GLM 5.3 (opencode-go)

> User-reported bug from the 20260815-1450 session's next step #1: booking
> page in LINE showed "ไม่สามารถโหลด LINE SDK ได้". Fixed, merged, and
> regression-verified on prod within the session.

## Objective

Make `/liff/booking` boot reliably in the LINE in-app browser instead of
showing a false "cannot load LINE SDK" error.

## Diagnosis

1. Reproduced non-destructively: headless Chromium against live prod showed
   the SDK script tag + `window.liff` appear by t=0s after
   domcontentloaded, zero console errors — the CDN/injection path is fine
   in a normal browser.
2. Code inspection of `frontend/app/liff/booking/page.tsx` found the real
   defect: the boot effect polled `window.liff` every 100ms with a blanket
   10s `giveUp` timer that was **never cleared when the SDK arrived**. In
   the LINE in-app browser on mobile data, SDK load + `liff.init()` (which
   performs network token exchange) can exceed 10s → the timer fired a
   false "SDK load failed" error over an in-flight boot. The error was
   also never cleared on eventual success, so it could sit above a fully
   working form. (`React rendered the error → hydration worked → the
   __next_s script queue had flushed` — evidence against the
   "script never injected" hypothesis.)

## Fix — PR #192 (squash `f952106`), booking boot effect only

- Budget **only the SDK load phase**: poll `window.liff` up to 15s; clear
  nothing mid-init — `liff.init()` is network-bound and must not be timed
  out (spinner covers it).
- `setError(null)` on successful boot (stale error can no longer persist).
- Fallback hardening: if no `script[src*="line-scdn"]` tag exists after a
  5s grace period (stuck `__next_s` queue), inject the SDK manually —
  same pattern as `LiffStateBoot` (proven on the prod landing page).
- Missing `NEXT_PUBLIC_LIFF_ID` now errors immediately, decoupled from the
  old `!liffId || !window.liff` conflation.

## Verification

- CI on PR #192: all checks green (backend pytest, frontend lint+build,
  Playwright smoke, encoding scan).
- **Vercel preview was unusable for e2e** — Deployment Protection 302s to
  `vercel.com/sso-api`, headless browser can't pass. Verified on **prod**
  after merge instead (CD run 31874139975 success):
  - Scenario A (user's bug): CDN blocked + fake `window.liff` injected at
    t=12s (slower than the old 10s timer) → **no error**, service list
    rendered at t=12.0s. Old code would have errored at 10s.
  - Scenario B (genuine failure): CDN blocked, no fake → correct error at
    t=15.7s (new budget), also proving the new bundle was live.
- Diagnostic scripts (untracked, in %TEMP%/opencode): `liff-diag.cjs`,
  `liff-regress.cjs` (reusable for future LIFF boot checks).

## Notes / follow-ups

- Other LIFF pages (`service-request`, `request-v2`, `close-test`) share a
  similar poll pattern and may carry the same false-timeout behavior — not
  touched this session.
- Turbopack Google-Fonts 404 CI flake did not recur this session.
- Local node/vitest/eslint still hang on this Windows host; esbuild
  transform was used for syntax checking (same as previous session).

## Test results

| Suite | Result |
|-------|--------|
| CI on PR #192 | all checks green |
| Prod regression A (slow SDK, 12s) | PASS — no false error, page boots |
| Prod regression B (SDK never loads) | PASS — error at 15.7s |

## Next Steps

1. User re-tests booking in LINE — expected to boot past 10s on slow
   networks with no false error.
2. Run the manual booking test per
   `.scratch/liff-booking-test/manual-test-checklist.md` (weekday required;
   booking settings enabled).
3. Implement `fix/booking-list-filter` per the approved plan.

## Blockers

- None.
