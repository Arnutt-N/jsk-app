"""User management endpoints for admin dashboard."""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from typing import List, Optional

from app.db.session import get_db
from app.api.deps import get_current_admin
from app.models.user import User, UserRole
from app.models.service_request import ServiceRequest, RequestStatus
from app.core.security import get_password_hash, verify_password
from pydantic import BaseModel, ConfigDict, EmailStr, Field
import math

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None
    picture_url: Optional[str] = None
    role: UserRole
    is_active: bool
    line_user_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class UserListResponse(BaseModel):
    users: List[UserOut]
    total: int
    page: int
    per_page: int
    total_pages: int


class UserStatsResponse(BaseModel):
    total: int
    active: int
    inactive: int
    super_admins: int
    admins: int
    agents: int
    users: int


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    display_name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None
    role: UserRole = UserRole.AGENT


class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8)


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8)


class UserWorkload(BaseModel):
    id: int
    display_name: Optional[str] = None
    role: UserRole
    # active_tasks = sum of all OPEN (non-terminal) states the user owns:
    #   PENDING + ACKNOWLEDGED + IN_PROGRESS + AWAITING_APPROVAL
    active_tasks: int
    # PENDING with this user as assignee but not yet acknowledged ("รอรับเรื่อง")
    awaiting_ack_tasks: int
    # ACKNOWLEDGED ("รอดำเนินการ" -- queued)
    acknowledged_tasks: int
    in_progress_tasks: int
    awaiting_approval_tasks: int
    # Legacy alias kept for backwards compat with older frontend code
    pending_tasks: int


# ── Helpers ──────────────────────────────────────────────────────────


def _check_role_permission(current_user: User, target_role: UserRole) -> None:
    """Check if current user can manage users of the given role."""
    if target_role == UserRole.SUPER_ADMIN:
        if current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only SUPER_ADMIN can manage SUPER_ADMIN users",
            )
    elif target_role == UserRole.ADMIN:
        if current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only SUPER_ADMIN can manage ADMIN users",
            )
    elif target_role == UserRole.AGENT:
        if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only ADMIN or SUPER_ADMIN can manage AGENT users",
            )


# ── Endpoints ────────────────────────────────────────────────────────


