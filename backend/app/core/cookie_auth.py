"""Cookie/CSRF constants and helpers for the P1.1a dual-mode auth foundation.

Centralizes cookie names, paths, and attributes so `set_auth_cookies` and
`clear_auth_cookies` can never drift from each other — a mismatched `path`
(or any other attribute) on `delete_cookie` silently no-ops in browsers,
leaving the old cookie in place (see Starlette docs; this is PRD FR2/test 7's
subject). SameSite is `Lax` here; `Strict` is deferred to PR 2C per the
recorded design (`docs/remediation/preflight-evidence-and-designs.md` §5).
"""
import secrets
from typing import Optional

from fastapi import Response

from app.core.config import settings
from app.core.security import REFRESH_TOKEN_EXPIRE_DAYS

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"

# Scoping the refresh cookie to /api/v1/auth means it is never sent on
# ordinary API requests -- only to the auth endpoints that need it
# (refresh/logout/migrate-session), shrinking its exposure surface.
ACCESS_COOKIE_PATH = "/api/v1"
REFRESH_COOKIE_PATH = "/api/v1/auth"

COOKIE_SAMESITE = "lax"

_ACCESS_MAX_AGE_SECONDS = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
_REFRESH_MAX_AGE_SECONDS = REFRESH_TOKEN_EXPIRE_DAYS * 86400


def issue_csrf_token() -> str:
    """Generate a new opaque CSRF token value (never logged, never persisted)."""
    return secrets.token_urlsafe(32)


def _cookie_kwargs(*, path: str, max_age: int) -> dict:
    return {
        "path": path,
        "max_age": max_age,
        "httponly": True,
        "secure": settings.is_production_like,
        "samesite": COOKIE_SAMESITE,
    }


def set_auth_cookies(
    response: Response,
    *,
    access: str,
    refresh: str,
    csrf: str,
) -> None:
    """Set the access/refresh/csrf cookie triple with matching attributes.

    Called from login/refresh/migrate-session whenever
    `settings.COOKIE_AUTH_MODE` is `dual` or `cookie`.
    """
    response.set_cookie(
        ACCESS_COOKIE,
        access,
        **_cookie_kwargs(path=ACCESS_COOKIE_PATH, max_age=_ACCESS_MAX_AGE_SECONDS),
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        **_cookie_kwargs(path=REFRESH_COOKIE_PATH, max_age=_REFRESH_MAX_AGE_SECONDS),
    )
    response.set_cookie(
        CSRF_COOKIE,
        csrf,
        **_cookie_kwargs(path=ACCESS_COOKIE_PATH, max_age=_REFRESH_MAX_AGE_SECONDS),
    )


def clear_auth_cookies(response: Response) -> None:
    """Clear all three auth cookies using the SAME attributes used at set time.

    `Response.delete_cookie` without matching `path`/`secure`/`httponly`/
    `samesite` silently no-ops in the browser (the cookie jar keys on the
    full attribute set, not just the name) -- always pass the same values
    used in `set_auth_cookies` above.
    """
    response.delete_cookie(
        ACCESS_COOKIE,
        path=ACCESS_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production_like,
        samesite=COOKIE_SAMESITE,
    )
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production_like,
        samesite=COOKIE_SAMESITE,
    )
    response.delete_cookie(
        CSRF_COOKIE,
        path=ACCESS_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production_like,
        samesite=COOKIE_SAMESITE,
    )
