from pydantic import BaseModel, ConfigDict, Field, AliasChoices
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any

class Provider(str, Enum):
    LINE = "LINE"
    TELEGRAM = "TELEGRAM"
    N8N = "N8N"
    GOOGLE_SHEETS = "GOOGLE_SHEETS"
    CUSTOM = "CUSTOM"

class CredentialBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    provider: Provider
    # NOTE: alias order is ("metadata_json", "metadata"), NOT the reverse.
    # The ORM instance (app/models/credential.py) always has a `metadata`
    # attribute -- it's SQLAlchemy's inherited Base.metadata registry
    # (a MetaData object), which exists via getattr regardless of the JSONB
    # column. AliasChoices picks the FIRST alias that resolves (via hasattr
    # for objects / "in" for dicts) -- it does not fall through on a type
    # mismatch. So "metadata" first would always resolve to Base.metadata
    # and fail validation. "metadata_json" first correctly hits the real
    # column for ORM objects, while dict/JSON input (which has no
    # "metadata_json" key) still falls through to "metadata" as before.
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        validation_alias=AliasChoices("metadata_json", "metadata"),
        serialization_alias="metadata",
    )
    is_active: bool = False
    is_default: bool = False

    model_config = ConfigDict(populate_by_name=True)

class CredentialCreate(CredentialBase):
    credentials: Dict[str, Any] # Raw dict to be encrypted

class CredentialUpdate(BaseModel):
    name: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None

class CredentialResponse(CredentialBase):
    id: int
    created_at: datetime
    updated_at: datetime
    credentials_masked: str = "" # Masked version of credentials (e.g. "****F0A3"); set by
    # the endpoint right after model_validate() -- default keeps validation
    # from failing on a bare ORM object that has no such attribute.

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

class CredentialListResponse(BaseModel):
    credentials: List[CredentialResponse]
