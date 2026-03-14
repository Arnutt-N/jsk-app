from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.db.session import get_db
from app.api.deps import get_current_admin
from app.models.user import User
from app.schemas.rich_menu import SystemSettingBase, SystemSettingResponse
from app.services.settings_service import SettingsService
from app.models.system_setting import SystemSetting
from sqlalchemy import select
from pydantic import BaseModel

router = APIRouter()

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
