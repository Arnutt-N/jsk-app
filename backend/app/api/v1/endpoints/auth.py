from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
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
from app.core.security import (
    create_access_token,
    create_refresh_token,
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

# Shared by /migrate-session and /ws-ticket. In-memory, per-process --
# acceptable per PRD FR4/FR6 (this is not a distributed rate limiter; a
# horizontally-scaled deployment gets independent per-instance limits, which
# is a bounded-abuse tradeoff, not a security hole). Endpoints key their
# bucket with a per-route prefix so the two routes never share a bucket for
# the same user.
auth_rate_limiter = SlidingWindowLimiter(max_events=5, window_seconds=60)

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


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    username_masked = _mask_username(payload.username)

    result = await db.execute(
        select(User).where(
            User.username == payload.username,
            User.role.in_(_ADMIN_AUTH_ROLES),
        )
    )
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password:
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

    if not await verify_password_async(payload.password, user.hashed_password):
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

    if not user.is_active:
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

    access_token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    body_access_token = access_token
    body_refresh_token: Optional[str] = None
    csrf_token: Optional[str] = None

    if settings.COOKIE_AUTH_MODE in ("dual", "cookie"):
        refresh_token, family_id = await create_session_family(db, user.id)
        csrf_token = issue_csrf_token()
        set_auth_cookies(response, access=access_token, refresh=refresh_token, csrf=csrf_token)

        if settings.COOKIE_AUTH_MODE == "cookie":
            body_access_token = ""
            body_refresh_token = ""
        else:  # dual: old frontend still works via the body tokens too
            body_refresh_token = refresh_token
    else:  # bearer: today's code path, byte-identical
        body_refresh_token = create_refresh_token(subject=user.id)

    await create_audit_log(
        db,
        admin_id=user.id,
        action="login_success",
        resource_type="auth",
        resource_id=str(user.id),
        details={"username_masked": username_masked},
    )
    await db.commit()

    return LoginResponse(
        access_token=body_access_token,
        refresh_token=body_refresh_token,
        token_type="bearer",
        csrf_token=csrf_token,
        user=_to_auth_user(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    refresh_token: Optional[str] = None
    source: Optional[str] = None

    if settings.COOKIE_AUTH_MODE in ("dual", "cookie"):
        cookie_token = request.cookies.get(REFRESH_COOKIE)
        if cookie_token:
            refresh_token, source = cookie_token, "cookie"

    if refresh_token is None and settings.COOKIE_AUTH_MODE != "cookie":
        if authorization and authorization.startswith("Bearer "):
            refresh_token = authorization.removeprefix("Bearer ").strip()
            source = "header"

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

    # A refresh token is "session-backed" only when it arrived via the
    # refresh cookie AND carries a jti claim (cookie/migrate-session-issued
    # tokens always do). Header-carried tokens stay on the legacy stateless
    # path even in dual mode (Task 6 GOTCHA -- deliberate scope decision:
    # upgrading them would create one session family per refresh from
    # pre-2B frontends, sprawl with no security benefit).
    session_backed = source == "cookie" and bool(payload.get("jti"))

    if settings.COOKIE_AUTH_MODE == "cookie" and not session_backed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    if session_backed:
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

        body_omitted = settings.COOKIE_AUTH_MODE == "cookie"

        await create_audit_log(
            db,
            admin_id=user.id,
            action="refresh_rotated",
            resource_type="auth",
            resource_id=str(user.id),
            details={"family_id": rotation.family_id},
        )
        await db.commit()

        return TokenResponse(
            access_token="" if body_omitted else access_token,
            refresh_token="" if body_omitted else rotation.refresh_token,
            token_type="bearer",
            csrf_token=csrf_token,
        )

    # Legacy stateless path: header-sourced refresh token (bearer mode, or a
    # pre-2B dual-mode frontend). Byte-identical to pre-P1.1a behavior --
    # only a new access token is issued, the refresh token itself is not
    # rotated and no auth_sessions row is written.
    user = await _load_admin_user(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    access_token = create_access_token(
        subject=user.id,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Clear auth cookies and revoke the presented session's family.

    All modes, no CSRF requirement (it only destroys state). Idempotent: a
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
    never satisfy this endpoint's auth. Does not invalidate the presented
    Bearer token (dual mode tolerates both until PR 2C).
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

    if settings.COOKIE_AUTH_MODE == "bearer":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cookie auth mode is not enabled",
        )

    if not auth_rate_limiter.is_allowed(f"migrate:{user.id}"):
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

    body_omitted = settings.COOKIE_AUTH_MODE == "cookie"

    await create_audit_log(
        db,
        admin_id=user.id,
        action="migrate_session",
        resource_type="auth",
        resource_id=str(user.id),
        details={"family_id": family_id},
    )
    await db.commit()

    return TokenResponse(
        access_token="" if body_omitted else access_token,
        refresh_token="" if body_omitted else refresh_token,
        token_type="bearer",
        csrf_token=csrf_token,
    )


@router.post("/ws-ticket", response_model=WsTicketResponse)
async def issue_ws_ticket(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WsTicketResponse:
    """Mint a single-use, short-lived WebSocket auth ticket (FR6).

    Any auth mode/credential type accepted (delegates to the mode-aware
    get_current_user). Rate-limited like migrate-session.
    """
    if not auth_rate_limiter.is_allowed(f"ws-ticket:{current_user.id}"):
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
