# P0-P3 Migration Controls

These temporary controls support reversible LIFF and administrator-authentication
rollouts. Production starts in compatibility mode. Operators must record each mode
change, the observed signals, and the rollback decision in the relevant PR or change
record. Unknown values prevent application settings from loading.

| Control | Owner | Enable / advance threshold | Rollback | Removal PR |
| --- | --- | --- | --- | --- |
| `LIFF_STRICT_MODE` | Backend security owner, with LIFF frontend owner approval | Set `true` only after every inventoried LIFF client sends an ID token, token-presence is 100% for 3-5 consecutive days, staging smoke tests pass, and invalid/expired/forged-token tests pass. | Set `false`, restart the backend, and confirm fallback-use and verification-failure metrics recover. Investigate the client before retrying. | Remove the flag and unverified identity fallback after strict mode is stable for an agreed observation window and fallback use remains zero. |
| `COOKIE_AUTH_MODE` | Authentication owner, with frontend owner approval | `bearer` -> `dual` after cookie/CSRF/refresh/WebSocket tests pass. `dual` -> `cookie` only after clients no longer depend on Bearer/local-storage credentials and login, refresh, CSRF, migration, and WebSocket signals meet the PR 2A-2C acceptance thresholds. | Move one step back (`cookie` -> `dual` or `dual` -> `bearer`), restart the backend, and verify login/refresh and WebSocket recovery. | Remove the mode flag, Bearer fallback, and legacy token storage in PR 2C after the cookie-only observation window passes. |

## Allowed values and compatibility defaults

- `LIFF_STRICT_MODE=false|true`; default: `false`.
- `COOKIE_AUTH_MODE=bearer|dual|cookie`; default: `bearer`.

Thresholds that are not numerical in this document must be made numerical in the
implementation PR before a production mode change. A mode change is production
configuration and requires separate approval under the remediation execution plan.

### LIFF_STRICT_MODE wiring status (P0.2)

The flag is now wired, not just declared: `create_service_request` in
`backend/app/api/v1/endpoints/liff.py` reads `settings.LIFF_STRICT_MODE` on
every request. When an `x-liff-id-token` header is present, the token is
always verified and the verified `sub` is used as the owning `line_user_id`
regardless of the flag (a mismatching body `line_user_id` is logged as a
masked warning and ignored). When the header is absent: `LIFF_STRICT_MODE=true`
rejects the request with `401 "LIFF ID token required"` and performs no
database write; `LIFF_STRICT_MODE=false` (default) keeps the pre-existing
unverified fallback (`details.source = "LIFF-unverified"`) and logs a
`LIFF_token_missing_transition_mode` warning. That log line — never the token
or full user IDs — is the token-presence signal this document's enable
threshold refers to: aggregate its rate against total submissions to measure
the "100% for 3-5 consecutive days" gate above before flipping the flag in
production. The three LIFF pages (`service-request`, `request-v2`,
`service-request-single`) send the header as of this PR; enabling the flag
before then would break any client still on an older deployed build, which is
why the default stays `false` here.

### COOKIE_AUTH_MODE wiring status (P1.1a, PR 2A)

The flag is now wired, not just declared. `bearer` (default) is the exact
legacy code path — `POST /auth/login`/`POST /auth/refresh` never set a
cookie and never write an `auth_sessions` row; `deps.py::get_current_user`
reads the `Authorization` header only, byte-identical to pre-P1.1a
behavior. `dual` additionally sets `access_token`/`refresh_token`/
`csrf_token` cookies on login/refresh (HttpOnly, `SameSite=Lax`, `Secure`
iff `is_production_like`) while still returning both tokens in the response
body, so an already-deployed frontend keeps working unchanged; the access
cookie is tried first by `get_current_user`, falling back to the Bearer
header only when no cookie is present. `cookie` omits both tokens from the
body and rejects any refresh token that isn't backed by a live
`auth_sessions` row. New endpoints exist in every mode: `POST /auth/logout`
(clears cookies, revokes the session family), `POST /auth/migrate-session`
(Bearer-only; exchanges a Bearer access token for a cookie session; 409 in
`bearer` mode), and `POST /auth/ws-ticket` (mints a single-use, 60s ticket
for the live-chat WebSocket in place of a long-lived JWT). Refresh-token
rotation with reuse detection (mark-used-and-issue-successor; revoke the
whole session family on reuse) only applies to cookie-carried, session-backed
refresh tokens — a legacy header-carried refresh token in `dual` mode stays
on the old stateless path (no `auth_sessions` row), by design (see
`.claude/PRPs/plans/p1.1a-cookie-backend-foundation.plan.md` Task 6 GOTCHA).
CSRF double-submit (`x-csrf-token` header vs. `csrf_token` cookie, compared
with `secrets.compare_digest`) is enforced only for state-changing requests
whose auth was satisfied by the access cookie; Bearer-authenticated requests
are exempt. This PR (2A) ships the backend foundation only, dark behind the
`bearer` default — no production behavior changes until the flag is
flipped, and the frontend migration (PR 2B, switching `AuthContext`/
`authFetch`/the WebSocket client to cookies) and the Bearer-removal/
`SameSite=Strict` hardening (PR 2C) are separate, later PRs per the
bearer → dual → cookie flip checklist above.

