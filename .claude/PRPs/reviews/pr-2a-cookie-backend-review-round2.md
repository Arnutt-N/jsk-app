# Review Round 2 (independent) — PR 2A Cookie Backend Foundation

**Reviewer:** Independent Round-2 (Opus 4.8) · **Date:** 2026-07-16
**PR:** #133 "PR 2A: Cookie Backend Foundation (P1.1a)"
**Branch:** `feat/p1.1a-cookie-backend-foundation` → `main` (15 commits, 27 files)
**Last commit:** `0d6a50c` — F1 fix (expired-active refresh → INVALID, not reuse)
**Verdict:** **APPROVE** — no CRITICAL/HIGH; F1 correctly fixed & tested; all remaining findings LOW/INFO (non-blocking). Merge after the non-blocking checklist is acknowledged.

> Method: I read the PRD/plan/round-1 review, then re-derived everything
> from the actual code (`git diff main...HEAD` + full current files) and my
> own greps. I did **not** trust the round-1 report or the implementer's
> claims. I could not run the WSL/pytest suite from this environment, so test
> pass/fail is taken from round-1's re-run (11 passed) and my own static
> verification of what each test *asserts*; all security/correctness
> conclusions below are from reading the source, not from a green run.

---

## 1. Independently-verified security grep proofs (re-run by me)

| Proof | Command (re-run) | Result |
|---|---|---|
| All `token_hash` assignments go through `_hash()`/`hashlib` (no raw secret persisted) | `git grep -n "token_hash" -- auth_session_service.py models/auth_session.py models/ws_ticket.py test_cookie_auth.py` | Every **assignment** routes through `_hash(...)` (svc:93, 118, 145, 233, 258) → `hashlib.sha256().hexdigest()`. Lines 178/263 are `WHERE token_hash ==` *lookups* against the precomputed hash, not assignments. The one test usage (test:707) calls `hashlib.sha256(...).hexdigest()` directly, matching `_hash`. ✅ **Zero raw tokens/jtis/tickets persisted.** |
| `compare_digest` used for the one same-process raw-string compare | `git grep -n "compare_digest" -- backend/app` | Exactly one functional usage: `deps.py:149` (CSRF header-vs-cookie). The 3 hits in `auth_session_service.py` are docstring explaining *why* it is correctly NOT used there (SQL hash lookups have no in-process timing channel). ✅ |
| No logger prints a raw token/secret in the auth files | `git grep -nE "logger\.(info\|warning\|error\|debug)" -- auth.py auth_session_service.py cookie_auth.py ws_live_chat.py` | **Zero** logger calls in `auth.py` / `auth_session_service.py` / `cookie_auth.py`. `ws_live_chat.py` loggers print only `user.id` / `admin_id` / exception objects (see NEW-1 for the one nuance on the ValidationError line). ✅ |
| No raw secret in audit `details` | `git grep -nE "details=\{" -- auth.py` | All 9 audit rows use `{"username_masked": …}` (2-char mask), `{"family_id": <uuid>}` (identifier, not a credential), or `{}` (ws_ticket_mint — deliberately empty). No raw token / jti / ticket / csrf / password anywhere. ✅ |
| Frontend untouched | `git diff --stat main...HEAD -- frontend/` | (not in the 27-file stat) empty. ✅ (round-1 also verified) |

---

## 2. F1 re-verification (the round-1 MEDIUM fix) — CONFIRMED CORRECT & COMPLETE

**File:** `backend/app/services/auth_session_service.py:103-208` (`rotate_refresh_session`)

The three-case fallback after the atomic claim misses is now exhaustive and
mutually exclusive:

```
claim = UPDATE auth_sessions SET status=rotated, last_used_at=now
        WHERE token_hash=hash AND status=active AND expires_at>now RETURNING …
if claimed:                       -> ROTATED (insert successor, set replaced_by_id)
else SELECT by token_hash:
  (a) existing is None            -> INVALID            (never existed / cleaned up)
  (b) active AND expires_at<=now  -> INVALID   <- F1 NEW (ordinary past-TTL expiry)
  (c) status in (rotated/revoked) -> REUSE_DETECTED + revoke family
```

