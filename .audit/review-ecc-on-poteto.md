# ECC-methodology review of poteto lane `fix/audit-f1f4-poteto`

Role: INDEPENDENT reviewer (did not write the code). Method: skills-first —
every verdict below is mapped to the skill lens read from current files, not
memory. Poteto-mode was NOT used for this review.

- Code under review: worktree `D:\genAI\jsk-app\.worktrees\audit-fix-poteto`,
  branch `fix/audit-f1f4-poteto` (verified via `branch --show-current`), HEAD
  `6f5d757`, base `6f6bbf6` (verified ancestor, `BASE-OK`).
- Read-only discipline: never switched branches, never edited anything in the
  worktree (pytest run with `-p no:cacheprovider`; no source files touched).
- Context: `.audit/enterprise-audit-findings.md` (F1–F4), `.audit/fix-race-verdict.md`,
  lane trail `.audit/audit-fixes-poteto.md`.
- Commits reviewed (`6f6bbf6..HEAD`, 4 commits, one per fix):
  `3769a41` F2 docs-note · `9695050` F1 monkeypatch · `8cc3d84` F3 ignores ·
  `6f5d757` F4 warnings.
- IRON RULE honored: no secret values printed anywhere in this review. The only
  credential-adjacent token named is `DEV_AUTH_BYPASS`, a boolean dev flag (not
  key material), referenced by name/presence only.

## Independent verification (run by this reviewer, not trusted from lane receipts)

| Check | Command (from review worktree) | Result |
|---|---|---|
| Backend F1 file, bypass unset | `DEV_AUTH_BYPASS` untouched — `pytest tests/test_health_hardening.py` (`/c/Python312/python.exe`, `-p no:cacheprovider`) | **2 passed** in 11.42s |
| Backend F1 file, bypass forced on | `DEV_AUTH_BYPASS=true pytest tests/test_health_hardening.py` | **2 passed** in 16.29s |
| Frontend lint | `npm run lint` | **exit 0 — 0 errors, 2 warnings** (both `app/admin/image-resize/__tests__/upload-security.test.ts:14:31,14:57`) |
| Frontend tsc | `npx tsc --noEmit` | **exit 0**, no output |
| App-code drift | `git diff 6f6bbf6..HEAD -- backend/app/` | **empty** — zero production-code change |
| Source-side suppression smuggling | `git diff 6f6bbf6..HEAD \| grep -c eslint-disable` | **0** — no new suppressions |

NOT rerun (long suites; stated explicitly): `npm run build`, frontend full unit
(785), backend full suite, backend F2 fresh-DB rerun. For these, lane receipts
are accepted only where the diff scope makes them unnecessary — see each verdict.

## F2 docs-note — Verdict: APPROVE (lens: testing_standards, test-behavior integrity)

- Diff: `backend/tests/test_inbox_distinct_on.py:1-11` — module-docstring note
  only. Zero behavior change, zero test-logic change.
- Per testing_standards §1 ("Test Behavior, Not Implementation"): the test
  itself is a behavior test (equivalence of two inbox query paths against a
  DB). The docs-note does not alter what it asserts, so behavior integrity is
  trivially preserved — there is nothing to weaken.
