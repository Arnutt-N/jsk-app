import enum
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.api.deps import get_current_admin
from app.models.service_request import ServiceRequest, RequestStatus, RequestPriority
from app.models.media_file import MediaFile
from app.schemas.service_request_liff import ServiceRequestResponse
from pydantic import BaseModel
from app.models.user import User

router = APIRouter()

class RequestStats(BaseModel):
    total: int
    pending: int
    in_progress: int
    completed: int
    rejected: int

class StatusUpdate(BaseModel):
    status: RequestStatus
    assigned_agent_id: Optional[int] = None


# ---------------------------------------------------------------------------
# แหล่งที่มาของคำร้อง
# ---------------------------------------------------------------------------
class RequestSource(str, enum.Enum):
    LIFF = "LIFF"
    ADMIN = "ADMIN"
    PHONE = "PHONE"
    PAPER = "PAPER"
    WALK_IN = "WALK_IN"


class AdminRequestCreate(BaseModel):
    """Schema สำหรับสร้างคำร้องโดยแอดมิน"""
    # ข้อมูลผู้ร้อง
    prefix: Optional[str] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None

    # ที่อยู่ / หน่วยงาน
    agency: Optional[str] = None
    province: Optional[str] = None
    district: Optional[str] = None
    sub_district: Optional[str] = None

    # หัวข้อ
    topic_category: Optional[str] = None
    topic_subcategory: Optional[str] = None
    description: Optional[str] = None

    # ไฟล์แนบ (UUID strings ของ MediaFile)
    attachment_ids: Optional[list[str]] = None

    # แหล่งที่มาและลำดับความสำคัญ
    source: RequestSource = RequestSource.ADMIN
    priority: RequestPriority = RequestPriority.MEDIUM

    # มอบหมายให้เจ้าหน้าที่ (ถ้ามี)
    assigned_agent_id: Optional[int] = None


@router.post("", response_model=ServiceRequestResponse)
async def create_request(
    body: AdminRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """สร้างคำร้องใหม่โดยแอดมิน (รองรับหลายช่องทาง)"""
    # สร้าง attachments JSONB จาก attachment_ids
    attachments: list[dict] = []
    if body.attachment_ids:
        for aid in body.attachment_ids:
            try:
                media_uuid = uuid.UUID(aid)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid attachment UUID: {aid}",
                )
            result = await db.execute(
                select(MediaFile).where(MediaFile.id == media_uuid)
            )
            media = result.scalar_one_or_none()
            if not media:
                raise HTTPException(
                    status_code=400,
                    detail=f"Attachment not found: {aid}",
                )
            attachments.append({
                "id": str(media.id),
                "filename": media.filename,
                "mime_type": media.mime_type,
                "url": f"/api/v1/media/{media.id}",
            })

    # สร้าง requester_name จาก prefix + firstname + lastname
    name_parts = [p for p in [body.prefix, body.firstname, body.lastname] if p]
    requester_name = " ".join(name_parts) if name_parts else None

    request = ServiceRequest(
        source=body.source.value,
        prefix=body.prefix,
        firstname=body.firstname,
        lastname=body.lastname,
        requester_name=requester_name,
        phone_number=body.phone_number,
        email=body.email,
        agency=body.agency,
        province=body.province,
        district=body.district,
        sub_district=body.sub_district,
        topic_category=body.topic_category,
        topic_subcategory=body.topic_subcategory,
        description=body.description,
        attachments=attachments if attachments else None,
        status=RequestStatus.PENDING,
        priority=body.priority,
        assigned_agent_id=body.assigned_agent_id,
        assigned_by_id=int(current_admin.id) if body.assigned_agent_id else None,
    )

    db.add(request)
    await db.commit()
    await db.refresh(request)
    return request