## P0.1 production startup guards

`backend/app/core/config.py` enforces fail-closed guards via
`Settings.enforce_production_guards()`, called on the module-level settings
singleton, that run whenever `ENVIRONMENT` is production-like. Environment
matching itself fails closed (`Settings.is_production_like`): only the
recognized non-production names `development`, `dev`, `test`, `testing`, and
`local` skip the guards — `production`, `prod`, `staging` (by design, per the
remediation plan's "P0.1 → staging" rollout), and any unknown or misspelled
value all enforce. The same property gates the Swagger/OpenAPI endpoints in
`app/main.py` and denies the insecure development encryption-key fallback in
`credential_service`. Every violation is
collected into a single `RuntimeError` (never echoing the configured value) so
operators can fix all of them at once instead of discovering them one restart
at a time. The guards are deliberately a plain method rather than a pydantic
validator: a validator's `ValidationError` string appends a truncated repr of
the whole input (`input_value={...}`), which would leak secret fragments into
startup logs.

| Control | Production requirement | Failure behavior |
| --- | --- | --- |
| `DEV_AUTH_BYPASS` | Must be absent or `false` | Settings fail to load — the mock admin auth bypass in `app/api/deps.py` must never be reachable in production. |
| `SECRET_KEY` | At least 32 characters and not a known placeholder (`change_this_to_a_secure_random_string`, `changeme`, `change_this`, `secret`, `secret_key`, empty) | Settings fail to load — a weak/placeholder key would let anyone forge JWTs. |
| `LINE_LOGIN_CHANNEL_ID` | Must be set (non-blank) | Settings fail to load at startup. Independently, `verify_liff_token()` in `app/api/v1/endpoints/liff.py` also checks this before making any outbound call and returns HTTP 503 ("LIFF verification unavailable: server misconfiguration") if it drifts to blank after startup, so LIFF verification never silently posts an empty `client_id` to LINE. |
| `ENCRYPTION_KEY` | Must be set to a valid Fernet key | Settings fail to load; independently, `credential_service.validate_configuration()` (already called from the `app/main.py` lifespan) raises `RuntimeError` if the key is missing or invalid, so encrypted credential storage never falls back to the development-only insecure key in production. |

These checks are inactive only for the recognized non-production names —
development and test defaults (`ENVIRONMENT=development`, short `SECRET_KEY`,
blank `LINE_LOGIN_CHANNEL_ID`, etc.) continue to load exactly as before.
Any other `ENVIRONMENT` value (including `staging` and typos) enforces the
guards.

### Pre-deploy operator checklist (Koyeb)

Before deploying to Koyeb prod, confirm in the Koyeb service environment:

- [ ] `SECRET_KEY` is a real random value, at least 32 characters, not a placeholder.
- [ ] `LINE_LOGIN_CHANNEL_ID` is set to the real LINE Login channel ID.
- [ ] `ENCRYPTION_KEY` is set to a real Fernet key (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).
- [ ] `DEV_AUTH_BYPASS` is absent or `false`.

A weak/missing value that previously started silently now fails startup — this
is the intent of P0.1, but it must not be a surprise outage: verify the values
above BEFORE deploying, not after.
