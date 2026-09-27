# PRD: CI Greenlet Fix — 2026-09-27

**Created:** 2026-09-27
**Author:** Cline
**Branch:** `feat/handoff-system-cleanup-20260926` (same branch — fix belongs to PR #233, makes its CI green)
**Status:** Draft → review before implement
**Trigger:** PR #233 CI red — `Backend Pytest` + `Playwright Smoke` both fail at `alembic upgrade head` with `ModuleNotFoundError: No module named 'greenlet'`. PR touches docs + handoff scripts only (`git diff origin/main...HEAD -- backend frontend .github` is empty), so the failure is pre-existing/upstream, not from PR #233 changes.

---

## 1. Executive Summary

CI resolves `sqlalchemy-2.1.1` (newly released; splits `greenlet` out of the base install — asyncio support now needs the `sqlalchemy[asyncio]` extra). `backend/requirements.txt` pins only `sqlalchemy>=2.0.25` (unbounded above), so fresh CI installs get 2.1.1 without `greenlet` and `alembic upgrade head` crashes before any test runs. Fix: declare the asyncio extra in requirements so `greenlet` is always installed.

## 2. Goals / Non-goals

**Goals:**
- Backend Pytest + Playwright Smoke CI jobs go green on PR #233 (fail at migration step today, before tests).
- One-line, minimal dependency declaration change; no code changes.

**Non-goals:**
- Not pinning SQLAlchemy to `<2.1` (blocks future updates; worse than declaring the extra).
- Not touching app code, migrations, workflows, or docs.
- Not fixing anything else CI-related.

## 3. Acceptance Criteria

- AC-1: `backend/requirements.txt` declares the asyncio extra: `sqlalchemy[asyncio]>=2.0.25` (pip installs `greenlet` automatically).
- AC-2: No other file changed (`git status` shows only `backend/requirements.txt` + this PRD/plan).
- AC-3: `py .agents/scripts/validate_handoff_state.py` still PASS (handoff state untouched).
- AC-4: Push to `feat/handoff-system-cleanup-20260926`; PR #233 CI Backend Pytest job passes the `alembic upgrade head` step (full green confirmed via `gh pr checks 233`).

## 4. Risks / Rollback

- Risk: `sqlalchemy[asyncio]` extra syntax unsupported by pip — no, extras in requirements.txt are standard and CI uses plain `pip install -r`.
- Risk: greenlet version conflict — pip resolves it; CI log will show.
- Rollback = revert the one-line commit on this branch.
