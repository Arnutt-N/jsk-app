from pydantic import BaseModel, Field, field_validator
from typing import Optional

from app.core.security import assert_bcrypt_compatible
from app.models.user import UserRole


class LoginRequest(BaseModel):
    # Kept named `username` for API compatibility -- accepts a username OR
    # an email address (matched case-insensitively, see _find_admin_by_identifier).
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


class ForgotPasswordRequest(BaseModel):
    username_or_email: str

    @field_validator("username_or_email")
    @classmethod
    def normalize_username_or_email(cls, value: str) -> str:
        return value.strip()


class ResetPasswordConfirm(BaseModel):
    token: str = Field(..., min_length=16)
    new_password: str = Field(..., min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def _check_password_bytes(cls, v: str) -> str:
        return assert_bcrypt_compatible(v)


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