- Is documenting-without-fixing acceptable? Yes here. The standard demands
  TDD/coverage for business logic; it does not demand a code change for an
  environment-data artifact. This reviewer independently confirmed the failure
  mechanism in code: `backend/app/services/user_identity_service.py:157-175`
  `decrypt_line_ids_for_users` is explicitly fail-loud (raises on empty or
  undecryptable token, docstring says so), and a tolerant variant exists only
  for cleanup ticks (`:178-186`, "do NOT use where the fail-loud contract is
  required"). A stale row encrypted under a different key therefore fails any
  inbox-window query by design — matching the lane's root-cause story. Changing
  app code (e.g. silently tolerating) would weaken a deliberate contract, so
  NOT changing code is the correct call.
- Proof sufficiency: the decisive evidence (fresh-DB 2 passed; base rerun 1
  failed `InvalidToken`) is a lane receipt and was NOT rerun here (fresh-DB
  setup + base checkout is a long, stateful procedure). It is accepted because
  (a) the diff cannot affect the outcome either way, (b) the fail-loud code
  path corroborates the story independently, and (c) the note itself is
  actionable (fresh DB → `alembic upgrade head` → `DATABASE_URL`-pointed rerun).
- Note (non-blocking): the note does not name the shared DB (`skn_app_db`) or
  the exact `DATABASE_URL` override syntax; a future reader must infer it.

## F1 monkeypatch — Verdict: APPROVE (lenses: testing_standards + security_checklist)

- Diff: `backend/tests/test_health_hardening.py:8-9` — adds `monkeypatch`
  fixture arg and pins `api_deps.settings.DEV_AUTH_BYPASS` to `False`. Test-only.
- Test-behavior integrity (testing_standards): the test still tests behavior,
  not implementation. It performs real unauthenticated `GET`s against
  `/api/v1/health/detailed` and `/api/v1/health/websocket` and asserts the
  observable gate outcome (401/403). The monkeypatch controls an environment
  precondition (dev-bypass flag), not the gate itself — no endpoint, dependency,
  or mock stands in for the code under test. `monkeypatch` auto-restores, so no
  leakage into the second test in the file.
- Gate strength (security_checklist): unchanged by construction — `backend/app/`
  diff is empty, so `deps.py` fail-closed semantics, CORS, rate limits, and
  error-code behavior are untouched. The test now deterministically exercises
  the fail-closed path instead of being at the mercy of local `.env` files.
  Measured: 2 passed with the flag unset AND with `DEV_AUTH_BYPASS=true` in the
  environment (table above) — the pin holds in both states.
- No objection.

## F3 eslint ignores — Verdict: APPROVE (lens: senior-frontend, config hygiene)

- Diff: `frontend/eslint.config.mjs:12` — one line, `playwright-report-2client/**`,
  added alongside the existing generated-dir ignores (`.next`, `out`, `dist`,
  `build`, `node_modules`, `*.min.*`). Correct scope: it matches exactly the
  generated Playwright bundle path cited in the audit findings; no first-party
  source path is covered or could be masked by this pattern.
- Nothing source-side hidden: zero `eslint-disable` additions in the branch diff
  (measured count 0); pre-existing disables elsewhere are out of scope and
  untouched. Measured: `npm run lint` exit 0 with 0 errors.
- Note (non-blocking): the glob is name-specific — a future second report dir
  (e.g. `playwright-report/`) would redden the gate again. A `playwright-report*/**`
  pattern would be more robust, but the current line matches the audit evidence
  exactly and minimal-diff was the right default.

## F4 eight warning fixes, test file untouched — Verdict: APPROVE-WITH-NOTES (lenses: senior-frontend + react_19_patterns)

All 8 edits individually checked for behavior preservation; all pass:

1. `frontend/app/admin/chat-histories/[lineUserId]/page.tsx:179` — drops
   `lineUserId` from `handleExport` deps. Verified the callback body uses only
   `messages`/`displayName`; the `lineUserId`-dependent CSV exporter below is a
   separate callback. Correct per exhaustive-deps (react_19_patterns: no manual
   memoization to preserve beyond what is referenced).
2. `frontend/app/admin/friends/history/page.tsx:151` — drops `perPage`, verified
   module-scope `const perPage = 20` (`:95`); referentially stable by definition.
3.–5. `rich-menus/page.tsx:64`, `settings/custom/page.tsx:83`,
   `settings/line/page.tsx:73` — add `toast`. Verified stable:
   `components/ui/Toast.tsx:30-37` builds `toast` with `useCallback` over a
   stable `dismiss` (`[]`), so adding it cannot introduce extra effect runs.
6. `components/admin/CommandPalette.tsx:244` — drops `logout`. Verified `logout`
   is only consumed at `:375` (confirm handler), outside the memo body. Correct.
7. `app/admin/files/page.tsx:539-549` (thumbnail) `<img>` → `<Image fill
   unoptimized sizes>` inside a newly-`relative` box. `fill` + `object-cover`
   reproduces the old `w-full h-full object-cover`; Next.js lazy-loads by
   default so `loading="lazy"` is preserved; `unoptimized` is the right call for
   auth-token API URLs / arbitrary remote URLs the optimizer cannot sign, and
   the inline comment says exactly that (senior-frontend Image Optimization —
   `unoptimized` passthrough keeps bytes, including animations, identical).
8. `app/admin/files/page.tsx:838-846` (modal) `<img>` → `<Image width={800}
   height={600} unoptimized className="h-auto w-auto max-h-[60vh] …">`. Aspect
   and clamp behavior preserved; only the pre-load intrinsic box differs
   (fixed 800×600 vs natural size) — visually negligible under the `max-h` clamp.
9. `contexts/AuthContext.tsx:195-196` — rest-destructure with dead `_csrf`
   binding → spread-plus-`delete`. Resulting object identical (copy is mutated,
   not `meData`); `tsc exit 0` confirms typing is clean.

Leaving 2 warnings — is it the right call? **Yes, acceptable (gate Math: exit 0,
warnings don't fail), hence APPROVE rather than REQUEST-CHANGES.** The two
warnings are unused mock params `input`/`init` at
`upload-security.test.ts:14`, verified never referenced in that mock's body
(`:14` returns a bare `Response`). A fix (`_`-prefix or arg-free signature, as
the ECC lane demonstrated with a full 785/785 suite) is test-file-only and
zero-risk — but so is leaving them: they fail nothing, and the lane's
don't-touch-tests rule kept the diff minimal. Follow-up note: take the trivial
rename if warning-fatigue masking is a concern; do not treat it as blocking.

## Scope statement for non-rerun suites

`npm run build`, frontend full unit, backend full suite, and the F2 fresh-DB
procedure were NOT rerun. Lane receipts are accepted for these because the
branch diff contains no production-code change (`backend/app/` empty, frontend
changes limited to dep arrays, `Image` swaps, one config-ignore line, one docstring,
one test precondition) and this reviewer's own runs (lint exit 0, tsc exit 0,
F1 file green in both bypass states) cover every surface the diff touches.

## Sharpest single objection

F4's deliberately-untouched `upload-security.test.ts:14` mock signature
(`input`/`init` unused) — leaving 2 warnings is gate-safe but leaves warning
noise that can mask future real warnings; the one-line `_`-prefix/arg-free fix
is test-only, zero-behavior-change, and already proven safe by the sibling lane's
full-suite run. Non-blocking; recommended as a follow-up, not a merge gate.