@router.get("/stats", response_model=RequestStats)
async def get_request_stats(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    """Get summary statistics for admin dashboard."""
    query = select(
        func.count(ServiceRequest.id).label("total"),
        func.count(ServiceRequest.id).filter((ServiceRequest.status == RequestStatus.PENDING) | (ServiceRequest.status.is_(None))).label("pending"),
        func.count(ServiceRequest.id).filter(ServiceRequest.status == RequestStatus.IN_PROGRESS).label("in_progress"),
        func.count(ServiceRequest.id).filter(ServiceRequest.status == RequestStatus.COMPLETED).label("completed"),
        func.count(ServiceRequest.id).filter(ServiceRequest.status == RequestStatus.REJECTED).label("rejected")
    )
    result = await db.execute(query)
    row = result.one()
    return RequestStats(**row._asdict())

class MonthlyStats(BaseModel):
    month: str
    count: int

@router.get("/stats/monthly", response_model=List[MonthlyStats])
async def get_monthly_stats(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    """Get request counts grouped by month (last 12 months)."""
    # Using text() for the order by to reference the alias
    from sqlalchemy import text
    month_expr = func.to_char(ServiceRequest.created_at, 'YYYY-MM')
    query = (
        select(
            month_expr.label('month'),
            func.count(ServiceRequest.id).label('count')
        )
        .group_by(month_expr)
        .order_by(text('month DESC'))
        .limit(12)
    )

    result = await db.execute(query)
    # Reverse to get chronological order (oldest to newest) for chart
    stats = [MonthlyStats(month=row.month, count=row.count) for row in result.all()]
    return stats[::-1]

class WorkloadStats(BaseModel):
    agent_name: str
    pending_count: int
    in_progress_count: int

@router.get("/stats/workload", response_model=List[WorkloadStats])
async def get_workload_stats(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    """Get workload distribution across agents."""
    query = (
        select(
            User.display_name.label("agent_name"),
            func.count(ServiceRequest.id).filter(ServiceRequest.status == RequestStatus.PENDING).label("pending_count"),
            func.count(ServiceRequest.id).filter(ServiceRequest.status == RequestStatus.IN_PROGRESS).label("in_progress_count")
        )
        .join(User, ServiceRequest.assigned_agent_id == User.id)
        .group_by(User.display_name)
    )
    result = await db.execute(query)
    return [WorkloadStats(**row._asdict()) for row in result.all()]

class PerformanceStats(BaseModel):
    avg_cycle_time_days: float
    on_time_percentage: float

@router.get("/stats/performance", response_model=PerformanceStats)
async def get_performance_stats(db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    """Analyze agent performance."""
    # Simplified calculation for cycle time
    cycle_time_query = select(
        func.avg(
            func.extract('epoch', ServiceRequest.completed_at - ServiceRequest.created_at) / 86400
        ).label("avg_cycle_time_days")
    ).where(ServiceRequest.status == RequestStatus.COMPLETED)
    
    on_time_query = select(
        func.count(ServiceRequest.id).filter(ServiceRequest.completed_at <= ServiceRequest.due_date).label("on_time_count"),
        func.count(ServiceRequest.id).label("total_completed")
    ).where(ServiceRequest.status == RequestStatus.COMPLETED, ServiceRequest.due_date.isnot(None))

    ct_result = await db.execute(cycle_time_query)
    ot_result = await db.execute(on_time_query)
    
    ct_row = ct_result.one()
    ot_row = ot_result.one()
    
    avg_ct = ct_row.avg_cycle_time_days or 0.0
    total_ot = ot_row.total_completed or 1 # Avoid division by zero
    ot_percent = (ot_row.on_time_count / total_ot) * 100 if ot_row.total_completed else 100.0
    
    return PerformanceStats(avg_cycle_time_days=round(avg_ct, 2), on_time_percentage=round(ot_percent, 1))


@router.get("", response_model=List[ServiceRequestResponse])
async def list_requests(
    status: Optional[RequestStatus] = None,
    category: Optional[str] = None,
    search: Optional[str] = Query(None, description="Search by name, phone, or description"),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """List all service requests with filtering and search."""
    # query = select(ServiceRequest).offset(skip).limit(limit).order_by(ServiceRequest.created_at.desc())
    
    # Use join to get assignee name
    query = (
        select(ServiceRequest, User.display_name.label("assignee_name"))
        .outerjoin(User, ServiceRequest.assigned_agent_id == User.id)
        .order_by(ServiceRequest.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    
    if status:
        query = query.where(ServiceRequest.status == status)
    if category:
        query = query.where(ServiceRequest.topic_category == category)
    
    if search:
        search_filter = (
            (ServiceRequest.firstname.ilike(f"%{search}%")) |
            (ServiceRequest.lastname.ilike(f"%{search}%")) |
            (ServiceRequest.phone_number.ilike(f"%{search}%")) |
            (ServiceRequest.description.ilike(f"%{search}%"))
        )
        query = query.where(search_filter)
        
    result = await db.execute(query)
    
    # Manually construct response to include assignee_name
    requests = []
    for req, assignee_name in result.all():
        req_dict = ServiceRequestResponse.model_validate(req).model_dump()
        req_dict['assignee_name'] = assignee_name
        requests.append(req_dict)
        
    return requests


@router.get("/{request_id}", response_model=ServiceRequestResponse)
async def get_request_detail(request_id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    """Get full details of a specific request."""
    result = await db.execute(select(ServiceRequest).where(ServiceRequest.id == request_id))
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    return request

class RequestUpdate(BaseModel):
    status: Optional[RequestStatus] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    assigned_agent_id: Optional[int] = None
    assigned_by_id: Optional[int] = None

@router.patch("/{request_id}", response_model=ServiceRequestResponse)
async def update_request(
    request_id: int, 
    update_data: RequestUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """Update request status, priority, due date or assign an agent."""
    query = select(ServiceRequest).where(ServiceRequest.id == request_id)
    result = await db.execute(query)
    request = result.scalar_one_or_none()
    
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Update fields
    if update_data.status is not None:
        request.status = update_data.status
        if update_data.status == RequestStatus.COMPLETED:
            request.completed_at = func.now()
            
    if update_data.priority is not None:
        request.priority = update_data.priority
    if update_data.due_date is not None:
        request.due_date = update_data.due_date
    if update_data.assigned_agent_id is not None:
        request.assigned_agent_id = update_data.assigned_agent_id
    if update_data.assigned_by_id is not None:
        request.assigned_by_id = update_data.assigned_by_id
        
    await db.commit()
    await db.refresh(request)
    return request

@router.delete("/{request_id}", status_code=204)
async def delete_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """Delete a service request permanently."""
    query = select(ServiceRequest).where(ServiceRequest.id == request_id)
    result = await db.execute(query)
    request = result.scalar_one_or_none()
    
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
        
    await db.delete(request)
    await db.commit()
    return None

from app.schemas.service_request_liff import RequestCommentCreate, RequestCommentResponse

from app.models.request_comment import RequestComment

@router.post("/{request_id}/comments", response_model=RequestCommentResponse)
async def create_comment(
    request_id: int,
    comment_data: RequestCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """Add a new internal comment to a request."""
    result = await db.execute(select(ServiceRequest).where(ServiceRequest.id == request_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Service request not found")

    admin_id = int(current_admin.id)
    comment = RequestComment(
        request_id=request_id,
        user_id=admin_id,
        content=comment_data.content
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    return RequestCommentResponse(
        id=comment.id,
        request_id=comment.request_id,
        user_id=comment.user_id,
        content=comment.content,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        display_name=current_admin.display_name or current_admin.username
    )

@router.get("/{request_id}/comments", response_model=List[RequestCommentResponse])
async def list_comments(request_id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    """List all internal comments for a specific request."""
    query = (
        select(RequestComment, User.display_name)
        .join(User, RequestComment.user_id == User.id)
        .where(RequestComment.request_id == request_id)
        .order_by(RequestComment.created_at.asc())
    )
    result = await db.execute(query)
    
    comments = []
    for comment, display_name in result.all():
        comments.append(RequestCommentResponse(
            id=comment.id,
            request_id=comment.request_id,
            user_id=comment.user_id,
            content=comment.content,
            created_at=comment.created_at,
            display_name=display_name
        ))
    return comments

