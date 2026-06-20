from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import List, Dict, Any, Optional, Literal
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
    type: Literal["uri", "message", "postback", "datetimepicker", "richmenuswitch"]
    label: Optional[str] = None
    uri: Optional[str] = None
    text: Optional[str] = None
    data: Optional[str] = None  # richmenuswitch: optional (LINE returns data="" if omitted)
    displayText: Optional[str] = None
    richMenuAliasId: Optional[str] = None  # required only when type == "richmenuswitch"

    @model_validator(mode="after")
    def _validate_richmenuswitch(self):
        if self.type == "richmenuswitch" and not self.richMenuAliasId:
            raise ValueError("richMenuAliasId is required for richmenuswitch action")
        return self

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

class RichMenuUpdate(BaseModel):
    # PUT /{id}: no template_type (layout fixed after creation) so update_rich_menu
    # must NOT call resolve_rich_menu_size(). Avoids the latent 422 on edit-save.
    name: str
    chat_bar_text: str
    areas: List[RichMenuArea]

class RichMenuAliasCreate(BaseModel):
    alias_id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,50}$")
    rich_menu_id: int

class RichMenuAliasUpdate(BaseModel):
    rich_menu_id: int

class RichMenuAliasResponse(BaseModel):
    id: int
    alias_id: str
    rich_menu_id: int
    sync_status: str
    last_synced_at: Optional[datetime]
    last_sync_error: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)

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