- **Prevents the false alert:** case (b) returns `INVALID` **without** calling
  the family-revoke `UPDATE` and **without** the caller writing
  `refresh_reuse_detected` (auth.py:262-276 only writes that audit row on
  `REUSE_DETECTED`). So a benign 8-day-later refresh no longer pollutes the
  alert-on-any reuse metric. ✅
- **Preserves genuine reuse detection:** case (c) still revokes every `active`
  row in the family and returns `REUSE_DETECTED`. ✅ Verified by
  `test_case4_rotation_…` which asserts reuse of the rotated token -> 401,
  **no `STATUS_ACTIVE` remains**, `refresh_reuse_detected` audit == 1, **and**
  the successor token is also unusable (family revoked). This catches the
  "stolen-but-rotated token can't spawn a successor" property — a real security
  assertion, not a status code.
- **Edge correctness:** the only way a row is `active`+`expired` is "issued,
  never rotated, TTL elapsed" — rotation always flips to `rotated`, so an
  active+expired row was never consumed -> presenting it is an expiry, never
  reuse. The classification is sound. ✅
- **No `last_used_at` touch on case (b):** the row stays `active`+`expired` and
  is later removed by the 30-day opportunistic delete. Harmless. ✅

**The F1 test (`test_case4_expired_active_refresh_is_invalid_not_reuse`)
genuinely asserts the security properties**, not just a 401:
- back-dates the DB row's `expires_at` to `now-5min` while the JWT `exp` stays
  `~now+7d` (so `verify_token` passes and the request reaches
  `rotate_refresh_session`) — mirrors the real trigger (DB `expires_at` written
  before JWT `exp`, both = `now+7d`, so the DB row expires a moment earlier);
- asserts `refresh_reuse_detected` audit count == **0**;
- asserts `STATUS_REVOKED` **not in** statuses (family NOT revoked);
- asserts exactly **1** `STATUS_ACTIVE` (the row is not flipped).

**F1 verdict: correctly fixed and adequately tested.** ✅

---

## 3. Findings table

