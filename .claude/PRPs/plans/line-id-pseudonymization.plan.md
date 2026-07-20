# Plan: LINE User ID Pseudonymization — PR A (Expand) + PR B (Cutover) Outline

## Summary
PR A (Expand): เพิ่มโครงสร้าง pseudonymization แบบ additive — `users.line_user_id_hash`
(HMAC-SHA256, unique) + `users.line_user_id_encrypted` (Fernet) + `users.line_key_version`,
เพิ่ม `user_id` FK → `users.id` บน 6 ตารางลูก, สร้าง `user_identity_service` สำหรับ
resolve/decrypt, ต่อ webhook ingress + outbound LINE push ผ่าน service, เขียนแบบ
**dual-write** (plaintext + surrogate พร้อมกัน) — ทั้งหมด dark-shipped behind
`LINE_ID_STORAGE_MODE=plaintext` (default) ซึ่งทำให้ทุก request/response byte-identical กับปัจจุบัน.
Backend only; frontend/API/WS contract ไม่เปลี่ยน. PR B (Cutover) outline ต่อท้าย.

## User Story
As a system owner / DPO responsible for PDPA compliance, I want raw LINE user IDs
pseudonymized and encrypted at rest (concentrated in one protected place instead of
plaintext across 7 tables), so that a database leak no longer directly exposes the
personal identifier of every citizen — without any change to how the system behaves.

## Problem → Solution
Raw `line_user_id` plaintext กระจาย 7 ตาราง (541 backend refs) → storage-layer
pseudonymization: `users.id` เป็น internal surrogate, raw ID เก็บ encrypted+hashed บน
`users` เท่านั้น, ตารางลูก FK → `users.id`, dark-ship + flag rollout (expand→migrate→contract).

## Metadata
- **Complexity**: XL (backend-only, ~12 files PR A, 7-table migration, real-data backfill ใน PR B)
- **Source PRD**: `.claude/PRPs/prds/line-id-pseudonymization.prd.md`
- **PRD Phase**: PR A = Phase A (Expand); PR B = Phase B (Migrate/Cutover) — plan นี้ครอบ A เต็ม + B outline; Phase C (Contract/drop column) = แยก plan
- **Branch**: `feat/line-id-pseudonymization-expand` from `main` (PR A)
- **Estimated Files**: PR A ~10 modified + 2 created; PR B ~15 modified + 1 script

## UX Design
N/A — internal backend storage change. Admin UI / API / WS behavior unchanged until
(optional) Approach 1 display-masking PR. Acceptance requires `git diff --stat main -- frontend/` = empty.

---

## Mandatory Reading (before writing any code)

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `.claude/PRPs/prds/line-id-pseudonymization.prd.md` | all | Requirements; capability #1-#10 referenced below |
| P0 | `backend/app/services/credential_service.py` | 1-90 | Fernet `_get_cipher()` / encrypt / decrypt you reuse; prod fail-closed guard |
| P0 | `backend/app/services/friend_service.py` | 1-60 | `get_or_create_user(line_user_id, db)` you are replacing with identity service |
| P0 | `backend/app/api/v1/endpoints/webhook.py` | 271-300 | `handle_message_event` — `event.source.user_id` ingress (canonical insertion point) |
| P0 | `backend/app/services/line_service.py` | 180-260 | `push_messages` / `save_message` — outbound needs plaintext |
| P0 | `backend/app/models/user.py` | 39-82 | `User` model — `line_user_id` unique/indexed you are augmenting |
| P0 | `backend/app/core/config.py` | 50-70, 160-170 | `ENCRYPTION_KEY`, `is_production_like`, `enforce_production_guards` style |
| P1 | `backend/alembic/versions/v2w3x4y5z6a7_unique_open_chat_session.py` | all | migration house style: hand-written, existence guards, pre-flight, revision chain |
| P1 | `backend/app/models/chat_session.py` | 18-53 | partial-unique index `uq_chat_sessions_one_open_per_line_user` you must preserve (recreate on `user_id` in PR C) |
| P1 | `backend/app/models/user_rich_menu_link.py` | 6-32 | unique `line_user_id` → unique `user_id` (PR C) |
| P1 | `.claude/PRPs/plans/p1.1a-cookie-backend-foundation.plan.md` | all | the flag-rollout + dark-ship precedent (COOKIE_AUTH_MODE) — mirror its discipline |
| P2 | `backend/app/models/{message,service_request,friend_event,csat_response}.py` | each `line_user_id` line | the 4 remaining child tables gaining `user_id` FK |
| P2 | `backend/tests/test_friend_service.py` | all | `get_or_create_user` test idiom you extend |
| P2 | `backend/tests/conftest.py` | all | `test_client` fixture semantics (session-scoped) |

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| Fernet symmetric encryption | `cryptography` docs | Fernet token = urlsafe-base64 (iv‖ciphertext‖hmac); decrypt is fast (~µs); key is 32 url-safe bytes |
| HMAC for keyed hashing | Python `hmac` + `hashlib` | `hmac.new(key, msg, sha256).hexdigest()` — deterministic, keyed; use a secret key, never plain SHA-256 for identifiers |
| Expand-contract migration | Pramod Sadalage / "Parallel Change" | add new structure → migrate data → switch reads → remove old; reversible until final remove step |

