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
  revert_approval              SUPER_ADMIN, ADMIN
  edit_request_details         SUPER_ADMIN, ADMIN
"""
from __future__ import annotations

import logging
from typing import Iterable, Literal, NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import UserRole

logger = logging.getLogger(__name__)

# Permission keys -- treated as constants so call sites and tests don't
# stringify ad-hoc.
KEY_ASSIGN = "assign_request"
KEY_SELF_ASSIGN = "self_assign_request"
KEY_EDIT_SETTINGS = "edit_permission_settings"
KEY_REVERT = "revert_approval"
KEY_EDIT_REQUEST_DETAILS = "edit_request_details"

# Phase 3 -- module-based keys (Chatbot Management).
KEY_MANAGE_BROADCAST = "manage_broadcast"
KEY_MANAGE_AUTO_REPLIES = "manage_auto_replies"
KEY_MANAGE_RICH_MENUS = "manage_rich_menus"
KEY_MANAGE_REPLY_OBJECTS = "manage_reply_objects"
KEY_EXPORT_CHAT = "export_chat"

# Phase 3 -- module-based keys (System & Utilities).
KEY_MANAGE_USERS = "manage_users"
KEY_MANAGE_FILES = "manage_files"
KEY_VIEW_REPORTS = "view_reports"
KEY_VIEW_AUDIT_LOG = "view_audit_log"
KEY_EDIT_SYSTEM_SETTINGS = "edit_settings"
KEY_IMAGE_RESIZE = "image_resize"

# P1.2a -- configurable auth gates (deps.py). Replace the three
# hardcoded role allowlists in get_current_admin/manager/staff with
# DB-configurable permission keys via the existing matrix UI. DEFAULT
# values mirror today's hardcoded sets so the PR ships dark.
KEY_ACCESS_ADMIN_ENDPOINTS = "access_admin_endpoints"
KEY_ACCESS_MANAGER_ENDPOINTS = "access_manager_endpoints"
KEY_ACCESS_STAFF_ENDPOINTS = "access_staff_endpoints"

# NEW-3 -- configurable live-chat WebSocket gate. Replaces the hardcoded
# {ADMIN, SUPER_ADMIN, AGENT} set in ws_live_chat.py:53 (WS auth) +
# sessions.py:236 (transfer target). DEFAULT preserves today's set;
# SUPER_ADMIN opts DIRECTOR/HEAD in via the matrix UI. This is the WS
# gate; access_staff_endpoints is the HTTP gate -- different layers.
KEY_ACCESS_LIVE_CHAT = "access_live_chat"

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
    KEY_REVERT: frozenset({
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
    }),
    KEY_EDIT_REQUEST_DETAILS: frozenset({
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
    }),
    # --- Phase 3: Chatbot Management ---
    KEY_MANAGE_BROADCAST: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    KEY_MANAGE_AUTO_REPLIES: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    KEY_MANAGE_RICH_MENUS: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    KEY_MANAGE_REPLY_OBJECTS: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    KEY_EXPORT_CHAT: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    # --- Phase 3: System & Utilities ---
    KEY_MANAGE_USERS: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    KEY_MANAGE_FILES: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    # Managers (DIRECTOR/HEAD) may VIEW reports; writes stay ADMIN+.
    KEY_VIEW_REPORTS: frozenset({
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.DIRECTOR,
        UserRole.HEAD,
    }),
    KEY_VIEW_AUDIT_LOG: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    KEY_EDIT_SYSTEM_SETTINGS: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    KEY_IMAGE_RESIZE: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    # --- P1.2a: Configurable auth gates (deps.py) ---
    # Mirror the hardcoded role sets in get_current_admin/manager/staff
    # so the PR ships dark (zero behavior change). SUPER_ADMIN stays in
    # every set by default; the lockout safeguard in settings.py
    # prevents removing SUPER_ADMIN only from access_admin_endpoints
    # (the settings-UI gate).
    KEY_ACCESS_ADMIN_ENDPOINTS: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN}),
    KEY_ACCESS_MANAGER_ENDPOINTS: frozenset({
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.DIRECTOR,
        UserRole.HEAD,
    }),
    KEY_ACCESS_STAFF_ENDPOINTS: frozenset({
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.AGENT,
        UserRole.DIRECTOR,
        UserRole.HEAD,
    }),
    # --- NEW-3: Live-chat WebSocket gate ---
    # Mirrors the pre-NEW-3 hardcoded set in ws_live_chat.py:53 and
    # sessions.py:236 so the PR ships dark. SUPER_ADMIN opts DIRECTOR/
    # HEAD in via the matrix UI; under DEFAULT_POLICY they stay out
    # (today's behavior).
    KEY_ACCESS_LIVE_CHAT: frozenset({UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT}),
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
    KEY_REVERT: "ยกเลิกการอนุมัติ",
    KEY_EDIT_REQUEST_DETAILS: "แก้ไขข้อมูลคำร้อง (รายละเอียด/ผู้ติดต่อ)",
    # --- Phase 3: Chatbot Management ---
    KEY_MANAGE_BROADCAST: "จัดการ Broadcast (สร้าง/แก้/ส่ง/ตั้งเวลา)",
    KEY_MANAGE_AUTO_REPLIES: "จัดการข้อความตอบกลับอัตโนมัติ (intents/keywords/responses)",
    KEY_MANAGE_RICH_MENUS: "จัดการ Rich Menu",
    KEY_MANAGE_REPLY_OBJECTS: "จัดการ Reply Objects",
    KEY_EXPORT_CHAT: "ส่งออกประวัติแชต (CSV/PDF)",
    # --- Phase 3: System & Utilities ---
    KEY_MANAGE_USERS: "จัดการผู้ใช้ (สร้าง/แก้/ลบ/รีเซ็ตรหัสผ่าน)",
    KEY_MANAGE_FILES: "จัดการไฟล์ (อัปโหลด/ลบ/ลิงก์สาธารณะ)",
    KEY_VIEW_REPORTS: "ดูรายงานและสถิติ",
    KEY_VIEW_AUDIT_LOG: "ดู Audit Log",
    KEY_EDIT_SYSTEM_SETTINGS: "แก้ไขการตั้งค่าระบบ (credentials/integrations)",
    KEY_IMAGE_RESIZE: "ใช้เครื่องมือ Image Resize",
    # --- P1.2a: Configurable auth gates (deps.py) ---
    KEY_ACCESS_ADMIN_ENDPOINTS: "เข้าใช้งาน admin endpoints (gate เข้า settings UI)",
    KEY_ACCESS_MANAGER_ENDPOINTS: "เข้าใช้งาน manager-level endpoints (request workflow)",
    KEY_ACCESS_STAFF_ENDPOINTS: "เข้าใช้งาน staff-level endpoints (live-chat HTTP)",
    # --- NEW-3: Live-chat WebSocket gate ---
    KEY_ACCESS_LIVE_CHAT: "เข้าใช้ Live Chat (WebSocket)",
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


def can_revert_approval(role: UserRole | str | None) -> bool:
    """Whether `role` can revert a COMPLETED request to AWAITING_APPROVAL or IN_PROGRESS."""
    return _check(role, KEY_REVERT)


def can_edit_request_details(role: UserRole | str | None) -> bool:
    """Whether `role` can edit a request's details/contact fields."""
    return _check(role, KEY_EDIT_REQUEST_DETAILS)