| # | Sev | File:line | Issue | Fix |
|---|---|---|---|---|
| F1 | — (resolved) | auth_session_service.py:189-190 | Expired-active refresh falsely flagged as reuse | **Already fixed in `0d6a50c`.** Re-verified correct (§2). |
| N1 | LOW | schemas/auth.py:26,35 (auth.py login/refresh/me) | Bearer-mode responses now include `"csrf_token": null` (new field on `AuthUserResponse`/`TokenResponse`). Functionally backward-compatible (frontend ignores null/unknown), but **not literally byte-identical** to pre-P1.1a as the PRD invariant (line 33) worded it. Schema diff confirms `refresh_token: null` pre-existed, so the *only* new shape change is `csrf_token: null` on login/refresh/me. | State the caveat explicitly in the PR body under the "byte-compatible" claim (round-1's recommendation). Do **not** add `exclude_none=True` naively — it would also drop the pre-existing `refresh_token: null` and break byte-compat the other way. Acceptable as-is. |
| N2 | LOW | cookie_auth.py:30-31 | `_ACCESS_MAX_AGE_SECONDS` / `_REFRESH_MAX_AGE_SECONDS` computed at import time; `secure`/`httponly` resolved at call time. Only a mid-process monkeypatch of `ACCESS_TOKEN_EXPIRE_MINUTES` goes stale. | Note for future readers; no change needed (env read once at import in prod). |
| N3 | LOW (carry to PR 2B) | auth_session_service.py:120-130 | Strict rotation is not race-tolerant: two concurrent refreshes of the same cookie (two tabs / React StrictMode double-effect) -> loser hits case (c) -> `REUSE_DETECTED` + family revoked. Inherent to strict rotation, **not a new bug**. | PR 2B frontend MUST single-flight refresh. Record in the 2B plan. |
| N4 | LOW (accepted) | auth.py:337-382 (`/logout`) | No CSRF/auth gate; a forged cross-site POST can force-logout. Low severity (annoyance, no data exposure) and SameSite=Lax (set in this PR) already blocks the cross-site POST cookie, so the family-revoke can't even fire cross-site. Idempotent. | Leave as-is (documented in docstring); accepted tradeoff. |
| N5 | LOW | deps.py:126 vs :146 | CSRF validated **after** the user DB load, so a cookie-sourced request with a missing/wrong CSRF token still incurs one authenticated user read before the 403. Negligible (no real oracle — the requester already holds the valid access cookie). | Reorder only if convenient; not required. |
| N6 | INFO | ws_live_chat.py:247-251 | WS Origin check passes when Origin is absent (non-browser clients/tests) or allowlist is empty. Browsers always send Origin on WS handshakes, so cross-site browser CSWSH is still rejected; the ticket is the real auth and Origin is defense-in-depth. | No change; documented. |
| NEW-1 | LOW | ws_live_chat.py:171 | `logger.warning(f"Auth payload validation failed: {e}")` logs `str(ValidationError)` raw. Pydantic V2's default `ValidationError.__str__` renders the failing `input_value=…`, so a **malformed/oversized** token (`max_length=2000`) or ticket (`max_length=200`) submitted via the WS auth message can be written to the warning log. The logger line itself is **pre-existing** (the diff shows it unchanged), but this PR broadens the trigger (`has_credential` now also fires on `ticket`, and the `ticket` field is new). Practical risk is low: valid credentials are well under the length limits and don't trigger validation errors, so only malformed inputs get logged. | **Non-blocking.** Cheap future fix for PR 2C: log only `[(e["type"], e["loc"]) for e in err.errors()]`, or `Field(..., hide_input=True)` on `AuthPayload.token`/`ticket`, instead of `{e}`. |
| NEW-2 | LOW/INFO | auth_session_service.py:239-248 | Opportunistic retention `DELETE … WHERE expires_at < now - retention` runs on **every** ws-ticket mint, and `expires_at` is **not indexed** (only `token_hash`/`user_id`/`family_id` are) -> a per-mint sequential scan as `auth_sessions` grows. PRD explicitly accepts "best-effort batched delete piggybacked on ticket mint/refresh" and defers the real retention job to P1.6, so this is an accepted tradeoff. | Non-blocking. Consider indexing `expires_at` or moving cleanup to the P1.6 scheduler-leadership job. |
| NEW-3 | INFO | ws_live_chat.py:46 (`_load_and_authorize_ws_user`) | WS auth role allowlist `{ADMIN, SUPER_ADMIN, AGENT}` is **narrower** than the login/refresh allowlist `_ADMIN_AUTH_ROLES = {SUPER_ADMIN, ADMIN, DIRECTOR, HEAD, AGENT}`. So DIRECTOR/HEAD can log into the admin console (and `test_auth_login.py` asserts they can refresh) but **cannot** authenticate to the live-chat WebSocket. **Pre-existing** — the refactor preserved the exact same role set from the old inline code (diff confirms) — and out of scope for this PR. | Confirm with the team whether DIRECTOR/HEAD are expected to use live chat; if so, that is a separate pre-existing gap for a future PR. No change in this PR. |

**Severity counts:** CRITICAL 0 · HIGH 0 · MEDIUM 0 (F1 resolved) · LOW 7 (N1–N5, NEW-1, NEW-2) · INFO 2 (N6, NEW-3).

---

## 4. N1–N6 re-assessment (did round-1 get them right?)

| ID | Round-1 class | My independent re-assessment | Agree? |
|---|---|---|---|
| N1 | LOW | Real & correctly classified. Sharpened: schema diff proves `refresh_token:null` pre-existed, so the *only* new bearer-mode shape change is `csrf_token:null` on login/refresh/me. The PRD's literal "byte-identical" invariant is **not** met; only the weaker acceptance criterion "zero behavioral diff" is. | ✅ Agree (LOW); add the precision above. |
| N2 | LOW | Real; correctly classified. Import-time vs call-time split is harmless in prod. | ✅ Agree. |
| N3 | LOW, carry to 2B | Real; correctly classified. Inherent to strict rotation, not introduced here. `UPDATE…RETURNING` makes the *single* claim atomic; the race is between two separate requests, not within one. | ✅ Agree. |
| N4 | LOW, accepted | Real; correctly classified. SameSite=Lax (set in this PR) actually mitigates further than round-1 stated — the cross-site POST cookie is blocked, so the forged logout can't even revoke the victim's family. | ✅ Agree (slightly lower risk than stated). |
| N5 | LOW | Real; correctly classified. No usable oracle (requester already holds the valid access cookie). | ✅ Agree. |
| N6 | INFO | Real; correctly classified. Browsers always send Origin on WS, so the absent-Origin pass only benefits non-browser clients; the ticket is the real auth. | ✅ Agree. |

**Round-1's N-classification was accurate on all six.** Nothing was mis-classified.

---

## 5. Additional verification (things I checked that round-1 didn't itemize)

- **CSRF design is sound and *better* than a plain double-submit.** The CSRF
  cookie is **HttpOnly** (cookie_auth.py:43,71-75), so JS can't read it. JS
  instead receives the value via the **response body** (`csrf_token` on
  login/refresh/migrate-session; `/auth/me` echoes it from the cookie,
  auth.py:506-509). The server then `compare_digest`s the JS-sent
  `x-csrf-token` header against the HttpOnly cookie. An attacker cross-site
  can't read the HttpOnly cookie (can't forge the header) and can't read the
  body value (it lives in the victim's JS memory, not cross-origin
  accessible). Body value == cookie value (same `issue_csrf_token()` result is
  both set as cookie and returned in body). ✅
