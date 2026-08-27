# PRD — Unit Test Coverage for LIFF Hooks + Sync skn-liff-form Skill

> **Date:** 2026-08-26 · **Author:** Cline (follow-up from handoff 20260825-0739) · **Status:** approved (self-review)

## Background

PR #202 (`d259efe`) extracted shared LIFF logic out of the three form pages:

- `frontend/hooks/useLiffInit.ts` — SDK init / login redirect / profile / idToken / in-LINE detection
- `frontend/hooks/useAutoCloseCountdown.ts` — success-screen countdown → `onClose`
- `frontend/lib/liff/location-cascade.ts` — districts/sub-districts fetchers
- `frontend/lib/liff/submit-service-request.ts` — POST wrapper (`x-liff-id-token`, 401 Thai message)

The vitest suite passes (539 tests) but only via page-level tests; the two hooks
have **no direct unit coverage** (smoke-test plan §6 gap). Separately, skill
`.claude/skills/skn-liff-form/SKILL.md` still documents the pre-PR202 structure
("single-file, no extraction") and is misleading for future agents.

## Goal

1. Pin the observable behavior of `useAutoCloseCountdown` and `useLiffInit` with
   behavior-level unit tests (public return values only).
2. Prove the tests actually catch regressions (mutation checks).
3. Sync `skn-liff-form` SKILL.md to the post-PR202 architecture.

## Non-Goals

- No source changes to hooks, helpers, or LIFF pages.
- No E2E/Playwright work; on-device Section A–B smoke test stays manual (user task).
- No refactoring of tested code during this task.

## Scope — Behaviors Under Test

### useAutoCloseCountdown(enabled, onClose, initialSeconds = 5)
| # | Behavior |
|---|----------|
| CD-1 | Starts at `initialSeconds` while enabled |
| CD-2 | Ticks down exactly once per second while enabled |
| CD-3 | Invokes `onClose` **exactly once** at zero; timeLeft stays 0; no further timers |
| CD-4 | Does not tick while `enabled=false` (success not yet set on wizard page) |
| CD-5 | Begins ticking only after `enabled` flips true (rerender) |
| CD-6 | Reads the latest `onClose` closure through the ref (inline closures safe) |
| CD-7 | `resetCountdown()` restores `initialSeconds` mid-count and counting continues |
| CD-8 | Unmount cancels pending timer → `onClose` never fires afterwards |
| CD-9 | Custom `initialSeconds` honored |

### useLiffInit(options)
| # | Behavior |
|---|----------|
| LI-1 | Happy path: init({liffId}) called; profile+idToken stored; initDone=true |
| LI-2 | `trackInLineApp:true` sets isInLineApp from `isInClient()`; setter override works |
| LI-3 | Not logged in + `redirectLogin:true` → `login()` called, no profile fetch |
| LI-4 | Not logged in + `redirectLogin:false` → skip silently (single page usage) |
| LI-5 | Missing NEXT_PUBLIC_LIFF_ID + default `requireLiffId` → throws surfaced via liffError + onError |
| LI-6 | Missing env + `requireLiffId:false` → silent skip (single page usage) |
| LI-7 | getLiff() null + `warnWhenSdkMissing:true` → console.warn once (request-v2 usage); default warns nothing |
| LI-8 | Init rejects → liffError + onError; initDone=true |
| LI-9 | Fallback re-detection: init fails + trackInLineApp → isInLineApp from isError-safe isInClient(), survives isInClient() throwing |
| LI-10 | getIDToken() throwing must NOT lose profile nor set liffError |

## Acceptance Criteria

- [ ] New files `frontend/hooks/__tests__/useAutoCloseCountdown.test.tsx` + `useLiffInit.test.tsx` cover every row above
- [ ] `npm run test:unit` fully green (existing 539 + new)
- [ ] Mutation check per hook: temporarily break the hook → at least one new test fails → revert
- [ ] SKILL.md updated: file structure, init flow via `useLiffInit`, submit via `submitServiceRequest`, countdown gating differences between the 3 pages
- [ ] Committed on `test/liff-hooks-unit-tests` branch → PR

## Out of Scope / Follow-ups
- `location-cascade.ts` + `submit-service-request.ts` direct tests (thin wrappers over fetch — may be covered opportunistically later)
