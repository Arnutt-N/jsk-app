from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.db.session import get_db
from app.api.deps import get_current_admin, require_permission
from app.core.audit import create_audit_log
from app.core.permissions import (
    can_assign,
    can_self_assign,
    can_edit_permission_settings,
    can_revert_approval,
    can_edit_request_details,
    get_permission_summary,
    get_effective_capabilities,
    load_policy,
    invalidate_cache,
    ALL_PERMISSION_KEYS,
    PERMISSION_REGISTRY,
    KEY_EDIT_SYSTEM_SETTINGS,
)
from app.models.permission_setting import PermissionSetting
from app.models.user import User, UserRole
from app.schemas.rich_menu import SystemSettingBase, SystemSettingResponse
from app.services.settings_service import SettingsService
from app.models.system_setting import SystemSetting
from sqlalchemy import select
from pydantic import BaseModel, Field

router = APIRouter()


# ── Permission settings (Stage 2: DB-backed) ────────────────────────
# Source of truth lives in the `permission_settings` table; the
# hardcoded DEFAULT_POLICY in app.core.permissions remains as a fallback
# when a row is missing.

class PermissionRule(BaseModel):
    """A single editable permission rule."""
    key: str = Field(..., description="Stable identifier consumed by code (e.g. 'assign_request')")
    allowed_roles: List[str] = Field(default_factory=list, description="UserRole enum values")
    description: Optional[str] = Field(None, description="Thai description shown in the Settings UI")


class PermissionKeyMeta(BaseModel):
    """Static metadata for a permission key (module grouping + level tag).

    Mirrors app.core.permissions.PERMISSION_REGISTRY so the Settings UI can
    group rows into modules and render per-module level presets without
    hardcoding the key list client-side.
    """
    key: str
    label: str = Field(..., description="Thai label shown in the matrix")
    module: str = Field(..., description="service_requests | chatbot | system")
    level: int = Field(..., description="1=View, 2=Edit, 3=Manage")


class PermissionSummary(BaseModel):
    """Compact view used by GET /permissions for backwards compatibility."""
    assign_allowed_roles: List[str]
    self_assign_allowed_roles: List[str]
    permission_settings_editor_roles: List[str]
    revert_approval_allowed_roles: List[str]
    edit_request_details_allowed_roles: List[str]
    # Full editable rule set (Stage 2). Empty for clients that only need
    # the legacy summary fields above.
    rules: List[PermissionRule] = Field(default_factory=list)
    # Phase 3: module/level metadata for the grouped matrix UI.
    registry: List[PermissionKeyMeta] = Field(default_factory=list)


class PermissionUpdate(BaseModel):
    """Request body for PATCH /permissions -- bulk upsert of rule rows."""
    updates: List[PermissionRule]


class MyPermissions(BaseModel):
    role: str
    can_assign: bool
    can_self_assign: bool
    can_edit_permissions: bool
    can_revert_approval: bool
    can_edit_request_details: bool
    # Phase 3: full effective capability map {key: bool} for all registered
    # keys, so the frontend can resolve hasPermission(key) generically.
    capabilities: dict[str, bool] = Field(default_factory=dict)


# Set of valid permission keys -- updates touching anything else are rejected.
# Sourced from the registry so it always covers every defined key (16 as of
# Phase 3) without a second list to keep in sync.
ALLOWED_PERMISSION_KEYS = set(ALL_PERMISSION_KEYS)


async def _load_rules(db: AsyncSession) -> List[PermissionRule]:
    """Read every persisted rule, returning them in stable key order."""
    result = await db.execute(select(PermissionSetting))
    rows = result.scalars().all()
    rules = [
        PermissionRule(
            key=row.key,
            allowed_roles=list(row.allowed_roles or []),
            description=row.description,
        )
        for row in rows
    ]
    rules.sort(key=lambda r: r.key)
    return rules


def _registry_meta() -> List[PermissionKeyMeta]:
    """Project PERMISSION_REGISTRY into the API metadata shape (ordered)."""
    return [
        PermissionKeyMeta(key=m.key, label=m.label_th, module=m.module, level=m.level)
        for m in PERMISSION_REGISTRY
    ]


