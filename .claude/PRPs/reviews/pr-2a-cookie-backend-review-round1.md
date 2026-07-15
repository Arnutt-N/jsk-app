# Review Round 1 (pre-commit) — PR 2A Cookie Backend Foundation

**Reviewer:** Fable 5 (main session) · **Date:** 2026-07-16
**Branch:** `feat/p1.1a-cookie-backend-foundation` (12 commits, not pushed)
**Verdict:** APPROVE WITH ONE RECOMMENDED FIX — no CRITICAL/HIGH issues; safe to push after F1.

Independently verified by the reviewer (not trusting the implementer's report):
- `git diff --stat main -- frontend/` → empty (frontend untouched) ✓
- Every `token_hash=` assignment routes through `_hash()`/`hashlib` — zero raw
  secrets persisted ✓
- `secrets.compare_digest` used for the one same-process comparison (CSRF,
  `deps.py:149`); session/ticket lookups match hashes in SQL (no in-process
  timing channel) ✓
- No logger call in `auth.py` / `auth_session_service.py` / `cookie_auth.py`
  can print a raw secret ✓
- `python -m pytest tests/test_cookie_auth.py` → **11 passed** (re-run by
  reviewer in WSL, 46s) ✓

The design is sound: bearer-mode short-circuit gives real byte-behavior
compatibility; rotation/reuse logic is atomic (`UPDATE...RETURNING`); Origin
check is pre-accept; CSRF is HttpOnly-cookie + body-echo double-submit layered
on top of SameSite=Lax (defense-in-depth, correct). Test coverage genuinely
asserts the security properties, not just status codes.

---

## F1 — [MEDIUM, recommend fix before push] Expired (never-rotated) refresh token raises a false reuse alert

**File:** `backend/app/services/auth_session_service.py:165-189`

`rotate_refresh_session` claims with `status == ACTIVE AND expires_at > now`.
An honest client returning after the 7-day refresh TTL presents a row that is
still `status=active` but `expires_at <= now`: the claim misses, the fallback
`select` finds the row, and the code unconditionally treats "row exists but not
claimable" as **reuse** — revoking the family and writing a
`refresh_reuse_detected` audit row.

**Failure scenario:** admin closes laptop for 8 days → returns → frontend auto-
refresh with the stored (expired) cookie → backend emits `refresh_reuse_detected`
(a signal FR7/success-metrics defines as *alert-on-any*) for a completely benign
expiry. The family revoke itself is a harmless no-op (the row was already dead),
but the spurious security alert pollutes the exact metric the PRD says to alert
on — classic false-positive → alert fatigue.

**Fix (localized):** in the fallback branch, treat an `active`-but-expired row
as `INVALID` (plain "session expired"), and reserve `REUSE_DETECTED` for rows
whose status is actually `rotated`/`revoked`:

```python
if existing is None:
    return RotationResult(outcome=RotationOutcome.INVALID)

# An active row that simply expired is an ordinary expiry, not reuse — do
# not revoke the family or raise the reuse alert for it.
if existing.status == STATUS_ACTIVE and existing.expires_at <= now:
    return RotationResult(outcome=RotationOutcome.INVALID)

# status in (ROTATED, REVOKED) => this exact token was already consumed => reuse
await db.execute(update(AuthSession).where(...).values(status=STATUS_REVOKED))
return RotationResult(outcome=RotationOutcome.REUSE_DETECTED, ...)
```

Add one test case to `test_case4_*` (or a sibling): an expired active session →
refresh → 401 with outcome INVALID, **no** `refresh_reuse_detected` audit row,
family NOT revoked.

---

## Non-blocking notes (PR-body / defer — do NOT gate the push)

- **N1 [LOW]** Bearer-mode responses now include `csrf_token: null` (and the
  legacy refresh path `csrf_token: null` / `refresh_token: null`). Functionally
  backward-compatible (the frontend ignores unknown/null fields; test 1 passes),
  but not literally byte-identical to pre-P1.1a. State this in the PR body under
  the "byte-compatible" claim so it isn't mistaken for a regression.
- **N2 [LOW]** `cookie_auth.py:30-31` computes `_ACCESS_MAX_AGE_SECONDS` /
  `_REFRESH_MAX_AGE_SECONDS` at import time, while `secure`/`httponly` are
  resolved at call time. Fine in production (env read once at import); only a
  monkeypatch of `ACCESS_TOKEN_EXPIRE_MINUTES` mid-process would go stale.
  Acceptable; note for future readers.
- **N3 [LOW, carry to PR 2B]** Rotation is not race-tolerant: two concurrent
  refreshes of the same cookie (two tabs, React StrictMode double-effect) →
  loser gets REUSE_DETECTED and the family is revoked. Inherent to strict
  rotation. PR 2B's frontend MUST single-flight refresh. Record this explicitly
  in the 2B plan.
- **N4 [LOW, accepted tradeoff]** `/logout` has no CSRF/auth gate — a forged
  cross-site POST can force-logout a logged-in admin (low severity: annoyance,
  no data exposure). SameSite=Lax already blocks the cross-site POST cookie for
  most cases. Documented in the endpoint docstring; leave as-is.
- **N5 [LOW]** CSRF is validated after the user DB load in `get_current_user`
  (`deps.py:126` load, `:146` CSRF). A CSRF-missing request still performs one
  authenticated user read. Negligible; reorder only if convenient.
- **N6 [INFO]** WS Origin check intentionally passes when Origin is absent
  (non-browser clients/tests) — documented; the ticket is the real auth, Origin
  is defense-in-depth. No change needed.

---

## Push checklist for the implementer (กติกา step 4)
1. Apply F1 + its test; re-run `tests/test_cookie_auth.py` and the full suite.
2. Add N1/N3 to the PR body (byte-compat caveat + 2B single-flight requirement).
3. Commit F1 as `fix(auth): treat expired refresh token as invalid, not reuse`.
4. Push `feat/p1.1a-cookie-backend-foundation`; open PR targeting `main` with the
   PRD/plan links, grep proofs, and the full-suite count.
