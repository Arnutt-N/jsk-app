import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.service_request import ServiceRequest
from app.schemas.service_request_liff import ServiceRequestCreate, ServiceRequestResponse

logger = logging.getLogger(__name__)

router = APIRouter()


async def verify_liff_token(id_token: str) -> str:
    """Verify a LIFF ID token with LINE and return the LINE user ID (sub)."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.line.me/oauth2/v2.1/verify",
            data={
                "id_token": id_token,
                "client_id": settings.LINE_LOGIN_CHANNEL_ID,
            },
        )
    if resp.status_code != 200:
        logger.warning("LIFF token verification failed: %s", resp.text)
        raise HTTPException(status_code=401, detail="Invalid LIFF ID token")
    payload = resp.json()
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="LIFF token missing sub claim")
    return sub


@router.post(
    "/service-requests",
    response_model=ServiceRequestResponse,
    status_code=201,
    summary="Create Service Request (LIFF)",
    description="Submit a new service request form from the LIFF application. Accepts personal details, location, and issue topics.",
    response_description="The created service request with ID and status."
)
async def create_service_request(
    request: ServiceRequestCreate,
    db: AsyncSession = Depends(get_db),
    x_liff_id_token: Optional[str] = Header(None),
) -> Any:
    """
    Create a new service request from LIFF.
    """
    # Determine the verified LINE user ID and request source
    if x_liff_id_token:
        verified_line_user_id = await verify_liff_token(x_liff_id_token)
        line_user_id = verified_line_user_id
        source_details = {"source": "LIFF v2"}
    else:
        line_user_id = request.line_user_id
        source_details = {"source": "LIFF-unverified"}

    # Map Pydantic to SQLAlchemy Model
    # Note: Our Pydantic has 'name', 'phone', 'service_type'
    # But our DB Model has 'requester_name', 'phone_number', 'category'

    # Construct full name
    full_name = f"{request.prefix or ''}{request.firstname} {request.lastname}".strip()
    if request.name and not full_name:
        full_name = request.name # Fallback

    db_obj = ServiceRequest(
        # Context
        line_user_id=line_user_id,
        status=None, # User requested no initial status
        priority=None, # User requested no initial priority
        details=source_details,
        
        # Personal
        prefix=request.prefix,
        firstname=request.firstname,
        lastname=request.lastname,
        requester_name=full_name,
        phone_number=request.phone_number,
        email=request.email,
        
        # Location
        agency=request.agency,
        province=request.province,
        district=request.district,
        sub_district=request.sub_district,
        
        # Topic
        topic_category=request.topic_category,
        topic_subcategory=request.topic_subcategory,
        
        # Legacy/Compatibility Mapping
        category=request.topic_category or request.service_type,
        
        # Content
        description=request.description,
        attachments=request.attachments
    )
    
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    
    # Map back to Response Schema
    # Because field names differ, we construct response manually or rely on ORM mapping if aliases were used better.
    # But simplest is to just return dict that Pydantic can parse if Config.from_attributes=True
    
    return ServiceRequestResponse(
        id=db_obj.id,
        line_user_id=db_obj.line_user_id,
        created_at=db_obj.created_at,
        status=db_obj.status.value if hasattr(db_obj.status, 'value') else db_obj.status,
        priority=db_obj.priority.value if hasattr(db_obj.priority, 'value') else db_obj.priority, # No default value
        
        # Mapped fields
        name=db_obj.requester_name,
        phone=db_obj.phone_number,
        service_type=db_obj.topic_category or db_obj.category,
        
        # Direct fields
        prefix=db_obj.prefix,
        firstname=db_obj.firstname,
        lastname=db_obj.lastname,
        email=db_obj.email,
        agency=db_obj.agency,
        province=db_obj.province,
        district=db_obj.district,
        sub_district=db_obj.sub_district,
        topic_category=db_obj.topic_category,
        topic_subcategory=db_obj.topic_subcategory,
        description=db_obj.description,
        attachments=db_obj.attachments or []
    )
