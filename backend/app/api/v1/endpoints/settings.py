from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.db.session import get_db
from app.api.deps import get_current_admin
from app.core.permissions import (
    can_assign,
    can_self_assign,
    can_edit_permission_settings,
    get_permission_summary,
)
from app.models.user import User
from app.schemas.rich_menu import SystemSettingBase, SystemSettingResponse
from app.services.settings_service import SettingsService
from app.models.system_setting import SystemSetting
from sqlalchemy import select
from pydantic import BaseModel

router = APIRouter()


# ── Permission settings (Stage 1: read-only, hardcoded) ─────────────
# Stage 2 will add PATCH endpoint backed by a permission_settings table
# editable by SUPER_ADMIN/ADMIN at /admin/settings/permissions UI.

class PermissionSummary(BaseModel):
    assign_allowed_roles: List[str]
    self_assign_allowed_roles: List[str]
    permission_settings_editor_roles: List[str]


class MyPermissions(BaseModel):
    role: str
    can_assign: bool
    can_self_assign: bool
    can_edit_permissions: bool


@router.get("/permissions", response_model=PermissionSummary)
async def get_permissions(current_admin: User = Depends(get_current_admin)):
    """Return the current permission policy.

    All authenticated admins can read this so the frontend knows which
    roles are allowed to perform each action -- needed to render the
    Settings > Permissions tab even for users who cannot edit it.
    """
    return PermissionSummary(**get_permission_summary())


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
    )

class ValidateLineTokenRequest(BaseModel):
    channel_access_token: str

@router.post("/line/validate")
@router.post("/line/validate/")
async def validate_line_token(request: ValidateLineTokenRequest, current_admin: User = Depends(get_current_admin)):
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
    current_admin: User = Depends(get_current_admin)
):
    setting = await SettingsService.set_setting(
        db, 
        setting_data.key, 
        setting_data.value, 
        setting_data.description
    )
    return setting