No other external research needed — everything else is established internal patterns.

---

## Patterns to Mirror

### FERNET_CIPHER (reuse existing — do NOT create a second cipher)
```python
# SOURCE: backend/app/services/credential_service.py:51-79,237
from app.services.credential_service import credential_service  # singleton instance

# Access the cipher via the singleton (it lazily validates ENCRYPTION_KEY):
cipher = credential_service._get_cipher()
token = cipher.encrypt(raw_line_id.encode()).decode()   # line_user_id_encrypted
raw   = cipher.decrypt(token.encode()).decode()
```
Reuse the SAME `ENCRYPTION_KEY`-backed cipher singleton. `_get_cipher` is a private method
on the `CredentialService` class — add two thin public helpers in `credential_service.py`
(`encrypt_line_id(raw: str) -> str` / `decrypt_line_id(token: str) -> str`) that delegate
to `_get_cipher()`, so `user_identity_service.py` never touches the private method directly.

### HMAC_LOOKUP (keyed, deterministic)
```python
import hmac, hashlib
def line_id_hash(raw: str) -> str:
    return hmac.new(
        settings.LINE_ID_HMAC_KEY.encode(),
        raw.encode(),
        hashlib.sha256,
    ).hexdigest()   # 64-char hex → String(64)
```
Deterministic so the same raw ID always maps to the same hash (required for O(1) lookup).
Keyed (not plain SHA-256) so a DB leak alone can't brute-force the hash.

### MIGRATION_GUARDS (hand-written, never autogenerate)
```python
# SOURCE: backend/alembic/versions/v2w3x4y5z6a7_unique_open_chat_session.py:28-35
def _column_exists(connection, table: str, column: str) -> bool:
    return sa.inspect(connection).has_table(table) and \
           column in [c["name"] for c in sa.inspect(connection).get_columns(table)]
def upgrade() -> None:
    connection = op.get_bind()
    if _column_exists(connection, "users", "line_user_id_hash"):
        return
    ...
```
Autogenerate is FORBIDDEN — ORM/live-schema drift (broadcasts, geography) would emit
unrelated diffs (same GOTCHA as p1.1a Task 1).

### TZ_AWARE_DATETIME
```python
# SOURCE: backend/app/models/audit_log.py:25-29
created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
```
Any new timestamp column MUST be `DateTime(timezone=True)`.

### PRODUCTION_GUARD_STYLE (fail-closed, never echo secrets)
```python
# SOURCE: backend/app/core/config.py:160-170 (enforce_production_guards)
if self.is_production_like and not self.LINE_ID_HMAC_KEY:
    violations.append("LINE_ID_HMAC_KEY must be set in production")
# raise RuntimeError with the violation list; never print the key value
```

### MODE_FLAG (mirror COOKIE_AUTH_MODE rollout discipline)
```python
# SOURCE: backend/app/core/config.py:40
LINE_ID_STORAGE_MODE: Literal["plaintext", "dual", "pseudonym"] = "plaintext"
```
- `plaintext` (default, PR A ships here): read/write plaintext column as today; ALSO dual-write surrogate so it gets populated. Behavior byte-identical.
- `dual`: write both; reads may use either (validation window).
- `pseudonym` (PR B target): reads use `user_id`/hash; responses decrypt; plaintext column ignored (still present until PR C).

