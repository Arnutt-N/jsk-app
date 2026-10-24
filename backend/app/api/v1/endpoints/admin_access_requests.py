from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import check_role_permission, get_db, require_permission
from app.core.audit import create_audit_log
from app.core.permissions import KEY_MANAGE_USERS
from app.core.security import get_password_hash_async
from app.models.access_request import AccessRequest, AccessRequestStatus
from app.models.user import User
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
        phone_number=req.phone_number,
        requested_role=req.requested_role,
        reason=req.reason,
        status=req.status,
        review_note=req.review_note,
        created_at=req.created_at.isoformat() if req.created_at else None,
    )


@router.get("", response_model=List[AccessRequestOut])
async def list_requests(
    req_status: Optional[AccessRequestStatus] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_permission(KEY_MANAGE_USERS)),
):
    filters = []
    if req_status is not None:
        filters.append(AccessRequest.status == req_status)
    query = select(AccessRequest)
    if filters:
        query = query.where(*filters)
    query = query.order_by(AccessRequest.created_at.desc())
    result = await db.execute(query)
    return [_to_out(r) for r in result.scalars().all()]


async def _audit_denied(
    db: AsyncSession, admin_id: int, req: AccessRequest, reason: str
) -> None:
    await create_audit_log(
        db=db,
        admin_id=admin_id,
        action="access_request_denied",
        resource_type="access_request",
        resource_id=str(req.id),
        details={"reason": reason, "role": req.requested_role.value},
    )
    await db.commit()


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
    req = await _load_pending(db, request_id)

    try:
        check_role_permission(current_admin, req.requested_role)
    except HTTPException:
        await _audit_denied(db, current_admin.id, req, "role_forbidden")
        raise

    existing = await db.execute(select(User.id).where(User.username == req.username))
    if existing.scalar_one_or_none() is not None:
        await _audit_denied(db, current_admin.id, req, "username_taken")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ชื่อผู้ใช้นี้ถูกใช้ไปแล้วระหว่างรออนุมัติ",
        )
    if req.email:
        email_taken = await db.execute(
            select(User.id).where(func.lower(User.email) == req.email.lower())
        )
        if email_taken.scalar_one_or_none() is not None:
            await _audit_denied(db, current_admin.id, req, "email_taken")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="อีเมลนี้ถูกใช้ไปแล้วระหว่างรออนุมัติ",
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
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        await _audit_denied(db, current_admin.id, req, "username_taken_race")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ชื่อผู้ใช้นี้ถูกใช้ไปแล้วระหว่างรออนุมัติ",
        )

    claimed = await db.execute(
        update(AccessRequest)
        .where(
            AccessRequest.id == req.id,
            AccessRequest.status == AccessRequestStatus.PENDING,
        )
        .values(
            status=AccessRequestStatus.APPROVED,
            reviewed_by=current_admin.id,
            reviewed_at=func.now(),
        )
    )
    if (claimed.rowcount or 0) == 0:
        await db.rollback()
        await _audit_denied(db, current_admin.id, req, "already_handled")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="คำขอนี้ถูกดำเนินการไปแล้ว",
        )

    req.status = AccessRequestStatus.APPROVED
    req.reviewed_by = current_admin.id
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