- **Rotation atomicity.** The claim is a single `UPDATE … WHERE status=active
  AND expires_at>now RETURNING …`; the `status=active` predicate means only one
  of two concurrent claims on the same token can succeed (the first flips it to
  `rotated`). ✅ Unique index on `token_hash` + fresh `uuid4` jti per successor
  => no hash collision on rotation. ✅
- **WS ticket single-use.** `claim_ws_ticket` is `UPDATE … WHERE used_at IS
  NULL AND expires_at>now RETURNING user_id` (atomic). The WS endpoint
  **commits the claim before the role check** (ws_live_chat.py:121-125) so
  single-use persists even if authorization then fails — the comment calls this
  out explicitly. Test asserts 2nd claim -> None and expired -> None. ✅
- **Origin check is pre-accept.** `websocket.close(1008)` + `return` runs
  **before** `ws_manager.connect(websocket)` (ws_live_chat.py:247-253). Test
  asserts evil origin -> `WebSocketDisconnect` code 1008; allowed origin ->
  connects. ✅
- **Bearer short-circuits are correct & byte-compatible (modulo N1).**
  - `deps.get_current_user`: in `bearer` mode the cookie branch is skipped
    (`if mode in (dual,cookie)`), so a stray access cookie is ignored (test 1
    asserts this). Presence-based: an invalid cookie in dual mode 401s with no
    fallback to bearer (test 2 asserts garbage cookie + valid bearer -> 401).
  - `login` bearer path: `create_refresh_token(subject=user.id)` (no jti/family
    => byte-identical JWT), no `set_auth_cookies`, `csrf_token=None`. Test 1
    asserts no Set-Cookie + 0 auth_sessions rows.
  - `refresh` bearer path: legacy stateless — issues only a new access token,
    no rotation, no session row. Test 5 asserts dual header-refresh stays
    stateless (0 sessions) and cookie mode rejects header refresh (401).
  - DEV_AUTH_BYPASS branch unchanged (only entered when `not token`); test 3
    disables it to exercise the real 401. ✅
- **Migration (`w3x4y5z6a7b8`).** Hand-written, `_has_table` existence guards
  (idempotent, house style). Columns/types/indexes match both models exactly
  (auth_sessions: id PK, user_id FK+idx, family_id str36+idx, token_hash
  str64 unique+idx, status str16 default 'active', expires_at timestamptz NN,
  created_at timestamptz default now(), last_used_at timestamptz nullable,
  replaced_by_id self-FK nullable; ws_tickets: id PK, user_id FK+idx,
  token_hash str64 unique+idx, expires_at NN, used_at nullable, created_at
  default now()). `down_revision="v2w3x4y5z6a7"`; I traced the full revision
  graph — `v2w3x4y5z6a7` is a single head on main and nothing else branches
  from it, so `w3x4y5z6a7b8` is the **single new head** (no multi-head).
  `downgrade()` drops both tables (additive-only, safe — nothing references
  them yet). ✅ No data loss.
