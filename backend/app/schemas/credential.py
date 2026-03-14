from pydantic import BaseModel, ConfigDict, Field
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
    metadata: Optional[Dict[str, Any]] = None
    is_active: bool = False
    is_default: bool = False

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
    credentials_masked: str # Masked version of credentials (e.g. "****F0A3")

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

class CredentialListResponse(BaseModel):
    credentials: List[CredentialResponse]
