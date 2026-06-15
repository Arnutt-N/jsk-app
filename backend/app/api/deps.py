import logging
from typing import AsyncGenerator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.db.session import AsyncSessionLocal
from app.core.config import settings
from app.core.security import verify_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

security = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)

async def get_db() -> AsyncGenerator:
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current user from JWT token or dev mode.
    
    In development mode, returns a mock admin user if no token provided.
    In production, requires a valid JWT token.
    """
    from app.models.user import User, UserRole
    
    # Dev auth bypass: ONLY when explicitly opted-in via DEV_AUTH_BYPASS=true
    if not credentials or not credentials.credentials:
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

    token = credentials.credentials

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
