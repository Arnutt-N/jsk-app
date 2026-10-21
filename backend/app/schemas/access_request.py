from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.security import assert_bcrypt_compatible
from app.models.access_request import AccessRequestStatus
from app.models.user import UserRole


class AccessRequestCreate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=100)
    username: str = Field(..., min_length=3, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    phone_number: Optional[str] = Field(None, max_length=30)
    requested_role: UserRole = UserRole.AGENT
    reason: Optional[str] = Field(None, max_length=1000)


class AccessRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    requested_role: UserRole
    status: AccessRequestStatus
    created_at: Optional[str] = None


class AccessRequestApprove(BaseModel):
    password: str = Field(..., min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def _check_password_bytes(cls, v: str) -> str:
        return assert_bcrypt_compatible(v)


class AccessRequestReject(BaseModel):
    note: Optional[str] = Field(None, max_length=1000)