---

## Files to Change (PR A — Expand)

| File | Action | Justification |
|---|---|---|
| `backend/app/core/config.py` | UPDATE | `LINE_ID_HMAC_KEY: str = ""`, `LINE_ID_STORAGE_MODE` literal, prod guard for HMAC key |
| `backend/app/services/credential_service.py` | UPDATE | + public `encrypt_line_id(raw) -> str` / `decrypt_line_id(token) -> str` helpers delegating to `_get_cipher()` |
| `backend/app/models/user.py` | UPDATE | + `line_user_id_hash` String(64) unique index nullable; + `line_user_id_encrypted` Text nullable; + `line_key_version` Integer default 1 |
| `backend/app/models/message.py` | UPDATE | + `user_id` Integer FK `users.id` nullable index |
| `backend/app/models/chat_session.py` | UPDATE | + `user_id` Integer FK `users.id` NOT NULL index (after backfill; nullable at PR A) |
| `backend/app/models/service_request.py` | UPDATE | + `user_id` Integer FK `users.id` nullable index |
| `backend/app/models/friend_event.py` | UPDATE | + `user_id` Integer FK `users.id` NOT NULL (nullable at PR A) index |
| `backend/app/models/csat_response.py` | UPDATE | + `user_id` Integer FK `users.id` NOT NULL (nullable at PR A) index |
| `backend/app/models/user_rich_menu_link.py` | UPDATE | + `user_id` Integer FK `users.id` (unique enforced in PR C) index |
| `backend/alembic/versions/b3c4d5e6f7g8_line_id_pseudonym_expand.py` | CREATE | additive: 3 columns on users + `user_id` on 6 tables + indexes (NOT the unique/partial-unique yet — those move in PR C) |
| `backend/app/services/user_identity_service.py` | CREATE | `resolve_or_create_by_line_id`, `decrypt_line_id`, `line_id_hash`, key-version helpers |
| `backend/app/services/friend_service.py` | UPDATE | `get_or_create_user` delegates to identity service; dual-write surrogate |
| `backend/app/api/v1/endpoints/webhook.py` | UPDATE | resolve `event.source.user_id` → `User` via identity service; pass `user.id` where it writes child rows (dual-write keeps `line_user_id` too) |
| `backend/app/services/line_service.py` | UPDATE | `push_messages`/`save_message` accept resolved user; decrypt raw ID for the LINE API call |
| `backend/tests/test_user_identity.py` | CREATE | capability #1-#6 matrix (resolve/create/dedup/decrypt/hash-stability/mode behavior) |
| `docs/remediation/migration-controls.md` | UPDATE | document `LINE_ID_STORAGE_MODE` + flip checklist (mirror COOKIE_AUTH_MODE section) |

## NOT Building (PR A)
- Any `frontend/` change. Acceptance: `git diff --stat main -- frontend/` empty.
- Backfill of EXISTING rows (PR B). PR A only populates surrogate for NEW writes (dual-write) + new users.
- Cutover of reads/queries to `user_id`/hash (PR B). PR A reads still use plaintext `line_user_id`.
- Dropping the plaintext `line_user_id` column or moving the unique/partial-unique indexes (PR C).
- API response decryption (PR B). PR A responses still read the plaintext column.
- Display masking in UI (Approach 1 — separate PR).
- Key-rotation automation (only `key_version` column + documented manual procedure).
- WS protocol / regex validator changes (NEVER in 4A — boundary stays raw).

---

## Step-by-Step Tasks (PR A — Expand)

