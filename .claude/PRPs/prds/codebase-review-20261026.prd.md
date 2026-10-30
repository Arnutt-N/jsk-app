# PRD — Codebase review fixes (full codebase, 2026-10-26)

**Source for**: `.claude/PRPs/plans/codebase-review-20261026.plan.md`
**Findings spec**: `.claude/PRPs/findings/codebase-review-20261026-findings.md` (F-001–F-034, all accepted, none deferred)
**Branch**: `fix/codebase-review-20261026`

## Problem

Four independent read-only reviews (backend security, frontend correctness, tests + CI, architecture)
returned 34 verified findings against the JskApp tree. Ten are High: live-chat HTTP writes bypass the
documented permission gate, permission revocations do not reach all workers, auth-entry 401s trigger
token refresh, remote logout can cascade, the multi-operator suite never runs in CI, CD can ship while
E2E is red, the gate-coverage guard passes on substrings, production installs unpinned dependencies,
navigation ignores the DB permission matrix, and Redis silently degrades to per-process limits.

Fifteen Mediums cover fail-open policy loads, uncapped webhook bodies, missing audit rows on
visibility and conversation lifecycle changes, socket retry routing, unrecognised timeout aborts,
weak login-stability assertions, data-dependent spec skips, unpinned e2e installs, a dead RED skip
guard, warning-only smoke checks, bare admin navigations, no backend lint gate, a triple-declared
route policy, and an inline date window. Nine Lows cover CSRF compare crashes, login ambiguity and
timing oracles, webhook decode order, raw error bodies in UI, `test.only` risk, missing coverage
floors, a permanently skipped baseline, and skipped live-chat a11y guards.

## Decisions

- Fix in severity order: High first, then Medium, then Low. CI and deploy gates early, because every
  later fix relies on a trustworthy signal.
- No behaviour redesigns: each fix keeps the existing contract and only closes the hole the finding
  proves (e.g. AGENT reachability stays as-is; the menu/guard work from PR #300 is untouched).
- E2E specs created by this work own their rows via `createRequestFixture`; no reliance on seeded rows
  other specs delete (repo rule, proven necessary on 2026-10-25).
- Anything the plan cannot cover stays in the findings file's Deferred table. That table is currently
  empty; if a task proves unimplementable it moves there with a reason instead of being silently dropped.

## Acceptance

- Every accepted finding maps to at least one implemented task; `prp-validate-plan` B7 passes.
- No unresolved Critical or High remains (G3). There are no Critical findings; all ten Highs are fixed.
- Validation per the stack table below passes end to end.

## Stack and validation commands (detected once, used everywhere)

| Layer | Stack | Commands |
|---|---|---|
| Backend | FastAPI 0.109+, Python 3.13, SQLAlchemy 2 async, Pydantic V2, Alembic | `cd backend && ./venv/Scripts/python.exe -m pytest -q` (scoped: `... -q tests/test_x.py`) · no backend linter configured (F-026 adds ruff) |
| Frontend | Next.js 16, React 19, TS 5, Tailwind v4 | `npm run lint` · `npm run test:unit -- <path>` (vitest) · `npm run test:e2e -- <spec>` (playwright, needs dev servers + seeded admin) · `npm run build` |
| CI | GitHub Actions (`ci.yml`, `e2e.yml`, `cd.yml`) | `gh pr view --json mergeStateStatus,statusCheckRollup` to read gates |

## Out of scope

New features, performance optimisation, the follow-ups already named in
`.audit/review-record-admin-p1-fixes.md` (drawer-hook extraction, spec-folder consolidation,
ref-count reset path, login-helper capture folding), and anything outside F-001–F-034.

## Iron rule reminder (user-mandated 2026-10-13)

No key, token, password, or secret appears in any handoff, summary, log, or finding. Verification by
counts, hashes, and presence only.