@router.get("/stats", response_model=UserStatsResponse)
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Get user statistics grouped by role and status."""
    result = await db.execute(
        select(
            func.count(User.id).label("total"),
            func.count(User.id).filter(User.is_active == True).label("active"),
            func.count(User.id).filter(User.is_active == False).label("inactive"),
            func.count(User.id).filter(User.role == UserRole.SUPER_ADMIN).label("super_admins"),
            func.count(User.id).filter(User.role == UserRole.ADMIN).label("admins"),
            func.count(User.id).filter(User.role == UserRole.AGENT).label("agents"),
            func.count(User.id).filter(User.role == UserRole.USER).label("users"),
        )
    )
    row = result.one()
    return UserStatsResponse(
        total=row.total,
        active=row.active,
        inactive=row.inactive,
        super_admins=row.super_admins,
        admins=row.admins,
        agents=row.agents,
        users=row.users,
    )


@router.get("", response_model=UserListResponse)
async def list_users(
    role: Optional[UserRole] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """List users with pagination and filters."""
    query = select(User)
    count_query = select(func.count(User.id))

    filters = []
    if role:
        filters.append(User.role == role)
    if is_active is not None:
        filters.append(User.is_active == is_active)
    if search:
        filters.append(
            or_(
                User.display_name.ilike(f"%{search}%"),
                User.username.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
            )
        )

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    # Total count
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    total_pages = max(1, math.ceil(total / per_page))

    # Paginated results
    offset = (page - 1) * per_page
    query = query.order_by(User.created_at.desc()).offset(offset).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    return UserListResponse(
        users=[
            UserOut(
                id=u.id,
                username=u.username,
                email=u.email,
                display_name=u.display_name,
                picture_url=u.picture_url,
                role=u.role,
                is_active=u.is_active,
                line_user_id=u.line_user_id,
                created_at=u.created_at.isoformat() if u.created_at else None,
                updated_at=u.updated_at.isoformat() if u.updated_at else None,
            )
            for u in users
        ],
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.get("/workload", response_model=List[UserWorkload])
async def list_user_workload(
    role: Optional[UserRole] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """List users with their current workload statistics (used by assignment UI)."""
    query = select(User)

    if role:
        query = query.where(User.role == role)
    if search:
        query = query.where(
            or_(
                User.display_name.ilike(f"%{search}%"),
                User.username.ilike(f"%{search}%"),
            )
        )

    result = await db.execute(query)
    users = result.scalars().all()

    # Single GROUP BY query for all users' workload stats.
    # Counts each OPEN lifecycle state separately so the dashboard can
    # show the full breakdown (รอรับเรื่อง / รอดำเนินการ / กำลังดำเนินการ / รออนุมัติ).
    user_ids = [u.id for u in users]
    if user_ids:
        from sqlalchemy import case
        stats_query = (
            select(
                ServiceRequest.assigned_agent_id,
                func.count(case((ServiceRequest.status == RequestStatus.PENDING, 1))).label("awaiting_ack"),
                func.count(case((ServiceRequest.status == RequestStatus.ACKNOWLEDGED, 1))).label("acknowledged"),
                func.count(case((ServiceRequest.status == RequestStatus.IN_PROGRESS, 1))).label("in_progress"),
                func.count(case((ServiceRequest.status == RequestStatus.AWAITING_APPROVAL, 1))).label("awaiting_approval"),
            )
            .where(ServiceRequest.assigned_agent_id.in_(user_ids))
            .group_by(ServiceRequest.assigned_agent_id)
        )
        stats_result = await db.execute(stats_query)
        stats_map = {
            row.assigned_agent_id: (row.awaiting_ack, row.acknowledged, row.in_progress, row.awaiting_approval)
            for row in stats_result.all()
        }
    else:
        stats_map = {}

    user_workloads = []
    for user in users:
        awaiting_ack, acknowledged, in_progress, awaiting_approval = stats_map.get(user.id, (0, 0, 0, 0))
        active_tasks = awaiting_ack + acknowledged + in_progress + awaiting_approval
        user_workloads.append(
            UserWorkload(
                id=user.id,
                display_name=user.display_name or user.username,
                role=user.role,
                active_tasks=active_tasks,
                awaiting_ack_tasks=awaiting_ack,
                acknowledged_tasks=acknowledged,
                in_progress_tasks=in_progress,
                awaiting_approval_tasks=awaiting_approval,
                # Legacy alias mirrors awaiting_ack for older frontend
                pending_tasks=awaiting_ack,
            )
        )

    user_workloads.sort(key=lambda x: x.active_tasks)
    return user_workloads


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Get user details by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        picture_url=user.picture_url,
        role=user.role,
        is_active=user.is_active,
        line_user_id=user.line_user_id,
        created_at=user.created_at.isoformat() if user.created_at else None,
        updated_at=user.updated_at.isoformat() if user.updated_at else None,
    )


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Create a new admin/agent user."""
    _check_role_permission(current_admin, body.role)

    # Check username uniqueness
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    # Check email uniqueness (if provided)
    if body.email:
        existing_email = await db.execute(select(User).where(User.email == body.email))
        if existing_email.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already exists",
            )

    user = User(
        username=body.username,
        hashed_password=get_password_hash(body.password),
        display_name=body.display_name,
        email=body.email,
        role=body.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        picture_url=user.picture_url,
        role=user.role,
        is_active=user.is_active,
        line_user_id=user.line_user_id,
        created_at=user.created_at.isoformat() if user.created_at else None,
        updated_at=user.updated_at.isoformat() if user.updated_at else None,
    )


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Update user details."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Cannot edit own role
    if body.role is not None and user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change your own role",
        )

    # Check permission for target role changes
    if body.role is not None:
        _check_role_permission(current_admin, body.role)
        # Also check permission for the user's current role
        _check_role_permission(current_admin, user.role)

    # Apply updates
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.email is not None:
        # Check uniqueness
        if body.email:
            existing = await db.execute(
                select(User).where(User.email == body.email, User.id != user_id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already exists",
                )
        user.email = body.email
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        # Cannot deactivate self
        if user.id == current_admin.id and body.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot deactivate your own account",
            )
        user.is_active = body.is_active
    if body.password is not None:
        if current_admin.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only SUPER_ADMIN can change passwords via this endpoint",
            )
        user.hashed_password = get_password_hash(body.password)

    await db.commit()
    await db.refresh(user)

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        picture_url=user.picture_url,
        role=user.role,
        is_active=user.is_active,
        line_user_id=user.line_user_id,
        created_at=user.created_at.isoformat() if user.created_at else None,
        updated_at=user.updated_at.isoformat() if user.updated_at else None,
    )


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    hard: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Delete a user. Soft delete by default (set is_active=false). Use ?hard=true for hard delete."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Cannot delete self
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete your own account",
        )

    # Check permission for the user's role
    _check_role_permission(current_admin, user.role)

    # Cannot delete the last SUPER_ADMIN
    if user.role == UserRole.SUPER_ADMIN:
        count_result = await db.execute(
            select(func.count(User.id)).where(
                User.role == UserRole.SUPER_ADMIN,
                User.is_active == True,
            )
        )
        count = count_result.scalar_one()
        if count <= 1:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete the last active SUPER_ADMIN",
            )

    if hard:
        await db.delete(user)
    else:
        user.is_active = False

    await db.commit()
    return {"detail": "User deleted successfully", "hard": hard}


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: int,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Reset a user's password. SUPER_ADMIN only."""
    if current_admin.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only SUPER_ADMIN can reset passwords",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = get_password_hash(body.new_password)
    await db.commit()

    return {"detail": "Password reset successfully"}
