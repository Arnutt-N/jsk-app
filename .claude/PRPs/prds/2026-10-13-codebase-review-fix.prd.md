# PRD — Codebase review fix batch (2026-10-13 findings)

> **Status**: DRAFT (awaiting user approval + `prp-validate-plan` gate) · **Date**: 2026-10-13
> **Branch**: `fix/codebase-review-20261013` (from `main` @ `4e2db66`)
> **Binding spec**: `.claude/PRPs/findings/2026-10-13-codebase-review-findings.md`
> (74 unique: 5 Critical, 21 High, 34 Medium, 14 Low — all 5 Criticals source-verified)
> **Skills referenced**: per skill-collections map — `fastapi`, `testing_standards`,
> `security_checklist`, `database_migration`, `deployment_devops`, plus
> `pstack:principle-redesign-from-first-principles` (outbox atomicity as the standing pattern).

## Problem statement

Five independent read-only reviews (frontend, backend, security, tests, architecture)
converged on 74 evidence-backed findings. Five are Critical (data-loss-shaped:
LINE push before commit, webhook accounting gaps, DDL outside migrations,
unreproducible builds, silently-skipped supervisor e2e) and 21 are High
(unvalidated agent assignment, corrupt roles → 500, settings/audit split
transactions, media payload before authz, frozen LINE token, login-throttle bypass
both directions, XSS-adjacent URL rendering, proxy-bypass API base, suspense crash).

## Scope decision

- **FIX now**: all 5 Critical + all 21 High (G3), plus 44 Medium/Low items judged
  trivial-and-safe (one-liners, mechanical transforms, test-only changes), batched
  by file/area in the plan.
- **DEFER with reason** (documented, not silent):
  1. WS ticket via header (M-SEC) — changes the client contract; needs coordinated
     app/LIFF rollout, not a silent fix.
  2. python-jose → maintained JWT lib (M-SEC) — library swap with token-compat risk;
     needs its own spike + rollout plan.
  3. Permission-policy cross-worker invalidation via Redis (M-BE) — multi-worker
     correctness change; needs design (pub/sub vs version check), not a drive-by.
  4. Export streaming on short-lived sessions (L-BE) — perf refactor of working
     exports without a failing test to anchor it.

## User stories (abridged — full mapping in plan self-review)

1. As an operator, a LINE message is never sent for a record that failed to save.
2. As an admin, assigning a non-existent agent fails loudly instead of corrupting data.
3. As a citizen, chat image links cannot execute attacker URLs.
4. As a maintainer, `main` rebuilds reproducibly and schema changes flow via Alembic only.
5. As CI, the supervisor escape-hatch journey and the booking race test actually run.

## Out of scope

- The 4 deferred items above; any finding not in the findings file; product changes;
  the debt/service token migration (separate follow-up); PR #254 follow-ups.

## Acceptance criteria

1. Zero unresolved Critical/High (G3) — each closed by the mapped task + test.
2. Every deferred item has its reason above (no silent drops).
3. Gates per phase green: backend scoped pytest, frontend tsc + eslint + targeted
   vitest, `npm run build`, migration round-trip where touched, CI 4/4 on the PR(s).
4. No weakened assertions; no behavior change beyond the finding's fix.

## Risks

- Batch size: 60+ fixes across backend + frontend. Mitigation: 3 sequential phases,
  per-task gates, per-phase PRs (reviewable chunks), no two agents on one file.
- Outbox/atomicity refactors touch money-adjacent flows (booking, broadcast).
  Mitigation: red-first tests asserting ordering, existing suites stay green.
- Lockfile pinning can freeze a bad transitive version. Mitigation: fresh-install +
  full backend suite + build before commit.
