"""Role-based permissions for request workflow actions.

Stage 2 (DB-backed): The policy is loaded from the `permission_settings`
table and cached in-process. SUPER_ADMIN / ADMIN can edit the policy at
/admin/settings/permissions; the cache is invalidated on save so the
new policy takes effect on the next read.

The hardcoded `DEFAULT_POLICY` below remains as a fallback for two
cases:
  1. Bootstrap -- DB row missing for a key (e.g. before migration runs).
  2. Failure -- cache load failed; we degrade gracefully rather than
     locking everyone out.

All call sites import the helper functions (`can_assign`,
`can_self_assign`, `can_edit_permission_settings`,
`get_permission_summary`); the storage swap from Stage 1's hardcoded
frozensets to DB lookup is invisible to them.

Default policy keys (must match `permission_settings.key` rows):
  Key                          Roles
  ---------------------------  -------------------------------------
  assign_request               SUPER_ADMIN, ADMIN, DIRECTOR, HEAD
  self_assign_request          SUPER_ADMIN, ADMIN, DIRECTOR, HEAD
  edit_permission_settings     SUPER_ADMIN, ADMIN
"""
from __future__ import annotations

import logging
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole

logger = logging.getLogger(__name__)

# Permission keys -- treated as constants so call sites and tests don't
# stringify ad-hoc.
KEY_ASSIGN = "assign_request"
KEY_SELF_ASSIGN = "self_assign_request"
KEY_EDIT_SETTINGS = "edit_permission_settings"

# Hardcoded fallback used when the DB row is missing OR the cache hasn't
# loaded yet. Mirrors the migration seed values.
DEFAULT_POLICY: dict[str, frozenset[UserRole]] = {
    KEY_ASSIGN: frozenset({
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.DIRECTOR,
        UserRole.HEAD,
    }),
    KEY_SELF_ASSIGN: frozenset({
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.DIRECTOR,
        UserRole.HEAD,
    }),
    KEY_EDIT_SETTINGS: frozenset({
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
    }),
}

# Legacy aliases kept for any code that still references them.
# Prefer DEFAULT_POLICY[KEY_*] in new code.
ASSIGN_ALLOWED_ROLES: frozenset[UserRole] = DEFAULT_POLICY[KEY_ASSIGN]
SELF_ASSIGN_ALLOWED_ROLES: frozenset[UserRole] = DEFAULT_POLICY[KEY_SELF_ASSIGN]
PERMISSION_SETTINGS_EDITOR_ROLES: frozenset[UserRole] = DEFAULT_POLICY[KEY_EDIT_SETTINGS]

# In-process cache populated lazily by load_policy(db). When None the
# helpers fall back to DEFAULT_POLICY.
_policy_cache: dict[str, frozenset[UserRole]] | None = None


def _coerce_roles(values: Iterable[str]) -> frozenset[UserRole]:
    """Convert a sequence of stringified role names to UserRole enums.

    Unknown values are dropped with a warning rather than raising, so a
    typo in the DB row doesn't take the auth check offline.
    """
    out: set[UserRole] = set()
    for v in values:
        try:
            out.add(UserRole(v))
        except ValueError:
            logger.warning("Ignoring unknown role %r in permission_settings", v)
    return frozenset(out)


async def load_policy(db: AsyncSession) -> dict[str, frozenset[UserRole]]:
    """Read every row from permission_settings and refresh the cache.

    Defensive: any key missing from the DB falls back to the
    DEFAULT_POLICY entry so a partial table doesn't break checks.
    Returns the merged policy.
    """
    # Local import to avoid a circular ORM/Base import at module load.
    from app.models.permission_setting import PermissionSetting

    global _policy_cache

    try:
        result = await db.execute(select(PermissionSetting))
        rows = result.scalars().all()
    except Exception as exc:  # noqa: BLE001 -- log + degrade
        logger.warning("Failed to load permission_settings: %s; using defaults", exc)
        _policy_cache = dict(DEFAULT_POLICY)
        return _policy_cache

    db_policy: dict[str, frozenset[UserRole]] = {}
    for row in rows:
        roles = row.allowed_roles or []
        db_policy[row.key] = _coerce_roles(roles)

    # Merge: DB values override defaults, but defaults fill any missing keys.
    merged = {**DEFAULT_POLICY, **db_policy}
    _policy_cache = merged
    return merged


