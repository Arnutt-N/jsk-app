"""Access-request review queue for the admin dashboard.

The public submits wishes through POST /auth/request-access (no account
created); SUPER_ADMIN/ADMIN triage them here. Approval mints the User row.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_permission
from app.api.v1.endpoints.admin_users import _check_role_permission
from app.core.audit import create_audit_log
from app.core.permissions import KEY_MANAGE_USERS
from app.core.security import get_password_hash_async
from app.models.access_request import AccessRequest, AccessRequestStatus
from app.models.user import User, UserRole
from app.schemas.access_request import (
    AccessRequestApprove,
    AccessRequestOut,
    AccessRequestReject,
)

router = APIRouter()


def _to_out(req: AccessRequest) -> AccessRequestOut:
    return AccessRequestOut(
        id=req.id,
        display_name=req.display_name,
        username=req.username,
        email=req.email,
        requested_role=req.requested_role,
        status=req.status,
        created_at=req.created_at.isoformat() if req.created_at else None,
    )


@router.get("", response_model=List[AccessRequestOut])
async def list_requests(
    req_status: Optional[AccessRequestStatus] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_USERS)),
):
    """Pending-first queue of access requests."""
    filters = []
    if req_status is not None:
        filters.append(AccessRequest.status == req_status)
    query = select(AccessRequest)
    if filters:
        query = query.where(*filters)
    query = query.order_by(AccessRequest.created_at.desc())
    result = await db.execute(query)
    return [_to_out(r) for r in result.scalars().all()]


async def _load_pending(db: AsyncSession, request_id: int) -> AccessRequest:
    result = await db.execute(select(AccessRequest).where(AccessRequest.id == request_id))
    req = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="ไม่พบคำขอนี้")
    if req.status != AccessRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="คำขอนี้ถูกดำเนินการไปแล้ว",
        )
    return req


@router.post("/{request_id}/approve", response_model=AccessRequestOut)
async def approve_request(
    request_id: int,
    body: AccessRequestApprove,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_USERS)),
):
    """Approve a request: mint the User account with the given initial password."""
    req = await _load_pending(db, request_id)

    # Same privilege rule as editing users: an ADMIN may only approve
    # Operator accounts; Director/Head need a SUPER_ADMIN.
    _check_role_permission(current_admin, req.requested_role)

    existing = await db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ชื่อผู้ใช้นี้ถูกใช้ไปแล้วระหว่างรออนุมัติ",
        )

    user = User(
        username=req.username,
        hashed_password=await get_password_hash_async(body.password),
        display_name=req.display_name,
        email=req.email,
        role=req.requested_role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    req.status = AccessRequestStatus.APPROVED
    req.reviewed_by = current_admin.id
    req.reviewed_at = func.now()
    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="access_request_approved",
        resource_type="access_request",
        resource_id=str(req.id),
        details={"username": req.username, "role": req.requested_role.value, "user_id": user.id},
    )
    await db.commit()
    await db.refresh(req)
    return _to_out(req)


@router.post("/{request_id}/reject", response_model=AccessRequestOut)
async def reject_request(
    request_id: int,
    body: AccessRequestReject,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_USERS)),
):
    """Reject a request with an optional note. No account is created."""
    req = await _load_pending(db, request_id)

    req.status = AccessRequestStatus.REJECTED
    req.reviewed_by = current_admin.id
    req.reviewed_at = func.now()
    req.review_note = body.note.strip() if body.note else None
    await create_audit_log(
        db=db,
        admin_id=current_admin.id,
        action="access_request_rejected",
        resource_type="access_request",
        resource_id=str(req.id),
        details={"username": req.username, "note": req.review_note},
    )
    await db.commit()
    await db.refresh(req)
    return _to_out(req)


# Re-export for the role guard: DIRECTOR/HEAD approvals need SUPER_ADMIN.
ADMIN_ONLY_ROLES = frozenset({UserRole.DIRECTOR, UserRole.HEAD})
