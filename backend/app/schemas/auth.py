from pydantic import BaseModel, field_validator
from typing import Optional

from app.models.user import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip()


class AuthUserResponse(BaseModel):
    id: int
    username: Optional[str] = None
    role: UserRole
    display_name: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"


class LoginResponse(TokenResponse):
    user: AuthUserResponse
