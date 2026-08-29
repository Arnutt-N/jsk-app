import logging
import secrets
from typing import AsyncGenerator, Optional
from fastapi import Depends, HTTPException, Request, status
from app.db.session import AsyncSessionLocal
from app.core.config import settings
from app.core.cookie_auth import ACCESS_COOKIE, CSRF_COOKIE
from app.core.permissions import (
    can,
    KEY_ACCESS_ADMIN_ENDPOINTS,
    KEY_ACCESS_MANAGER_ENDPOINTS,
    KEY_ACCESS_STAFF_ENDPOINTS,
)
from app.core.security import verify_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Methods that mutate state -- CSRF is enforced on these for every request:
# all authenticated requests are cookie-sourced since the auth mode-flag
# cleanup removed the Bearer path.
_CSRF_PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

async def get_db() -> AsyncGenerator:
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Get current user from the access_token cookie, or dev mode.

    Cookie-only since the auth mode-flag cleanup: the Authorization header
    is never consulted on app endpoints (the sole exception is
    POST /auth/migrate-session, which uses its own _bearer_only extraction by
    design to convert legacy Bearer tokens into cookie sessions).

    Presence-based, not validity-based: when a cookie is PRESENT, an
    invalid/expired token 401s -- there is no other source to fall back to.

    In development mode (DEV_AUTH_BYPASS=true), returns a mock admin user
    when NO cookie was presented. In production, requires a valid JWT token.
    """
    from app.models.user import User, UserRole

    cookie_token = request.cookies.get(ACCESS_COOKIE)
    token: Optional[str] = cookie_token or None
    token_source: Optional[str] = "cookie" if token else None

    # Exposed so endpoints (e.g. GET /auth/me) can tell that THIS request was
    # authenticated via cookie.
    request.state.auth_token_source = token_source

    # Dev auth bypass: ONLY when explicitly opted-in via DEV_AUTH_BYPASS=true,
    # and ONLY when no cookie produced a candidate token.
    if not token:
        if settings.DEV_AUTH_BYPASS:
            logger.warning("DEV AUTH BYPASS: No token provided, looking up admin user id=1")
            result = await db.execute(select(User).where(User.id == 1))
            user = result.scalar_one_or_none()
            if user:
                return user
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="DEV_AUTH_BYPASS enabled but no admin user (id=1) exists. Seed the database first.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"}
        )

    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token_type = payload.get("type")
    if token_type and token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"}
        )

    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"}
        )

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # CSRF double-submit enforcement (P1.1a FR3): applies to all
    # state-changing methods -- every authenticated request is cookie-sourced.
    # Implemented once, here, rather than per-endpoint.
    if request.method in _CSRF_PROTECTED_METHODS:
        header_csrf = request.headers.get("x-csrf-token")
        cookie_csrf = request.cookies.get(CSRF_COOKIE)
        if not header_csrf or not cookie_csrf or not secrets.compare_digest(header_csrf, cookie_csrf):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token missing or invalid",
            )

    return user


async def get_current_admin(
    current_user = Depends(get_current_user)
):
    """
    Verify current user has access to admin-level endpoints.

    Gate is now DB-configurable via the `access_admin_endpoints`
    permission key (P1.2a). DEFAULT_POLICY = {SUPER_ADMIN, ADMIN}
    mirrors the pre-P1.2a hardcoded set, so the PR ships dark.

    Matrix endpoints (settings.py:121,139,232 — GET/PATCH /permissions,
    GET /permissions/me) still use this gate intentionally. They are NOT
    converted to `can()` because that would create a self-referential
    lockout: if SUPER_ADMIN removed themselves from
    `access_admin_endpoints`, they'd lose access to `PATCH /permissions`
    — the only endpoint that can re-add them. The existing SUPER_ADMIN
    lockout safeguard (settings.py:176-180) rejects removing SUPER_ADMIN
    from any key, but keeping the matrix endpoint on this gate (which
    reads DEFAULT_POLICY including SUPER_ADMIN) is the second defense
    layer against direct-DB lockout.
    """
    from app.models.user import UserRole

    if not can(current_user.role, KEY_ACCESS_ADMIN_ENDPOINTS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )
    return current_user


async def get_current_manager(
    current_user = Depends(get_current_user)
):
    """
    Verify current user has access to manager-level endpoints
    (request workflow: stats, detail, assign, comments).

    Gate is now DB-configurable via the `access_manager_endpoints`
    permission key (P1.2a). DEFAULT_POLICY = {SUPER_ADMIN, ADMIN,
    DIRECTOR, HEAD} mirrors the pre-P1.2a hardcoded set. SUPER_ADMIN
    is NOT locked into this key (unlike access_admin_endpoints) —
    removing SUPER_ADMIN here just loses access to request workflow,
    recoverable via the matrix endpoint (still reachable through
    access_admin_endpoints).
    """
    from app.models.user import UserRole

    if not can(current_user.role, KEY_ACCESS_MANAGER_ENDPOINTS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )
    return current_user


async def get_current_staff(
    current_user = Depends(get_current_user)
):
    """
    Verify current user has access to staff-level endpoints
    (live-chat HTTP endpoints in admin_live_chat.py).

    Gate is now DB-configurable via the `access_staff_endpoints`
    permission key (P1.2a). DEFAULT_POLICY = {SUPER_ADMIN, ADMIN, AGENT,
    DIRECTOR, HEAD} mirrors the pre-P1.2a hardcoded set. This is the
    HTTP gate (page load); NEW-3's `access_live_chat` is the WebSocket
    gate — different layers, not redundant. SUPER_ADMIN is NOT locked
    into this key (recoverable via the matrix endpoint).

    TWO-GATE DESIGN (do NOT tighten this gate):
    This HTTP gate is permissive (lets DIRECTOR/HEAD LOAD the live-chat
    page) so supervisors can discover the feature and ask SUPER_ADMIN for
    WS access. The WS gate (ws_live_chat.py:_load_and_authorize_ws_user
    + sessions.py:transfer_session) checks `can(role, KEY_ACCESS_LIVE_CHAT)`
    — the real access control. Under DEFAULT_POLICY (DIRECTOR/HEAD not in
    access_live_chat) a DIRECTOR can load the page but the WS connection
    is rejected. This is intentional. Tightening this HTTP gate to match
    the WS gate would hide the page from supervisors and break the
    discoverability path.
    """
    from app.models.user import UserRole

    if not can(current_user.role, KEY_ACCESS_STAFF_ENDPOINTS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )
    return current_user


def require_permission(key: str):
    """Dependency factory: gate a route on a single module permission key.

    Returns an async dependency that resolves the authenticated user via
    `get_current_user`, then checks the DB-backed module policy (cached,
    with DEFAULT_POLICY fallback) for `key`. Raises 403 when the user's
    role lacks the key. Authentication (401) is still enforced upstream by
    `get_current_user`. Fails closed: an unknown key resolves to an empty
    allowed-set -> 403.

    Usage:
        @router.post("/")
        async def create(..., current_admin = Depends(require_permission(KEY_MANAGE_BROADCAST))):
    """
    async def _dependency(current_user = Depends(get_current_user)):
        from app.core.permissions import can

        if not can(current_user.role, key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="คุณไม่มีสิทธิ์ดำเนินการนี้",
            )
        return current_user

    return _dependency