### Task 1: Config + production guard
- **ACTION**: Add `LINE_ID_HMAC_KEY`, `LINE_ID_STORAGE_MODE` to `Settings`; enforce HMAC key in prod.
- **IMPLEMENT**:
  - `LINE_ID_HMAC_KEY: str = ""` (config.py near `ENCRYPTION_KEY:57`).
  - `LINE_ID_STORAGE_MODE: Literal["plaintext", "dual", "pseudonym"] = "plaintext"` (mirror `COOKIE_AUTH_MODE:40`).
  - in `enforce_production_guards`: if `is_production_like and not LINE_ID_HMAC_KEY` → add violation. Also warn (not fail) if mode != `plaintext` and `ENCRYPTION_KEY` unset. Never echo key values.
  - Note: `CURRENT_LINE_KEY_VERSION = 1` lives in `user_identity_service.py` (code constant, not env config).
- **MIRROR**: PRODUCTION_GUARD_STYLE, MODE_FLAG.
- **GOTCHA**: dev fallback — allow a fixed dev HMAC key ONLY when `not is_production_like` (mirror credential_service dev fallback at `credential_service.py:70`), but guard it so prod can never use it.
- **VALIDATE**: `python -m pytest tests/ -k "config or guard" -x`; manual: unset key + `is_production_like=True` → RuntimeError.

### Task 2: Models — users + 6 child tables
- **ACTION**: Add the 3 column on `User` and `user_id` FK on the 6 child models.
- **IMPLEMENT**:
  - `user.py`: `line_user_id_hash = Column(String(64), unique=True, index=True, nullable=True)`; `line_user_id_encrypted = Column(Text, nullable=True)`; `line_key_version = Column(Integer, nullable=False, default=1, server_default="1")`. Keep existing `line_user_id` untouched (PR A).
  - each child: `user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)` (nullable at PR A; PR B backfills then PR C tightens where appropriate). `messages.user_id` stays nullable permanently (system messages).
  - add `relationship()` only if it doesn't create import cycles — otherwise skip (services query via `select()`).
- **MIRROR**: existing column style in each file; TZ_AWARE_DATETIME if adding timestamps (none needed here).
- **GOTCHA**: do NOT remove/alter the existing `line_user_id` column or its indexes — PR A is purely additive. `User.line_user_id` stays `unique=True` for now.
- **VALIDATE**: models import cleanly (`python -c "import app.models"`); no migration yet (Task 3).

### Task 3: Migration (expand, additive, hand-written)
- **ACTION**: Alembic revision adding the new columns + indexes; chain off current head `a2b3c4d5e6f7`.
- **IMPLEMENT**:
  - revision id `b3c4d5e6f7g8`, `down_revision = "a2b3c4d5e6f7"`, filename `b3c4d5e6f7g8_line_id_pseudonym_expand.py`.
  - `upgrade()`: existence-guarded `op.add_column` for each new column; `op.create_index` for `ix_users_line_user_id_hash` (unique) + `ix_<table>_user_id` on the 6 tables. Do NOT create the partial-unique/unique-on-user_id yet (PR C).
  - `downgrade()`: drop indexes then column (additive → safe reverse).
  - pre-flight: if `line_user_id_hash` already exists → return (idempotent re-run).
- **MIRROR**: MIGRATION_GUARDS, house style of `v2w3x4y5z6a7`.
- **GOTCHA**: hand-write only — autogenerate pulls unrelated drift. FK `user_id → users.id` must reference the correct table name.
- **VALIDATE**:
  ```bash
  wsl -d Ubuntu -- bash -lc 'cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python scripts/db_target.py alembic --target local upgrade head && python scripts/db_target.py alembic --target local downgrade -1 && python scripts/db_target.py alembic --target local upgrade head'
  ```
  (set `ENV_FILE=app/.env` — memory: default env loads PROD).

