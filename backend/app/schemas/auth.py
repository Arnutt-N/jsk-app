from pydantic import BaseModel, Field, field_validator
from typing import Optional

from app.core.security import assert_bcrypt_compatible
from app.models.user import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str = Field(..., max_length=72)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip()

    @field_validator("password")
    @classmethod
    def _check_password_bytes(cls, value: str) -> str:
        return assert_bcrypt_compatible(value)


class AuthUserResponse(BaseModel):
    id: int
    username: Optional[str] = None
    role: UserRole
    display_name: Optional[str] = None
    # P1.1a: echoed (never rotated) when the request was cookie-authenticated
    # and a csrf_token cookie exists, so a page refresh can recover the
    # header value without forcing re-login. None when the request wasn't
    # cookie-authenticated.
    csrf_token: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    # P1.1a: set alongside Set-Cookie on login/refresh/migrate-session.
    csrf_token: Optional[str] = None


class LoginResponse(TokenResponse):
    user: AuthUserResponse


class WsTicketResponse(BaseModel):
    """Response for POST /auth/ws-ticket (P1.1a FR6). `ticket` is the raw,
    single-use value -- only its hash is persisted server-side."""

    ticket: str
    expires_in: int