- **Test quality is genuinely high.** Tests assert security properties, not
  just HTTP codes: audit-row **counts** by action (reuse_detected==0 for F1,
  ==1 for real reuse), session **status enums** (active/rotated/revoked
  sets), cookie **attributes** parsed from raw Set-Cookie (path/secure/
  httponly/samesite match between set & clear, max_age=0 on delete),
  single-use (2nd claim None), family revocation (successor unusable after
  reuse), rate-limit 6th-call 429, bearer 409 on migrate, cookie-only 401 on
  migrate. Cookie-jar GOTCHA is handled by `_clear()` before every
  cookie-sensitive request. FR1–FR9 all covered. ✅

---

## 6. What round-1 MISSED (new, independently found)

1. **NEW-1 (LOW)** — the raw `logger.warning(f"… {e}")` of a Pydantic
   `ValidationError` in the WS auth path can write a submitted token/ticket
   into the log on a malformed payload (Pydantic V2 includes `input_value` in
   `str(ValidationError)` by default). Pre-existing line, surface broadened
   by the new `ticket` field. Low practical risk; cheap PR-2C fix. (§3 table.)
2. **NEW-2 (LOW/INFO)** — the per-mint opportunistic retention DELETEs scan
   `expires_at` which is unindexed; accepted PRD tradeoff but worth a future
   index / P1.6 scheduler move. (§3 table.)
3. **NEW-3 (INFO)** — WS role allowlist excludes DIRECTOR/HEAD while
   login/refresh include them; pre-existing, out of scope, but surfaced
   because the PR touches this code and the test suite broadened login to
   DIRECTOR/HEAD. (§3 table.)

Nothing round-1 missed rises above LOW. I found **no** logic error, injection,
missing authz, resource leak, or config issue that blocks merge.

---

## 7. Verdict

**APPROVE.**

- F1 (the only round-1 fix-gate) is correctly and completely resolved, with a
  test that asserts the security properties (no false reuse alert, no family
  revoke) — not just a status code.
- All security grep proofs hold under my own re-run (hash-only persistence,
  constant-time CSRF compare, no secret logging, no secret in audit details).
- Bearer mode is byte-compatible modulo the single documented `csrf_token:
  null` addition (N1); behavior is unchanged.
- Migration is clean, additive, single-head, reversible.
- Test coverage genuinely asserts security properties across FR1–FR9.
- The 3 new findings (NEW-1/2/3) and N1–N6 are all LOW/INFO and non-blocking.

No CRITICAL, no HIGH, no open MEDIUM.

---

## 8. Merge checklist for the implementer (non-blocking; do not gate the push)

- [ ] **PR body:** state the N1 caveat explicitly — "bearer mode is
      behaviorally byte-compatible; the only wire-shape change is a new
      `csrf_token: null` field on login/refresh/me responses (frontend
      ignores null/unknown fields)."
- [ ] **PR body / 2B plan:** record N3 — PR 2B frontend MUST single-flight
      refresh to avoid the strict-rotation race revoking the family.
- [ ] **Optional now, recommended for PR 2C:** replace
      `logger.warning(f"Auth payload validation failed: {e}")`
      (ws_live_chat.py:171) with a redacted form (log only error `type`/`loc`,
      or `Field(..., hide_input=True)` on `AuthPayload.token`/`ticket`) so a
      malformed WS auth payload can't write a credential fragment to the log.
- [ ] **Future (P1.6):** move the opportunistic `auth_sessions`/`ws_tickets`
      retention cleanup to the scheduler job (or index `expires_at`) instead
      of the per-mint sequential scan (NEW-2).
- [ ] **Confirm with team (separate, pre-existing):** should DIRECTOR/HEAD be
      able to use the live-chat WebSocket? If yes, widen
      `_load_and_authorize_ws_user`'s role set in a follow-up (NEW-3) — out of
      scope for this PR.
- [ ] Record the full-suite pass count in the PR body (round-1 saw
      `tests/test_cookie_auth.py` -> 11 passed in WSL; re-run the whole suite
      on push).


---



