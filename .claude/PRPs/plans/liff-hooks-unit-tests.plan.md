# PRP Plan — LIFF Hooks Unit Tests + skn-liff-form Skill Sync

> **PRD:** `.claude/PRPs/prds/liff-hooks-unit-tests.prd.md` · **Branch:** `test/liff-hooks-unit-tests`

## Conventions (from repo)
- Tests live next to source: `frontend/hooks/__tests__/*.test.tsx`
- Runner: `npm run test:unit` (= `vitest run`), jsdom env, globals true,
  setup auto-cleans React trees (see `vitest.config.ts`, `vitest.setup.ts`)
- RTL style: `renderHook` + `act`; controllable mocks; Arrange/Act/Assert comments
  (mirrors `useGuardedUpdate.test.tsx`, `useReducedMotion.test.ts`)
- Expected values are independent literals (e.g. "ปิดหน้าต่าง" message strings),
  never recomputed from the SUT

## Phase 1 — Branch + countdown tests
Files: `frontend/hooks/__tests__/useAutoCloseCountdown.test.tsx`
Technique: `vi.useFakeTimers()` + `act(() => vi.advanceTimersByTime(1000))`;
real timers restored in `afterEach`. One describe block, tests CD-1…CD-9.
Validation: targeted vitest run green.

## Phase 2 — useLiffInit tests
Files: `frontend/hooks/__tests__/useLiffInit.test.tsx`
- Mock module: `@/lib/logger` (`vi.mock`) so errors don't spam output
- Factory `createMockLiff()` returning full `LiffSdk` mock (init/login/isLoggedIn/
  isInClient/getProfile/getIDToken) with safe defaults
- Save/restore `process.env.NEXT_PUBLIC_LIFF_ID` around each test
- `vi.spyOn(console, 'warn')` for LI-7; env literals: `'LIFF ID is not specified...'`,
  `'LIFF SDK not found. Running in browser mode?'`
Validation: targeted run green (LI-1…LI-10).

## Phase 3 — Mutation verification (proves tests bite)
Temporary edits, rerun, expect failures, then revert exactly:
- Countdown: change timeout chain to fire immediately / drop ref update → CD-6 or CD-2 red
- Hook: make error path swallow onError → LI-8/LI-5 red; make init failure clear profile? no — pick ref-read removal for onClose (countdown) and remove try/catch around getIDToken (LI-10 red)
Validation: targeted runs show ≥1 failing test per mutation; restore files byte-identical (`git diff` clean).

## Phase 4 — Full suite
`npm run test:unit` → all green including previous 539.

## Phase 5 — Skill sync (SKILL.md only)
File: `.claude/skills/skn-liff-form/SKILL.md`
1. Intro paragraph — modular structure note (page.tsx keeps step UI/state; shared
   logic lives in hooks + lib/liff since PR #202)
2. Rule 1 rewrite — "single-file" rule replaced: edit pages for fields/steps/UI;
   edit `useLiffInit` / `useAutoCloseCountdown` / `location-cascade` /
   `submit-service-request` for init, cascade, close-countdown, submit semantics
3. File Structure block — add 4 new modules + `hooks/__tests__`
4. Step 1 — replace inline useEffect snippet with `useLiffInit` call signature +
   per-page option table (service-request: bundled import+trackInLineApp;
   request-v2: window.liff+warn+onError; single: requireLiffId:false+no redirect)
5. Step 6 submit — `submitServiceRequest(payload, idToken)`; header attachment;
   401 → Thai session-expired error (exact string)
6. Success/countdown section — gating matrix: wizard counts only
   `enabled = success && isInLineApp`; request-v2/single count whenever success;
   `resetCountdown` reachable only outside LINE ("ยื่นคำร้องใหม่")
7. Version bump metadata 1.0.0 → 1.1.0 + tag `pr202-refactor`

## Phase 6 — Ship
Commit (tests + skill + PRD/PRP docs) → push → PR to main. Handoff checkpoint is a
separate user-validated step (not part of this PR).
