from datetime import timedelta
from typing import Optional, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.audit import create_audit_log
from app.core.config import settings
from app.core.cookie_auth import (
    CSRF_COOKIE,
    REFRESH_COOKIE,
    clear_auth_cookies,
    issue_csrf_token,
    set_auth_cookies,
)
from app.core.rate_limiter import SlidingWindowLimiter
from app.core.redis_client import redis_client
from app.core.security import (
    create_access_token,
    verify_password_async,
    verify_token,
)
from app.models.user import User, UserRole
from app.schemas.auth import (
    AuthUserResponse,
    LoginRequest,
    LoginResponse,
    TokenResponse,
    WsTicketResponse,
)
from app.services.auth_session_service import (
    RotationOutcome,
    WS_TICKET_TTL_SECONDS,
    create_session_family,
    mint_ws_ticket,
    revoke_family,
    rotate_refresh_session,
)

router = APIRouter()

# Roles allowed to authenticate into the admin console. DIRECTOR and HEAD were
# added 2026-05-04 alongside the request workflow split; they share ADMIN-level
# access and must be able to both log in and refresh their token.
_ADMIN_AUTH_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.HEAD,
    UserRole.AGENT,
]

# Shared by /migrate-session and /ws-ticket. Backed by Redis (shared across
# workers) via a fixed-window counter, so the limit holds for the whole
# deployment rather than per instance; when Redis is unavailable it falls back
# to this in-process SlidingWindowLimiter (still limits, but per worker).
# Endpoints key their bucket with a per-route prefix so the two routes never
# share a bucket for the same user.
# POST /auth/login attempts per (IP+username) before 429 (M1 review fix).
# Settings-driven so the E2E workflow can raise the limit: its whole suite
# shares one client IP + the seeded admin username (~20 logins per run).
AUTH_RATE_LIMIT = settings.AUTH_LOGIN_RATE_LIMIT
AUTH_RATE_WINDOW = settings.AUTH_LOGIN_RATE_WINDOW
auth_rate_limiter = SlidingWindowLimiter(
    max_events=AUTH_RATE_LIMIT, window_seconds=AUTH_RATE_WINDOW
)


async def _auth_rate_limit_exceeded(key: str) -> bool:
    """True when `key` has exhausted its window and the request should 429.

    Tries the shared Redis bucket first; on Redis unavailability degrades to
    the in-process limiter above rather than failing open.
    """
    allowed = await redis_client.fixed_window_allow(
        f"ratelimit:auth:{key}",
        max_events=AUTH_RATE_LIMIT,
        window_seconds=AUTH_RATE_WINDOW,
    )
    if allowed is None:
        allowed = auth_rate_limiter.is_allowed(key)
    return not allowed

# Bearer-only credential extraction for /migrate-session -- deliberately NOT
# the mode-aware get_current_user dependency, so a cookie can never satisfy
# this endpoint (FR4: "accepts only Authorization: Bearer access-token auth").
_bearer_only = HTTPBearer(auto_error=False)


def _to_auth_user(user: User, *, csrf_token: Optional[str] = None) -> AuthUserResponse:
    return AuthUserResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        display_name=user.display_name,
        csrf_token=csrf_token,
    )


def _mask_username(username: str) -> str:
    """Mask a username for audit `details` -- first 2 chars + ellipsis, never
    the full value (P0.3 fail-closed redaction philosophy)."""
    return (username or "")[:2] + "…"


async def _load_admin_user(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.role.in_(_ADMIN_AUTH_ROLES),
        )
    )
    return result.scalar_one_or_none()


