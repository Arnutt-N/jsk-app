"""
Pydantic schemas for Reply Object API
"""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum


class ObjectTypeEnum(str, Enum):
    TEXT = "text"
    FLEX = "flex"
    IMAGE = "image"
    STICKER = "sticker"
    VIDEO = "video"
    AUDIO = "audio"
    LOCATION = "location"


class ReplyObjectBase(BaseModel):
    object_id: str = Field(..., min_length=1, max_length=100, description="Unique identifier (e.g., flex_1, image_contact)")
    name: str = Field(..., min_length=1, max_length=255, description="Human-readable name")
    category: Optional[str] = Field(None, max_length=100, description="Category for organization")
    object_type: ObjectTypeEnum = Field(..., description="Type of message object")
    payload: Dict[str, Any] = Field(..., description="Message payload (JSON)")
    alt_text: Optional[str] = Field(None, max_length=400, description="Alt text for accessibility")
    preview_url: Optional[str] = Field(None, max_length=500, description="Preview image URL")


class ReplyObjectCreate(ReplyObjectBase):
    pass


class ReplyObjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    object_type: Optional[ObjectTypeEnum] = None
    payload: Optional[Dict[str, Any]] = None
    alt_text: Optional[str] = Field(None, max_length=400)
    preview_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class ReplyObjectResponse(ReplyObjectBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