def can(role: UserRole | str | None, key: str) -> bool:
    """Public capability check for an arbitrary permission key.

    Thin public wrapper over the internal `_check` so call sites and the
    `require_permission` dependency don't import a private symbol. Unknown
    keys resolve to an empty allowed-set -> False (fail closed).
    """
    return _check(role, key)


# --- Phase 3: module-based capability helpers -----------------------------
# One thin helper per new key, mirroring the request-workflow helpers above.

def can_manage_broadcast(role: UserRole | str | None) -> bool:
    return _check(role, KEY_MANAGE_BROADCAST)


def can_manage_auto_replies(role: UserRole | str | None) -> bool:
    return _check(role, KEY_MANAGE_AUTO_REPLIES)


def can_manage_rich_menus(role: UserRole | str | None) -> bool:
    return _check(role, KEY_MANAGE_RICH_MENUS)


def can_manage_reply_objects(role: UserRole | str | None) -> bool:
    return _check(role, KEY_MANAGE_REPLY_OBJECTS)


def can_export_chat(role: UserRole | str | None) -> bool:
    return _check(role, KEY_EXPORT_CHAT)


def can_manage_users(role: UserRole | str | None) -> bool:
    return _check(role, KEY_MANAGE_USERS)


def can_manage_files(role: UserRole | str | None) -> bool:
    return _check(role, KEY_MANAGE_FILES)


def can_view_reports(role: UserRole | str | None) -> bool:
    return _check(role, KEY_VIEW_REPORTS)


def can_view_audit_log(role: UserRole | str | None) -> bool:
    return _check(role, KEY_VIEW_AUDIT_LOG)


def can_edit_system_settings(role: UserRole | str | None) -> bool:
    return _check(role, KEY_EDIT_SYSTEM_SETTINGS)


def can_image_resize(role: UserRole | str | None) -> bool:
    return _check(role, KEY_IMAGE_RESIZE)


# --- Phase 3: module / level registry -------------------------------------
# The registry is the single source of truth the Settings UI groups by, and
# it powers the per-module level presets (None/View/Edit/Manage). Storage and
# enforcement stay per-key (DEFAULT_POLICY + permission_settings); levels are
# a presentation projection only -- no ordinal column is stored.

Module = Literal["service_requests", "chatbot", "system"]

# Level ordinals: 1=View, 2=Edit, 3=Manage. (0=None means "no key granted".)
LEVEL_VIEW = 1
LEVEL_EDIT = 2
LEVEL_MANAGE = 3


class PermissionMeta(NamedTuple):
    key: str
    module: Module
    level: int  # LEVEL_VIEW | LEVEL_EDIT | LEVEL_MANAGE
    label_th: str


