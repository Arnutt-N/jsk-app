from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.db.session import get_db
from app.api.deps import get_current_admin, require_permission
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

    # Apply -- one upsert per rule.
    for rule in body.updates:
        existing = await db.execute(
            select(PermissionSetting).where(PermissionSetting.key == rule.key)
        )
        row = existing.scalar_one_or_none()
        if row is None:
            row = PermissionSetting(
                key=rule.key,
                allowed_roles=rule.allowed_roles,
                description=rule.description,
                updated_by_id=int(current_admin.id) if current_admin.id is not None else None,
            )
            db.add(row)
        else:
            row.allowed_roles = rule.allowed_roles
            if rule.description is not None:
                row.description = rule.description
            row.updated_by_id = int(current_admin.id) if current_admin.id is not None else None

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
async def validate_line_token(request: ValidateLineTokenRequest, current_admin: User = Depends(require_permission(KEY_EDIT_SYSTEM_SETTINGS))):
    import httpx
    url = "https://api.line.me/v2/bot/info"
    headers = {"Authorization": f"Bearer {request.channel_access_token}"}
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Connection failed: {str(e)}")
        
    if response.status_code == 200:
        return {"status": "valid", "data": response.json()}
    elif response.status_code == 401:
        raise HTTPException(status_code=400, detail="Invalid Channel Access Token")
    else:
        raise HTTPException(status_code=400, detail=f"Validation failed: {response.text}")

@router.get("", response_model=List[SystemSettingResponse])
async def list_settings(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    result = await db.execute(select(SystemSetting))
    return result.scalars().all()

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
    return setting