@router.get("/permissions", response_model=PermissionSummary)
async def get_permissions(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Return the current permission policy from DB.

    All authenticated admins can read this so the frontend can render
    the policy table even for users who cannot edit it.
    """
    # Refresh cache from DB to ensure we report the live state.
    await load_policy(db)
    summary = get_permission_summary()
    rules = await _load_rules(db)
    return PermissionSummary(**summary, rules=rules, registry=_registry_meta())


@router.patch("/permissions", response_model=PermissionSummary)
async def update_permissions(
    body: PermissionUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Bulk-upsert permission rules (Stage 2 editor).

    Only roles in the `edit_permission_settings` rule may call this.
    The endpoint:
      - Validates every key is known (rejects unknown -> 400).
      - Validates every role string is a valid UserRole (rejects -> 400).
      - Refuses to remove SUPER_ADMIN from `edit_permission_settings`
        to prevent locking the system out of its own settings UI.
      - Upserts each rule (INSERT ... ON CONFLICT UPDATE).
      - Invalidates the in-process cache and reloads it from DB.
    """
    if not can_edit_permission_settings(current_admin.role):
        raise HTTPException(
            status_code=403,
            detail="คุณไม่มีสิทธิ์แก้ไขการตั้งค่าสิทธิ์",
        )

    valid_role_values = {r.value for r in UserRole}

    # Validate the whole batch before writing anything (atomic feel).
    for rule in body.updates:
        if rule.key not in ALLOWED_PERMISSION_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"คีย์สิทธิ์ไม่รู้จัก: {rule.key}",
            )
        unknown_roles = [r for r in rule.allowed_roles if r not in valid_role_values]
        if unknown_roles:
            raise HTTPException(
                status_code=400,
                detail=f"role ไม่รู้จัก: {', '.join(unknown_roles)}",
            )
        # Lockout safeguard (Phase 3): SUPER_ADMIN is locked into EVERY key.
        # SUPER_ADMIN is owner-level and must never lose any capability, or
        # the system could be permanently locked out of part of itself.
        if "SUPER_ADMIN" not in rule.allowed_roles:
            raise HTTPException(
                status_code=400,
                detail=f"ห้ามถอด SUPER_ADMIN ออกจากสิทธิ์ '{rule.key}'",
            )

    # Apply -- one upsert per rule. Track old->new role transitions for the
    # audit row (role NAMES only -- no secrets are ever involved here).
    changes = []
    for rule in body.updates:
        existing = await db.execute(
            select(PermissionSetting).where(PermissionSetting.key == rule.key)
        )
        row = existing.scalar_one_or_none()
        if row is None:
            prior_roles = None
            row = PermissionSetting(
                key=rule.key,
                allowed_roles=rule.allowed_roles,
                description=rule.description,
                updated_by_id=int(current_admin.id) if current_admin.id is not None else None,
            )
            db.add(row)
        else:
            prior_roles = list(row.allowed_roles or [])
            row.allowed_roles = rule.allowed_roles
            if rule.description is not None:
                row.description = rule.description
            row.updated_by_id = int(current_admin.id) if current_admin.id is not None else None

        new_roles = list(rule.allowed_roles)
        if prior_roles is None or sorted(prior_roles) != sorted(new_roles):
            changes.append({"key": rule.key, "from": prior_roles, "to": new_roles})

    if changes:
        await create_audit_log(
            db=db,
            admin_id=current_admin.id,
            action="update_permissions",
            resource_type="permission_matrix",
            resource_id=None,
            details={"changes": changes},
        )

    await db.commit()

    # Refresh cache so the next request sees the new policy.
    invalidate_cache()
    await load_policy(db)

    summary = get_permission_summary()
    rules = await _load_rules(db)
    return PermissionSummary(**summary, rules=rules, registry=_registry_meta())


