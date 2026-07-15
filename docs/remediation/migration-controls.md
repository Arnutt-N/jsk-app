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