### Task 4: user_identity_service.py (หัวใจ)
- **ACTION**: Create the identity resolution + crypto service (free functions taking `db: AsyncSession`, mirror `create_audit_log` style).
- **IMPLEMENT**:
  ```python
  CURRENT_LINE_KEY_VERSION = 1  # module constant (not config — code version, not env)

  def line_id_hash(raw: str) -> str: ...            # HMAC_LOOKUP pattern
  def _encrypt_line_id(raw: str) -> str: ...        # Fernet via credential_service singleton
  def _decrypt_line_id(token: str) -> str: ...

  async def resolve_by_line_id(db, raw: str) -> Optional[User]:
      """Find user by HMAC hash; fallback to legacy plaintext column (pre-backfill)."""
      h = line_id_hash(raw)
      user = (await db.execute(select(User).where(User.line_user_id_hash == h))).scalar_one_or_none()
      if user: return user
      # legacy fallback: existing users pre-backfill have NULL hash
      user = (await db.execute(select(User).where(User.line_user_id == raw))).scalar_one_or_none()
      if user:
          # lazily populate surrogate on first sight
          user.line_user_id_hash = h
          user.line_user_id_encrypted = _encrypt_line_id(raw)
          user.line_key_version = CURRENT_LINE_KEY_VERSION
          await db.flush()
      return user

  def populate_surrogate(user: User, raw: str) -> None:
      """Set hash/encrypted/key_version on a User object (caller flushes/commits)."""
      user.line_user_id_hash = line_id_hash(raw)
      user.line_user_id_encrypted = _encrypt_line_id(raw)
      user.line_key_version = CURRENT_LINE_KEY_VERSION

  async def decrypt_line_id_for_user(db, user_id: int) -> str:
      """Decrypt raw LINE ID from users.line_user_id_encrypted; fallback to plaintext column if NULL."""
  ```
  - **Design decision**: `resolve_by_line_id` does NOT create users. User creation (with LINE profile fetch: `display_name`, `picture_url`, `friend_status`, `friend_since`) stays in `friend_service.get_or_create_user` — that logic is non-trivial (LINE API call + fallback) and must not be duplicated. The identity service handles only: (1) HMAC/Fernet crypto, (2) hash-based lookup with legacy fallback, (3) surrogate population on existing users.
  - `get_or_create_user` flow becomes: `resolve_by_line_id(db, raw)` → if found, return; if None → create User (with profile fetch as today) + call `populate_surrogate(user, raw)` before `db.add(user)`.
  - The legacy-plaintext fallback in `resolve_by_line_id` is CRITICAL for the dual period: existing users (pre-backfill) have NULL hash, so we must still find them by `line_user_id` and lazily populate hash/encrypted on first sight.
- **MIRROR**: HMAC_LOOKUP, FERNET_CIPHER; SQLAlchemy 2.0 `select()` style.
- **GOTCHA**: caller owns the commit (mirror friend_service / AUDIT_WRITE). Service only flushes. Race conditions: (1) two concurrent webhooks for a brand-new user → unique `line_user_id_hash` catches the dup in `get_or_create_user`; wrap insert in try/except IntegrityError → re-select. (2) two concurrent `resolve_by_line_id` calls find the same NULL-hash user by plaintext and both try to set the hash → unique constraint raises IntegrityError on the second flush; wrap the lazy-populate flush in try/except IntegrityError → re-select by hash (the first writer already populated it). `populate_surrogate` is idempotent (overwrites with same values).
- **VALIDATE**: Task 8 tests 1-4.

### Task 5: Webhook ingress uses identity service (dual-write)
- **ACTION**: `handle_message_event` / `handle_follow_event` still call `friend_service.get_or_create_user` (which now internally uses `resolve_by_line_id` + `populate_surrogate` — Task 6); child-row writes set BOTH `line_user_id` (as today) AND `user_id` (new).
- **IMPLEMENT**:
  - No direct import of identity service in webhook.py — the resolution is encapsulated in `get_or_create_user` (Task 6). Webhook change is: after `user = await friend_service.get_or_create_user(line_user_id, db, commit=False)`, use `user.id` for the new `user_id` FK on any child row created in the webhook path (messages via `save_message`, friend_events, chat_sessions).
  - keep writing `line_user_id` on child rows (dual-write) so PR A reads (still plaintext-based) keep working.
- **MIRROR**: existing webhook handler structure; don't restructure the dispatch.
- **GOTCHA**: `webhook.py` has 45 refs — change ONLY the user-resolution + child-row construction; do not touch signature verification, dedup, or event dispatch. Grep after editing to confirm no behavior path skipped the dual-write.
- **VALIDATE**: `python -m pytest tests/test_webhook_deduplication.py tests/test_friend_service.py -v`; webhook follow/message still creates/updates the same user (no dup).

