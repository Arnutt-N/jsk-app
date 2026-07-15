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
