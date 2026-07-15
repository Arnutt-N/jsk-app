import logging
import secrets
from typing import AsyncGenerator, Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.session import AsyncSessionLocal
from app.core.config import settings
from app.core.cookie_auth import ACCESS_COOKIE, CSRF_COOKIE
from app.core.security import verify_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

security = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)

# Methods that mutate state -- CSRF is only enforced on these when the
# request was authenticated via cookie (bearer-authenticated requests are
# exempt: headers aren't CSRF-able the way ambient cookies are).
_CSRF_PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

async def get_db() -> AsyncGenerator:
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current user from JWT token (cookie and/or Bearer, mode-aware) or dev mode.

    COOKIE_AUTH_MODE controls credential resolution (P1.1a FR2):
      - bearer (default): Authorization header only -- byte-identical to the
        pre-P1.1a behavior; an access_token cookie, if present, is ignored.
      - dual: access_token cookie first, falling back to the Authorization
        header only when no cookie is present.
      - cookie: access_token cookie only; the Authorization header is never
        consulted.

    Presence-based, not validity-based: once a source is selected because it
    is PRESENT, an invalid/expired token from that source 401s -- it never
    silently falls back to the other source.

    In development mode (DEV_AUTH_BYPASS=true), returns a mock admin user
    when NEITHER source produced a token. In production, requires a valid
    JWT token.
    """
    from app.models.user import User, UserRole

    token: Optional[str] = None
    token_source: Optional[str] = None

    if settings.COOKIE_AUTH_MODE in ("dual", "cookie"):
        cookie_token = request.cookies.get(ACCESS_COOKIE)
        if cookie_token:
            token, token_source = cookie_token, "cookie"

    if token is None and settings.COOKIE_AUTH_MODE != "cookie":
        if credentials and credentials.credentials:
            token, token_source = credentials.credentials, "bearer"

    # Exposed so endpoints (e.g. GET /auth/me) can tell whether THIS request
    # was actually authenticated via cookie, without re-deriving the same
    # mode-aware resolution logic.
    request.state.auth_token_source = token_source

    # Dev auth bypass: ONLY when explicitly opted-in via DEV_AUTH_BYPASS=true,
    # and ONLY when neither cookie nor header produced a candidate token.
    if not token:
        if settings.DEV_AUTH_BYPASS:
            logger.warning("DEV AUTH BYPASS: No token provided, returning mock admin")
            result = await db.execute(select(User).where(User.id == 1))
            user = result.scalar_one_or_none()
            if user:
                return user
            mock_user = User(
                id=1,
                username="admin",
                display_name="Admin (Dev)",
                role=UserRole.ADMIN
            )
            db.add(mock_user)
            await db.commit()
            return mock_user
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

    # CSRF double-submit enforcement (P1.1a FR3): only for cookie-sourced
    # auth on state-changing methods. Bearer-authenticated requests are
    # exempt. Implemented once, here, rather than per-endpoint.
    if token_source == "cookie" and request.method in _CSRF_PROTECTED_METHODS:
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
    Verify current user is an admin or super_admin.
    """
    from app.models.user import UserRole
    
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )
    return current_user


async def get_current_manager(
    current_user = Depends(get_current_user)
):
    """
    Verify current user is a manager-level role for request workflow.

    Allows SUPER_ADMIN, ADMIN, DIRECTOR, HEAD -- the roles that
    DEFAULT_POLICY grants assign/self-assign rights. Used by request
    workflow endpoints so DIRECTOR/HEAD can pass the outer gate and reach
    the inner can_assign/can_self_assign checks. Sensitive operations
    (revert, edit-details, delete) remain guarded by can_* helpers or by
    get_current_admin, so widening this gate does NOT escalate privilege.
    """
    from app.models.user import UserRole

    if current_user.role not in [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.DIRECTOR,
        UserRole.HEAD,
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )
    return current_user


async def get_current_staff(
    current_user = Depends(get_current_user)
):
    """
    Verify current user is an internal staff member.

    Allows every internal role -- ADMIN, SUPER_ADMIN, DIRECTOR, HEAD,
    AGENT -- but not the public USER role. DIRECTOR/HEAD added so the two
    mid-tier supervisor roles can reach staff-level surfaces (e.g. live
    chat) alongside front-line AGENTs.
    """
    from app.models.user import UserRole

    if current_user.role not in [
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
        UserRole.AGENT,
        UserRole.DIRECTOR,
        UserRole.HEAD,
    ]:
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
