"""
Pydantic schemas for Reply Object API
"""
from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

from app.schemas.reply_object_validation import validate_payload_for_type


class ObjectTypeEnum(str, Enum):
    TEXT = "text"
    FLEX = "flex"
    IMAGE = "image"
    STICKER = "sticker"
    VIDEO = "video"
    AUDIO = "audio"
    LOCATION = "location"
    IMAGEMAP = "imagemap"
    TEMPLATE = "template"
    TEXT_V2 = "text_v2"


class ReplyObjectBase(BaseModel):
    object_id: str = Field(..., min_length=1, max_length=100, description="Unique identifier (e.g., flex_1, image_contact)")
    name: str = Field(..., min_length=1, max_length=255, description="Human-readable name")
    category: Optional[str] = Field(None, max_length=100, description="Category for organization")
    object_type: ObjectTypeEnum = Field(..., description="Type of message object")
    payload: Dict[str, Any] = Field(..., description="Message payload (JSON)")
    alt_text: Optional[str] = Field(None, max_length=400, description="Alt text for accessibility")
    preview_url: Optional[str] = Field(None, max_length=500, description="Preview image URL")

    @model_validator(mode="after")
    def _validate_payload_shape(self):
        validate_payload_for_type(self.object_type.value, self.payload)
        return self


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

    @model_validator(mode="after")
    def _validate_payload_shape(self):
        # On update we can only validate when both the type and payload are given.
        if self.object_type is not None and self.payload is not None:
            validate_payload_for_type(self.object_type.value, self.payload)
        return self


class ReplyObjectResponse(ReplyObjectBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