@router.get("/permissions/me", response_model=MyPermissions)
async def get_my_permissions(current_admin: User = Depends(get_current_admin)):
    """Return the current user's effective permissions.

    Used by the frontend to decide which workflow buttons (มอบหมาย /
    รับเรื่อง / เริ่มดำเนินการ / etc.) to render on the request list and
    detail pages. Centralising this avoids duplicating the role list
    in every component.
    """
    role_value = current_admin.role.value if hasattr(current_admin.role, "value") else str(current_admin.role)
    return MyPermissions(
        role=role_value,
        can_assign=can_assign(current_admin.role),
        can_self_assign=can_self_assign(current_admin.role),
        can_edit_permissions=can_edit_permission_settings(current_admin.role),
        can_revert_approval=can_revert_approval(current_admin.role),
        can_edit_request_details=can_edit_request_details(current_admin.role),
        capabilities=get_effective_capabilities(current_admin.role),
    )

class ValidateLineTokenRequest(BaseModel):
    channel_access_token: str

@router.post("/line/validate")
@router.post("/line/validate/")
async def validate_line_token(
    request: ValidateLineTokenRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS)),
):
    import httpx
    url = "https://api.line.me/v2/bot/info"
    headers = {"Authorization": f"Bearer {request.channel_access_token}"}

    async def _audit(result: str) -> None:
        # No DB mutation happens here -- the audit row IS the mutation for
        # this test/verify endpoint. NEVER log the token itself.
        await create_audit_log(
            db=db,
            admin_id=current_admin.id,
            action="validate_line_token",
            resource_type="credential",
            resource_id=None,
            details={"result": result},
        )
        await db.commit()

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers)
        except Exception as e:
            await _audit("fail")
            raise HTTPException(status_code=500, detail=f"Connection failed: {str(e)}")

    if response.status_code == 200:
        await _audit("ok")
        return {"status": "valid", "data": response.json()}
    elif response.status_code == 401:
        await _audit("fail")
        raise HTTPException(status_code=400, detail="Invalid Channel Access Token")
    else:
        await _audit("fail")
        raise HTTPException(status_code=400, detail=f"Validation failed: {response.text}")

@router.get("", response_model=List[SystemSettingResponse])
async def list_settings(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(SystemSetting))
    return result.scalars().all()


# FAIL-CLOSED value redaction for update_system_setting audit rows (FR2).
#
# update_setting accepts arbitrary keys, and system_settings demonstrably
# holds secrets: the LINE settings page POSTs LINE_CHANNEL_ACCESS_TOKEN and
# LINE_CHANNEL_SECRET here, and rich_menu_service.py reads the token back
# out as a fallback source. A substring denylist (TOKEN/SECRET/...) fails
# OPEN -- keys like "webhook_url", "authorization", "bearer", "dsn", or
# "connection_string" would sail past it and get their values logged in
# full. So instead, mirroring P0.1's environment-allowlist philosophy:
# redact EVERY value ({"key": ..., "value_changed": true}) unless the key
# is on this explicit allowlist of known non-secret settings.
#
# Allowlist contents -- surveyed from every SettingsService/SystemSetting
# call site in the codebase (handoff_service.py, rich_menu_service.py,
# frontend/app/admin/settings/line/page.tsx):
#   HANDOFF_KEYWORDS -- operator-handoff trigger words (display/behavior
#                       config; shown verbatim in the admin UI already).
# Add a key here ONLY if its value is safe to display to any audit-log
# viewer; when in doubt, leave it off -- the audit row still records that
# the key changed.
_NON_SECRET_SETTING_KEYS = frozenset({"HANDOFF_KEYWORDS"})


def _is_secret_setting_key(key: str) -> bool:
    return key not in _NON_SECRET_SETTING_KEYS


@router.post("", response_model=SystemSettingResponse)
async def update_setting(
    setting_data: SystemSettingBase,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS))
):
    setting = await SettingsService.set_setting(
        db,
        setting_data.key,
        setting_data.value,
        setting_data.description
    )

    if _is_secret_setting_key(setting_data.key):
        details = {"key": setting_data.key, "value_changed": True}
    else:
        details = {"key": setting_data.key, "value": setting_data.value}

    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="update_system_setting",
        resource_type="system_setting",
        resource_id=str(setting.id),
        details=details,
    )
    await db.commit()
    return setting