# Friendly Thai descriptions surfaced in the Settings UI when the
# self-heal hook below has to insert a missing row. They mirror the
# strings seeded by alembic migration n4o5p6q7r8s9 so the UI looks
# identical regardless of which path populated the table.
_SEED_DESCRIPTIONS: dict[str, str] = {
    KEY_ASSIGN: "มอบหมายงานให้ผู้อื่น",
    KEY_SELF_ASSIGN: "รับเรื่องเอง (self-assign)",
    KEY_EDIT_SETTINGS: "แก้ไขการตั้งค่าสิทธิ์",
}


async def ensure_seed_rows(db: AsyncSession) -> int:
    """Self-heal: ensure DEFAULT_POLICY keys exist in permission_settings.

    Called from the lifespan hook on startup so a fresh database (CI,
    a freshly-restored backup, or a developer who wiped their dev DB)
    always has the three default rules even if alembic's seed step did
    not run -- e.g. if a previous migration's COMMIT broke the
    transaction wrapping the seed INSERT, which we observed in CI on
    Postgres 16.

    Idempotent: only inserts keys that are missing. Existing rows are
    left untouched, including any role customisations applied through
    the Settings UI.
    """
    from app.models.permission_setting import PermissionSetting

    try:
        existing = await db.execute(select(PermissionSetting.key))
        existing_keys = {row[0] for row in existing.all()}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not check permission_settings rows: %s", exc)
        return 0

    inserted = 0
    for key, default_roles in DEFAULT_POLICY.items():
        if key in existing_keys:
            continue
        db.add(
            PermissionSetting(
                key=key,
                allowed_roles=sorted(r.value for r in default_roles),
                description=_SEED_DESCRIPTIONS.get(key),
            )
        )
        inserted += 1

    if inserted:
        try:
            await db.commit()
            logger.info("Seeded %d missing permission_settings row(s).", inserted)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to seed permission_settings: %s", exc)
            await db.rollback()
            return 0

    return inserted


def invalidate_cache() -> None:
    """Drop the in-process cache. Call after a PATCH writes new rows.

    The next call to a `can_*` helper that triggers a refresh (or the
    next call to `load_policy`) will repopulate from the DB.
    """
    global _policy_cache
    _policy_cache = None


def _allowed_for(key: str) -> frozenset[UserRole]:
    """Resolve the allowed-roles set for a permission key.

    Reads from the in-process cache when populated, otherwise falls back
    to the hardcoded DEFAULT_POLICY. The cache is populated by an async
    `load_policy()` call, so before the first request lands the helpers
    will use defaults -- matching Stage 1 behavior exactly.
    """
    if _policy_cache is not None and key in _policy_cache:
        return _policy_cache[key]
    return DEFAULT_POLICY.get(key, frozenset())


def _check(role: UserRole | str | None, key: str) -> bool:
    if role is None:
        return False
    role_enum = role if isinstance(role, UserRole) else UserRole(role)
    return role_enum in _allowed_for(key)


def can_assign(role: UserRole | str | None) -> bool:
    """Whether `role` can assign a request to another user."""
    return _check(role, KEY_ASSIGN)


def can_self_assign(role: UserRole | str | None) -> bool:
    """Whether `role` can claim/self-assign a PENDING request."""
    return _check(role, KEY_SELF_ASSIGN)


def can_edit_permission_settings(role: UserRole | str | None) -> bool:
    """Whether `role` can read/edit the permission_settings table."""
    return _check(role, KEY_EDIT_SETTINGS)


def get_permission_summary() -> dict[str, list[str]]:
    """Return current permission map as plain JSON-serialisable dict.

    Used by GET /admin/settings/permissions so the frontend can render
    the policy table. Reads from the cache when populated, defaults
    otherwise.
    """
    return {
        "assign_allowed_roles": sorted(r.value for r in _allowed_for(KEY_ASSIGN)),
        "self_assign_allowed_roles": sorted(r.value for r in _allowed_for(KEY_SELF_ASSIGN)),
        "permission_settings_editor_roles": sorted(r.value for r in _allowed_for(KEY_EDIT_SETTINGS)),
    }