async def _login_failed(db: AsyncSession, username_masked: str) -> NoReturn:
    """Audit + reject any failed login. Never reveals which check failed."""
    await create_audit_log(
        db,
        admin_id=None,
        action="login_failed",
        resource_type="auth",
        resource_id=None,
        details={"username_masked": username_masked},
    )
    await db.commit()
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password",
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    username_masked = _mask_username(payload.username)

    # Throttle credential attempts BEFORE any DB/password work — /login was the
    # only auth route without a limiter (unlimited online password guessing).
    # Same limiter as migrate-session/ws-ticket (Redis bucket, in-process
    # fallback), keyed per client IP + username.
    if await _auth_rate_limit_exceeded(
        f"login:{request.client.host if request.client else 'unknown'}:{payload.username}"
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts, try again later",
        )

    result = await db.execute(
        select(User).where(
            User.username == payload.username,
            User.role.in_(_ADMIN_AUTH_ROLES),
        )
    )
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password:
        await _login_failed(db, username_masked)

    if not await verify_password_async(payload.password, user.hashed_password):
        await _login_failed(db, username_masked)

    if not user.is_active:
        await _login_failed(db, username_masked)

    access_token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    refresh_token, _family_id = await create_session_family(db, user.id)
    csrf_token = issue_csrf_token()
    set_auth_cookies(response, access=access_token, refresh=refresh_token, csrf=csrf_token)

    await create_audit_log(
        db,
        admin_id=user.id,
        action="login_success",
        resource_type="auth",
        resource_id=str(user.id),
        details={"username_masked": username_masked},
    )
    await db.commit()

    # Cookie-only: tokens live in HttpOnly cookies, never in the response body.
    return LoginResponse(
        access_token="",
        refresh_token="",
        token_type="bearer",
        csrf_token=csrf_token,
        user=_to_auth_user(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    refresh_token = request.cookies.get(REFRESH_COOKIE)

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    payload = verify_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    subject = payload.get("sub")
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Cookie-only refresh tokens are session-backed by construction: they are
    # issued exclusively by create_session_family and always carry a jti
    # claim. A token without jti cannot originate from this backend anymore.
    if not payload.get("jti"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    rotation = await rotate_refresh_session(db, payload)

    if rotation.outcome == RotationOutcome.REUSE_DETECTED:
        await create_audit_log(
            db,
            admin_id=rotation.user_id,
            action="refresh_reuse_detected",
            resource_type="auth",
            resource_id=str(rotation.user_id) if rotation.user_id else None,
            details={"family_id": rotation.family_id},
        )
        await db.commit()
        clear_auth_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if rotation.outcome == RotationOutcome.INVALID:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user = await _load_admin_user(db, rotation.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    access_token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    csrf_token = issue_csrf_token()
    set_auth_cookies(
        response, access=access_token, refresh=rotation.refresh_token, csrf=csrf_token
    )

    await create_audit_log(
        db,
        admin_id=user.id,
        action="refresh_rotated",
        resource_type="auth",
        resource_id=str(user.id),
        details={"family_id": rotation.family_id},
    )
    await db.commit()

    # Cookie-only: rotated tokens live in the cookies, never in the body.
    return TokenResponse(
        access_token="",
        refresh_token="",
        token_type="bearer",
        csrf_token=csrf_token,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Clear auth cookies and revoke the presented session's family.

    No CSRF requirement (it only destroys state). Idempotent: a
    request with no refresh cookie still clears cookies and returns 204.

    Mutates the FastAPI-injected `response` in place and returns None --
    constructing and returning a brand-new `Response(...)` here would
    silently discard the Set-Cookie headers `clear_auth_cookies` sets below
    (FastAPI only carries over the injected response's headers when the
    endpoint does NOT return its own Response object).
    """
    refresh_cookie = request.cookies.get(REFRESH_COOKIE)
    family_id: Optional[str] = None
    admin_id: Optional[int] = None

    if refresh_cookie:
        payload = verify_token(refresh_cookie)
        if payload and payload.get("type") == "refresh" and payload.get("family"):
            family_id = payload.get("family")
            await revoke_family(db, family_id)
            subject = payload.get("sub")
            try:
                admin_id = int(subject) if subject else None
            except (TypeError, ValueError):
                admin_id = None

    clear_auth_cookies(response)

    await create_audit_log(
        db,
        admin_id=admin_id,
        action="logout",
        resource_type="auth",
        resource_id=str(admin_id) if admin_id else None,
        details={"family_id": family_id} if family_id else {},
    )
    await db.commit()

    response.status_code = status.HTTP_204_NO_CONTENT
    return None


@router.post("/migrate-session", response_model=TokenResponse)
async def migrate_session(
    response: Response,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_only),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Exchange a Bearer access token for a cookie session (FR4).

    Bearer-only by construction (see `_bearer_only` above) -- a cookie can
    never satisfy this endpoint's auth. This is the sole remaining Bearer
    surface in the app, kept deliberately for one-time migration of legacy
    localStorage tokens.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    subject = payload.get("sub")
    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await _load_admin_user(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if await _auth_rate_limit_exceeded(f"migrate:{user.id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many session-migration attempts, try again later",
        )

    refresh_token, family_id = await create_session_family(db, user.id)
    csrf_token = issue_csrf_token()
    access_token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    set_auth_cookies(response, access=access_token, refresh=refresh_token, csrf=csrf_token)

    await create_audit_log(
        db,
        admin_id=user.id,
        action="migrate_session",
        resource_type="auth",
        resource_id=str(user.id),
        details={"family_id": family_id},
    )
    await db.commit()

    # Cookie-only: tokens live in the cookies, never in the body.
    return TokenResponse(
        access_token="",
        refresh_token="",
        token_type="bearer",
        csrf_token=csrf_token,
    )


@router.post("/ws-ticket", response_model=WsTicketResponse)
async def issue_ws_ticket(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WsTicketResponse:
    """Mint a single-use, short-lived WebSocket auth ticket (FR6).

    Cookie-authenticated via get_current_user. Rate-limited like
    migrate-session.
    """
    if await _auth_rate_limit_exceeded(f"ws-ticket:{current_user.id}"):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many ticket requests, try again later",
        )

    ticket = await mint_ws_ticket(db, current_user.id)

    await create_audit_log(
        db,
        admin_id=current_user.id,
        action="ws_ticket_mint",
        resource_type="auth",
        resource_id=str(current_user.id),
        details={},
    )
    await db.commit()

    return WsTicketResponse(ticket=ticket, expires_in=WS_TICKET_TTL_SECONDS)


@router.get("/me", response_model=AuthUserResponse)
async def me(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> AuthUserResponse:
    csrf_token: Optional[str] = None
    if getattr(request.state, "auth_token_source", None) == "cookie":
        csrf_token = request.cookies.get(CSRF_COOKIE)
    return _to_auth_user(current_user, csrf_token=csrf_token)
