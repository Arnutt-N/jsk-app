"""
Pydantic schemas for Auto Reply API
"""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict, Any
from datetime import datetime
from app.models.auto_reply import MatchType, ReplyType


class AutoReplyBase(BaseModel):
    keyword: str = Field(..., min_length=1, max_length=255, description="Keyword to match")
    match_type: MatchType = Field(default=MatchType.CONTAINS, description="How to match the keyword")
    reply_type: ReplyType = Field(default=ReplyType.TEXT, description="Type of reply")
    text_content: Optional[str] = Field(None, description="Text response (can include $object_id references)")
    payload: Optional[Dict[str, Any]] = Field(None, description="Direct payload for legacy Flex messages")


class AutoReplyCreate(AutoReplyBase):
    pass


class AutoReplyUpdate(BaseModel):
    keyword: Optional[str] = Field(None, min_length=1, max_length=255)
    match_type: Optional[MatchType] = None
    reply_type: Optional[ReplyType] = None
    text_content: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class AutoReplyResponse(AutoReplyBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