# Ordered Service Requests -> Chatbot -> System so UI rows are deterministic.
PERMISSION_REGISTRY: tuple[PermissionMeta, ...] = (
    # Service Requests (enforcement unchanged; surfaced for completeness).
    PermissionMeta(KEY_EDIT_REQUEST_DETAILS, "service_requests", LEVEL_EDIT, _SEED_DESCRIPTIONS[KEY_EDIT_REQUEST_DETAILS]),
    PermissionMeta(KEY_REVERT, "service_requests", LEVEL_EDIT, _SEED_DESCRIPTIONS[KEY_REVERT]),
    PermissionMeta(KEY_ASSIGN, "service_requests", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_ASSIGN]),
    PermissionMeta(KEY_SELF_ASSIGN, "service_requests", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_SELF_ASSIGN]),
    # Chatbot Management.
    PermissionMeta(KEY_EXPORT_CHAT, "chatbot", LEVEL_EDIT, _SEED_DESCRIPTIONS[KEY_EXPORT_CHAT]),
    PermissionMeta(KEY_MANAGE_BROADCAST, "chatbot", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_MANAGE_BROADCAST]),
    PermissionMeta(KEY_MANAGE_AUTO_REPLIES, "chatbot", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_MANAGE_AUTO_REPLIES]),
    PermissionMeta(KEY_MANAGE_RICH_MENUS, "chatbot", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_MANAGE_RICH_MENUS]),
    PermissionMeta(KEY_MANAGE_REPLY_OBJECTS, "chatbot", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_MANAGE_REPLY_OBJECTS]),
    # System & Utilities.
    PermissionMeta(KEY_VIEW_REPORTS, "system", LEVEL_VIEW, _SEED_DESCRIPTIONS[KEY_VIEW_REPORTS]),
    PermissionMeta(KEY_VIEW_AUDIT_LOG, "system", LEVEL_VIEW, _SEED_DESCRIPTIONS[KEY_VIEW_AUDIT_LOG]),
    PermissionMeta(KEY_EDIT_SYSTEM_SETTINGS, "system", LEVEL_EDIT, _SEED_DESCRIPTIONS[KEY_EDIT_SYSTEM_SETTINGS]),
    PermissionMeta(KEY_IMAGE_RESIZE, "system", LEVEL_EDIT, _SEED_DESCRIPTIONS[KEY_IMAGE_RESIZE]),
    PermissionMeta(KEY_MANAGE_USERS, "system", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_MANAGE_USERS]),
    PermissionMeta(KEY_MANAGE_FILES, "system", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_MANAGE_FILES]),
    PermissionMeta(KEY_EDIT_SETTINGS, "system", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_EDIT_SETTINGS]),
    # P1.2a: Configurable auth gates (deps.py). admin/manager gates are
    # MANAGE-level (escalation-sensitive); staff is VIEW-level (front-line
    # access surface). Grouped under "system" alongside other access keys.
    PermissionMeta(KEY_ACCESS_ADMIN_ENDPOINTS, "system", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_ACCESS_ADMIN_ENDPOINTS]),
    PermissionMeta(KEY_ACCESS_MANAGER_ENDPOINTS, "system", LEVEL_MANAGE, _SEED_DESCRIPTIONS[KEY_ACCESS_MANAGER_ENDPOINTS]),
    PermissionMeta(KEY_ACCESS_STAFF_ENDPOINTS, "system", LEVEL_VIEW, _SEED_DESCRIPTIONS[KEY_ACCESS_STAFF_ENDPOINTS]),
    # NEW-3: Live-chat WebSocket gate. VIEW-level (access gate, not edit);
    # grouped under "system" alongside the other access keys.
    PermissionMeta(KEY_ACCESS_LIVE_CHAT, "system", LEVEL_VIEW, _SEED_DESCRIPTIONS[KEY_ACCESS_LIVE_CHAT]),
)

# Every key (existing + new) must appear in the registry exactly once.
ALL_PERMISSION_KEYS: tuple[str, ...] = tuple(m.key for m in PERMISSION_REGISTRY)


def keys_for_level(module: Module, level: int) -> list[str]:
    """Keys in `module` whose level is <= `level` (the level-preset math).

    Used by the UI to project a chosen module level (None/View/Edit/Manage)
    onto the concrete per-key set. `level=0` -> empty list.
    """
    if level <= 0:
        return []
    return [m.key for m in PERMISSION_REGISTRY if m.module == module and m.level <= level]


def get_effective_capabilities(role: UserRole | str | None) -> dict[str, bool]:
    """Return {key: bool} for every registered key, for the given role.

    Backs GET /admin/settings/permissions/me so the frontend can resolve
    `hasPermission(key)` without enumerating keys client-side.
    """
    return {m.key: _check(role, m.key) for m in PERMISSION_REGISTRY}


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
        "revert_approval_allowed_roles": sorted(r.value for r in _allowed_for(KEY_REVERT)),
        "edit_request_details_allowed_roles": sorted(r.value for r in _allowed_for(KEY_EDIT_REQUEST_DETAILS)),
    }