### Task 6: friend_service delegates to identity service
- **ACTION**: `get_or_create_user` gains hash-based resolution + surrogate population while preserving its full signature `(self, line_user_id: str, db: AsyncSession, commit: bool = True) -> User` and the LINE profile fetch logic.
- **IMPLEMENT**:
  ```python
  async def get_or_create_user(self, line_user_id: str, db: AsyncSession, commit: bool = True) -> User:
      # 1. Try identity service (HMAC hash lookup + legacy plaintext fallback)
      user = await resolve_by_line_id(db, line_user_id)
      if user:
          return user
      # 2. Brand-new user — fetch LINE profile (existing logic, unchanged)
      from app.core.line_client import get_line_bot_api
      try:
          profile = await get_line_bot_api().get_profile(line_user_id)
          user = User(line_user_id=line_user_id, display_name=profile.display_name,
                      picture_url=profile.picture_url, friend_status="ACTIVE",
                      friend_since=datetime.now(timezone.utc),
                      profile_updated_at=datetime.now(timezone.utc))
      except Exception as e:
          logger.warning("Failed to fetch LINE profile for %s: %s", line_user_id, e)
          user = User(line_user_id=line_user_id, display_name="LINE User",
                      friend_status="ACTIVE", friend_since=datetime.now(timezone.utc))
      # 3. Populate pseudonymization surrogate (hash + encrypted + key_version)
      populate_surrogate(user, line_user_id)
      db.add(user)
      if commit:
          await db.commit(); await db.refresh(user)
      else:
          await db.flush()
      return user
  ```
  - Keep the signature unchanged (27+ callers import it, webhook uses `commit=False`).
  - Other friend_service functions (`refresh_profile`, `handle_follow`, `handle_unfollow`) keep using `line_user_id` for queries (PR A reads unchanged) but any INSERT sets `user_id` too.
- **GOTCHA**: don't change `get_or_create_user`'s return type or name — callers depend on it. The `commit` param MUST be preserved (webhook passes `commit=False`; other callers use default `True`). Race condition: if two concurrent calls both miss `resolve_by_line_id` and both try to INSERT → unique `line_user_id_hash` raises IntegrityError → catch and re-select (add try/except around `db.add` + flush/commit).
- **VALIDATE**: `python -m pytest tests/test_friend_service.py -v`.

### Task 7: line_service outbound decrypt (mode-aware)
- **ACTION**: `push_messages` / `push_image_message` still receive the raw LINE ID (callers pass `user.line_user_id` in PR A) — NO signature change in PR A. Add an internal helper `resolve_raw_for_push(db, user)` that prefers decrypting `line_user_id_encrypted` and falls back to the plaintext column; wire it where a `User` object is available so PR B can flip callers to pass `user.id`.
- **IMPLEMENT**: keep PR A behavior identical (callers pass raw). Add `resolve_raw_for_push` for PR B use + a unit test proving decrypt round-trips.
- **GOTCHA**: do NOT change `push_messages` signature in PR A (67+ admin endpoint refs + WS depend on it). PR B switches callers.
- **VALIDATE**: round-trip test (encrypt→decrypt == raw); existing push tests green.

