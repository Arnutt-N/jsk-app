from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Annotated, List, Dict, Any, Optional, Literal
from datetime import datetime
from app.models.rich_menu import RichMenuStatus

# LINE userId: "U" + 32 lowercase hex chars (33 total). Validated per-element.
LineUserId = Annotated[str, Field(pattern=r"^U[0-9a-f]{32}$")]

# Bulk link/unlink accept 1..500 userIds. The outer Field caps the LIST length;
# a plain Field(max_length=...) on List[str] is silently ignored by Pydantic v2,
# so the Annotated wrapper is required for the cap to actually enforce.
LineUserIdList = Annotated[List[LineUserId], Field(min_length=1, max_length=500)]

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

class BulkLinkRequest(BaseModel):
    # POST /richmenu/bulk/link → {"richMenuId": ..., "userIds": [...]}
    rich_menu_id: int
    user_ids: LineUserIdList

class BulkUnlinkRequest(BaseModel):
    # POST /richmenu/bulk/unlink → {"userIds": [...]} (no rich_menu_id)
    user_ids: LineUserIdList

class RichMenuResponse(BaseModel):
    id: int
    name: str
    chat_bar_text: str
    line_rich_menu_id: Optional[str]
    config: Dict[str, Any]
    # URL the admin frontend can put in <img src>. Populated by the endpoints
    # from image_media_id (never an ORM attribute — defaults to None so every
    # response path validates even before the endpoint fills it in).
    image_url: Optional[str] = None
    status: RichMenuStatus
    sync_status: str
    last_synced_at: Optional[datetime]
    last_sync_error: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    # Number of users currently bound to this menu (rows in user_rich_menu_links).
    # Populated by the list endpoint via a grouped count; defaults to 0.
    user_link_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# ── Rich Menu Insight Schemas ──────────────────────────────────────────────────


class InsightMetric(BaseModel):
    count: int = 0
    unique_users: int = Field(0, alias="uniqueUsers")

    model_config = ConfigDict(populate_by_name=True)


class InsightClickBound(BaseModel):
    bound: str
    count: int = 0
    unique_users: int = Field(0, alias="uniqueUsers")

    model_config = ConfigDict(populate_by_name=True)


class RichMenuInsightSummaryResponse(BaseModel):
    rich_menu_id: str = Field(alias="richMenuId")
    metrics_from: Optional[str] = Field(None, alias="metricsFrom")
    metrics_to: Optional[str] = Field(None, alias="metricsTo")
    impression: Optional[InsightMetric] = None
    clicks: Optional[List[InsightClickBound]] = None
    privacy_restricted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class InsightDailyMetricPoint(BaseModel):
    date: str
    count: int = 0
    unique_users: int = Field(0, alias="uniqueUsers")

    model_config = ConfigDict(populate_by_name=True)


class InsightDailyImpression(BaseModel):
    metrics: List[InsightDailyMetricPoint] = []


class InsightDailyClick(BaseModel):
    bound: str
    metrics: List[InsightDailyMetricPoint] = []


class RichMenuInsightDailyResponse(BaseModel):
    rich_menu_id: str = Field(alias="richMenuId")
    metrics_from: Optional[str] = Field(None, alias="metricsFrom")
    metrics_to: Optional[str] = Field(None, alias="metricsTo")
    impression: Optional[InsightDailyImpression] = None
    clicks: Optional[List[InsightDailyClick]] = None
    privacy_restricted: bool = False

    model_config = ConfigDict(populate_by_name=True)
