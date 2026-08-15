# Session Summary — open_code — 2026-08-15T14:50:00+07:00

**Branch**: `main`  **HEAD**: `2818c6e`
**Checkpoint**: `.agents/state/checkpoints/handover-open_code-20260815-1450.json`
**Model**: GLM 5.3 (opencode-go)

> Closes the LIFF plumbing arc opened by the `20260814-2306` session's
> "Manual LINE test — needs a LIFF ID" next step. Booking is now reachable
> from LINE via a single LIFF app with a root endpoint.

## Objective

Make `/liff/booking` (and every other LIFF page) reachable from LINE after
moving the LIFF app's Endpoint URL to the site root — and make the transition
invisible to the user (no home-page flash).

## What shipped

**PR #190** — `7c6d871` — `fix(liff): complete LIFF secondary redirect on
landing page`. New `frontend/components/liff/LiffStateBoot.tsx` mounted on the
landing page: when the URL carries `?liff.state=`, it loads the LIFF SDK and
runs `liff.init()`, letting the SDK finish the secondary redirect to the
requested path. Regular visitors (no `liff.state`) load nothing extra.

**PR #191** — `2818c6e` — `feat(liff): branded spinner overlay during
landing-page LIFF boot` (squash of 3 commits incl. the Codex UX report,
committed to `research/codeX/`). The overlay is injected by an inline script
that runs during HTML parse — before the SSR'd landing paints — so the hero
section is never visible during boot. Per the report (§6-7): static splash
first (JSK brand mark + "กำลังเปิดบริการ..."), spinner ring fades in only
after 250ms so a fast init never flickers. Fail-safes: no liffId → overlay
removed; unclaimed after 8s → self-removes; SDK absent at 10s → reveal page.

Both PRs: CI green on every check (incl. one rerun — see CI flake note), CD
deployed Vercel only (backend/migration correctly skipped), and the fix was
**verified live in the production bundle** by grepping deployed chunks for the
boot logic (`liff.state`, later `กำลังเปิดบริการ` + `liff-boot-late` in
chunk `b849b3b1`).

## The two root causes, both non-obvious

1. **LIFF path-append is APPEND, not REPLACE.** The earlier plan-mode analysis
   claimed a path-appended LIFF URL replaces the endpoint's path — wrong. LINE
   docs (confirmed by fetching developers.line.biz): the primary redirect goes
   to the endpoint *verbatim* with the requested path in `liff.state`; the
   secondary redirect to the real page only happens if the receiving page calls
   `liff.init()`. With the endpoint at root, that receiving page is the
   landing page, which never inits LIFF — hence every path-appended URL
   stranded users on home.
2. **`NEXT_PUBLIC_LIFF_ID` was never set on Vercel.** Proven by grepping all
   14 production chunks: the variable was referenced but no value inlined.
   The whole app works off relative `/api/v1` (Vercel rewrite proxy), so no
   env var was ever needed until LIFF. User set it (Production + Preview) and
   redeployed; boot then worked, exposing only the brief home flash that
   PR #191 eliminated.

## Decision record: one LIFF app, root endpoint

Chosen over separate LIFF apps per page: all pages share one channel, one
scope (`openid profile`), one backend; the codebase reads a single
`NEXT_PUBLIC_LIFF_ID` in 7 places; new pages need zero console work. Prod DB
audit (read-only, all 131 text/json columns): **zero** `liff.line.me` /
`line://app` references and 0 rich-menu rows — no bare URLs to patch. The
Codex report (§2, §12) independently confirmed this architecture. Endpoint
URL stays `https://jsk-app.vercel.app/` permanently; pages are addressed as
`https://liff.line.me/{liffId}/liff/<page>`.

## Work artifacts in `.scratch/liff-booking-test/` (untracked by design)

- `manual-test-checklist.md` — 9-section manual test plan for the booking
  flow, drafted from real code (slot engine, duplicate guard, admin actions,
  reminder scheduler). Already updated for the root-endpoint approach
  (no endpoint switching back and forth).
- `issue-booking-list-filter.md` — confirmed bug: `list_user_bookings`
  (`booking_service.py:351-361`) has no status/date filter, so the `คิว` Flex
  reply and `/liff/bookings/me` show past + cancelled bookings; limit 10 can
  be eaten by old rows. Fix approved, deferred until manual test completes.

## Merge mechanics

- PR #190 merge left local `main` diverged (local-only handoff commit
  `b93de2b`); before `reset --hard` every file in it was diffed against
  `origin/main` — identical, nothing lost (the checkpoint had been pushed via
  another route). PR #191 merged clean (gh fast-forwarded local).
- CI flake seen once: Turbopack build failed with Google Fonts 404
  (`fonts.gstatic.com` Noto Sans Thai) on a GH runner while the same commit
  built fine on Vercel — `gh run rerun --failed` went green. Not related to
  the changes; rerun on sight.
- Local frontend tooling (eslint/tsc/vitest) hangs on this Windows host —
  esbuild transform was used for syntax checks and CI was the real gate,
  same as the previous session.

## Test results

| Suite | Result |
|-------|--------|
| CI on PR #190 (after rerun) | all checks green |
| CI on PR #191 (incl. docs commit) | all checks green |
| CD after both merges | Vercel deploy + frontend smoke pass |

## Next Steps

1. User re-tests `https://liff.line.me/{liffId}/liff/booking` in LINE —
   expected: JSK splash from first frame, spinner only if boot >250ms, then
   the booking page. No home flash.
2. Run the manual booking test per
   `.scratch/liff-booking-test/manual-test-checklist.md`. Preconditions
   0.1/0.5-0.7 are already verified or done; remaining gates are booking
   settings (`enabled`, service types), testing on a weekday
   (`business_hours` defaults close Sat/Sun), and two test accounts.
3. Implement `fix/booking-list-filter` per the approved plan: filter
   `list_user_bookings` to CONFIRMED + upcoming (asc, soonest first), add
   `include_past` param to `GET /liff/bookings/me`, TDD with 4 tests in
   `tests/test_booking_list.py`; details in the issue doc.
4. Turbopack Google-Fonts 404 → rerun failed jobs; if it recurs often,
   consider font fallback or build cache pinning.

## Blockers

- None. Manual booking test is user-driven; the fix branch is ready to start.