### Task 8: Tests (`backend/tests/test_user_identity.py`)
- **ACTION**: capability #1-#6 matrix.
- **IMPLEMENT** (one test per case minimum):
  1. resolve existing user by raw ID returns same `user.id` (idempotent, no dup).
  2. create new user → `line_user_id_hash` + `line_user_id_encrypted` + `line_key_version` populated; `line_user_id` still set (dual).
  3. hash stability: `line_id_hash(raw)` deterministic across calls.
  4. legacy fallback: a user with NULL hash (pre-backfill) is found by plaintext and lazily populated.
  5. decrypt round-trip: `decrypt_line_id_for_user` returns the original raw ID.
  6. concurrent create race: two `get_or_create_user` calls for a brand-new raw → one user (IntegrityError on unique `line_user_id_hash` handled → re-select).
  7. concurrent lazy-populate race: two `resolve_by_line_id` calls find the same NULL-hash user by plaintext → both try to set hash → one succeeds, one gets IntegrityError → re-select (no crash).
  8. mode behavior: `LINE_ID_STORAGE_MODE=plaintext` → reads use plaintext column (today's path); surrogate still written.
  9. prod guard: unset `LINE_ID_HMAC_KEY` + production-like → RuntimeError.
- **MIRROR**: SETTINGS_MONKEYPATCH + FRESH_ENGINE_IN_TESTS from p1.1a plan; `test_friend_service.py` user-creation idiom.
- **GOTCHA**: `test_client` session-scoped — monkeypatch mode per test is safe (read per-request); use distinct raw IDs per test to avoid unique-hash collisions across tests.
- **VALIDATE**:
  ```bash
  wsl -d Ubuntu -- bash -lc 'cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python -m pytest tests/test_user_identity.py -v'
  ```

### Task 9: Docs
- **ACTION**: `docs/remediation/migration-controls.md` — add `LINE_ID_STORAGE_MODE` section (mirror the `COOKIE_AUTH_MODE` block): three modes, what each does, flip checklist, rollback note. State PR A ships `plaintext` (dark).
- **VALIDATE**: markdown renders; no behavioral claim the code doesn't make.

---

## PR B — Migrate + Cutover (outline; detail when PR A merged + verified)

> PR B is a SEPARATE PR/branch (`feat/line-id-pseudonymization-cutover`). Below is the task map; expand into full ACTION/IMPLEMENT/GOTCHA/VALIDATE when PR A is green on prod.

- **B1. Backfill script** (`backend/scripts/backfill_line_id_pseudonym.py`, idempotent + batched):
  - For every `users` row with NULL `line_user_id_hash`: compute hash + encrypt from `line_user_id`, set `line_key_version`. Batched `UPDATE ... WHERE line_user_id_hash IS NULL LIMIT n` loop; no table lock.
  - For every child row with NULL `user_id`: set `user_id` from `users.id` matched by `line_user_id` (batched UPDATE with join).
  - Pre-flight: detect duplicate open `chat_sessions` per user (would break the future partial-unique) and report (do NOT auto-delete — operator decision).
  - Idempotent: safe to re-run; prints progress + remaining-NULL counts.
- **B2. Validation query**: count rows where surrogate still NULL across all 7 tables → must be 0 before cutover. Add as a check the script prints.
- **B3. Cutover reads**: switch queries/joins in `live_chat_service/*`, `friend_service`, `admin_*`, `analytics_service`, `admin_reports` from `line_user_id` to `user_id`/hash. API responses populate `line_user_id` via `decrypt_line_id_for_user` (join `users`). CSV/PDF export decrypt likewise.
- **B4. Flip flag**: `LINE_ID_STORAGE_MODE=pseudonym` on prod (after B1-B3 verified ≥ observation window). Reads now use surrogate; plaintext column ignored but present.
- **B5. WS connection state**: on `join_room`, resolve `line_user_id → user` once, cache `user.id` + decrypted raw in connection state (avoid per-message decrypt). Room naming stays `conversation:{line_user_id}` (boundary unchanged).
- **B6. Rollback drill**: flip flag back to `plaintext` → confirm system normal (reads fall back to plaintext column which is still populated by dual-write). Document the drill result.

**PR C (Contract) — separate plan**: grep proof 0 refs to plaintext column → migration drop `line_user_id` on 7 tables + recreate unique/partial-unique indexes on `user_id` → remove dual-write code → remove legacy fallback in identity service.

---

## Testing Strategy
- PR A unit/integration matrix = Task 8 (8 cases) + full-suite regression (no test may break — PR A is dark).
- Edge cases folded in: legacy NULL-hash user (pre-backfill), concurrent create race, system message (NULL `user_id` on messages), prod-guard failure, decrypt round-trip.
- PR B adds: backfill idempotency test, validation-query test, cutover read tests (responses still return correct `line_user_id` via decrypt), flag flip/rollback test.
- Frontend untouched proof: `git diff --stat main -- frontend/` empty (both PRs).

## Validation Commands (run in WSL; Docker db/redis up on Windows host)

```bash
# 0. services (PowerShell host, if not running):  docker compose up -d db redis
# 1. targeted (PR A)
wsl -d Ubuntu -- bash -lc 'cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python -m pytest tests/test_user_identity.py tests/test_friend_service.py tests/test_webhook_deduplication.py -v'
# 2. migration round-trip (ENV_FILE guards PROD default)
wsl -d Ubuntu -- bash -lc 'cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python scripts/db_target.py alembic --target local upgrade head && python scripts/db_target.py alembic --target local downgrade -1 && python scripts/db_target.py alembic --target local upgrade head'
# 3. full backend suite (record pass count for PR body — must not drop)
wsl -d Ubuntu -- bash -lc 'cd /mnt/d/genAI/jsk-app/backend && source venv_linux/bin/activate && python -m pytest'
# 4. frontend untouched proof
git diff --stat main -- frontend/   # EXPECT: empty
# 5. dual-write proof (PR A): new webhook write populates BOTH plaintext + surrogate
#    (assert in test_user_identity case 2)
```
EXPECT: zero failures; one Alembic head; no `frontend/` diff; pass count ≥ baseline.

## Acceptance Criteria
Inherited from PRD "Success Metrics" (PR A rows), plus:
- [ ] `LINE_ID_STORAGE_MODE=plaintext` (default) → every existing request/response byte-identical (full suite green, no behavior change).
- [ ] New webhook writes populate `line_user_id_hash` + `line_user_id_encrypted` + `line_key_version` on `users` AND `user_id` on child rows (dual-write proven).
- [ ] `resolve_or_create_by_line_id` is idempotent + race-safe (no duplicate users).
- [ ] Prod guard fails closed when `LINE_ID_HMAC_KEY` unset.
- [ ] Every Task's VALIDATE ran and passed.

## Completion Checklist
- [ ] Code indistinguishable from house style (imports, docstrings, error details)
- [ ] No secrets/keys/raw-ID values in logs or audit details (HMAC key + Fernet token never logged)
- [ ] `plaintext`-mode byte-compatibility proven by full suite
- [ ] Migration hand-written (no autogenerate), round-trips cleanly
- [ ] PR body drafts: grep proofs, test count, dark-ship + flag note, link to PRD
- [ ] `docs/remediation/migration-controls.md` updated

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dual-write missed on some child-row write path | M | M | Task 5 grep of all child-row constructors; test asserts surrogate populated |
| Legacy fallback (NULL-hash) query adds a second SELECT per resolve | M | L | only during dual period (pre-backfill); PR B backfill removes the need; index on `line_user_id` already exists |
| Concurrent brand-new-user create race | M | M | unique `line_user_id_hash` + IntegrityError→re-select (Task 4 GOTCHA) |
| Migration autogenerate temptation pulls drift | L | H | hand-written only (Task 3 GOTCHA) |
| HMAC key dev-fallback leaks into prod | L | H | guard `not is_production_like` (mirror credential_service); prod guard fails closed |
| PR A subtly changes webhook timing/behavior | L | H | full suite is the gate; change scoped to resolution + child-row construction only |

## Notes
- **Scope decision**: PR A is dark + additive + dual-write; reads stay on plaintext. This makes PR A near-zero-risk and reversible (just revert). PR B carries the real cutover risk and is gated on PR A being green on prod.
- **Why backend-only**: the PRD's hard constraint is "ระบบทำงานเหมือนเดิม" — keeping API/WS/frontend on the raw `line_user_id` boundary (decrypt-and-return) is what guarantees that. Full boundary pseudonymization (4B) is explicitly deferred.
- **Complementary work**: Approach 1 (display masking, frontend-only) can ship in parallel and gives immediate visible privacy benefit; recommend the user prioritize it alongside/after PR A.
- **Sequencing for the implementer (PR A)**: Tasks 1→2→3 (config/models/migration) → 4 (identity service) → 6 (friend_service — must precede webhook since webhook calls `get_or_create_user`) → 5 (webhook dual-write) → 7 (line_service) → 8 (tests) → 9 (docs). Commit per logical group on the feature branch; no push until review.
- **Skill methodology**: mattpocock/to-prd + domain-modeling (PRD), addyosmani/deprecation-and-migration + planning-and-task-breakdown (expand-contract phasing), ecc/prp-prd→prp-implement (this plan's ACTION/IMPLEMENT/GOTCHA/VALIDATE discipline).
