import re
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.security import assert_bcrypt_compatible
from app.models.access_request import AccessRequestStatus
from app.models.user import UserRole

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AccessRequestCreate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=100)
    username: str = Field(..., min_length=3, max_length=50)
    email: Optional[str] = Field(None, max_length=255)

    @field_validator("email")
    @classmethod
    def _check_email_format(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _EMAIL_RE.match(v):
            raise ValueError("รูปแบบอีเมลไม่ถูกต้อง")
        return v
    phone_number: Optional[str] = Field(None, max_length=30)
    requested_role: UserRole = UserRole.AGENT
    reason: Optional[str] = Field(None, max_length=1000)

    @field_validator("display_name")
    @classmethod
    def _strip_display_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("กรุณากรอกชื่อที่แสดง")
        return v

    @field_validator("username")
    @classmethod
    def _strip_username(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร")
        return v

    @field_validator("email", "phone_number", "reason")
    @classmethod
    def _strip_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


class AccessRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    requested_role: UserRole
    reason: Optional[str] = None
    status: AccessRequestStatus
    review_note: Optional[str] = None
    created_at: Optional[str] = None


class AccessRequestApprove(BaseModel):
    password: str = Field(..., min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def _check_password_bytes(cls, v: str) -> str:
        return assert_bcrypt_compatible(v)


class AccessRequestReject(BaseModel):
    note: Optional[str] = Field(None, max_length=1000)
