"""Protect the last active SUPER_ADMIN across concurrent staff mutations."""
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole

_LOCK_KEY = "users:super_admin_set"


async def ensure_active_super_admin(
    db: AsyncSession,
    user_id: int,
    projected_role: UserRole,
    projected_is_active: bool,
) -> None:
    """Reject a change that would leave no active SUPER_ADMIN.

    A transaction-scoped advisory lock serializes every mutation that can
    shrink the active owner set. Re-reading the target under the lock avoids
    acting on a role loaded before another transaction promoted or demoted it.
    """
    await db.execute(
        select(func.pg_advisory_xact_lock(func.hashtext(_LOCK_KEY)))
    )
    current = (
        await db.execute(select(User.role, User.is_active).where(User.id == user_id))
    ).first()
    if current is None:
        return
    current_role, current_is_active = current
    was_owner = current_role == UserRole.SUPER_ADMIN and current_is_active
    will_be_owner = projected_role == UserRole.SUPER_ADMIN and projected_is_active
    if not was_owner or will_be_owner:
        return

    count = (
        await db.execute(
            select(func.count(User.id)).where(
                User.role == UserRole.SUPER_ADMIN,
                User.is_active.is_(True),
                User.id != user_id,
            )
        )
    ).scalar_one()
    if count < 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove the last active SUPER_ADMIN",
        )
