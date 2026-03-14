from pydantic import BaseModel, ConfigDict, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.models.rich_menu import RichMenuStatus

class SystemSettingBase(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

class SystemSettingResponse(SystemSettingBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)

class RichMenuAreaBounds(BaseModel):
    x: int
    y: int
    width: int
    height: int

class RichMenuAreaAction(BaseModel):
    type: str
    label: Optional[str] = None
    uri: Optional[str] = None
    text: Optional[str] = None
    data: Optional[str] = None
    displayText: Optional[str] = None

class RichMenuArea(BaseModel):
    bounds: RichMenuAreaBounds
    action: RichMenuAreaAction

class RichMenuConfig(BaseModel):
    size: Dict[str, int] # e.g. {"width": 2500, "height": 1686}
    selected: bool = False
    name: str
    chatBarText: str
    areas: List[RichMenuArea]

class RichMenuCreate(BaseModel):
    name: str
    chat_bar_text: str
    template_type: str # e.g. "3-buttons", "6-buttons"
    areas: List[RichMenuArea] # Final calculated areas

class RichMenuResponse(BaseModel):
    id: int
    name: str
    chat_bar_text: str
    line_rich_menu_id: Optional[str]
    config: Dict[str, Any]
    image_path: Optional[str]
    status: RichMenuStatus
    sync_status: str
    last_synced_at: Optional[datetime]
    last_sync_error: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)
