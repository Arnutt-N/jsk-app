import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.http_rate_limit import http_rate_limit
from app.db.session import get_db
from app.models.debt_mediation import (
    DebtMediationDebtType,
    DebtMediationParty,
    DebtMediationRequest,
)
from app.models.media_file import MediaFile, detect_category
from app.models.service_request import RequestStatus, ServiceRequest
from app.schemas.debt_mediation_liff import (
    DebtMediationCreate,
    DebtMediationResponse,
)
from app.schemas.service_request_liff import ServiceRequestCreate, ServiceRequestResponse
from app.services.friend_service import friend_service
from app.services.user_identity_service import resolve_by_line_id

logger = logging.getLogger(__name__)

router = APIRouter()


async def verify_liff_token(id_token: str) -> str:
    """Verify a LIFF ID token with LINE and return the LINE user ID (sub)."""
    if not settings.LINE_LOGIN_CHANNEL_ID.strip():
        logger.error("LINE_LOGIN_CHANNEL_ID is not configured; cannot verify LIFF ID token")
        raise HTTPException(status_code=503, detail="LIFF verification unavailable: server misconfiguration")

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


_LIFF_MEDIA_ALLOWED_MIMES = {"image/jpeg", "image/png", "application/pdf"}
_LIFF_MEDIA_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post(
    "/media",
    summary="Upload attachment (LIFF)",
    description="Citizen-facing file upload for LIFF service-request wizards. No admin permission required; identity verified via LIFF ID token.",
    dependencies=[
        Depends(
            http_rate_limit(
                "liff-submit",
                max_events=settings.LIFF_SUBMIT_RATE_LIMIT,
                window_seconds=settings.LIFF_SUBMIT_RATE_WINDOW,
            )
        )
    ],
)
async def upload_liff_media(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    x_liff_id_token: Optional[str] = Header(None),
) -> dict:
    """Accept a single file upload from a LIFF wizard page."""
    # --- LIFF identity verification (same pattern as create_service_request) ---
    if x_liff_id_token:
        await verify_liff_token(x_liff_id_token)
    elif settings.LIFF_STRICT_MODE:
        raise HTTPException(status_code=401, detail="LIFF ID token required")

    # --- Validate MIME type server-side ---
    mime = file.content_type or "application/octet-stream"
    if mime not in _LIFF_MEDIA_ALLOWED_MIMES:
        raise HTTPException(
            status_code=400,
            detail=f"ประเภทไฟล์ไม่รองรับ ({mime}) เฉพาะ JPEG, PNG, PDF เท่านั้น",
        )

    # Reject on the multipart header BEFORE buffering the body (the
    # post-read check stays as a backstop for missing/lying headers).
    if file.size is not None and file.size > _LIFF_MEDIA_MAX_BYTES:
        raise HTTPException(status_code=413, detail="ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 10MB)")

    content = await file.read()
    if len(content) > _LIFF_MEDIA_MAX_BYTES:
        raise HTTPException(status_code=413, detail="ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 10MB)")

    filename = file.filename or "untitled"

    media = MediaFile(
        filename=filename,
        mime_type=mime,
        data=content,
        size_bytes=len(content),
        category=detect_category(mime, filename),
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)

    return {"id": str(media.id), "filename": media.filename}


@router.post(
    "/service-requests",
    response_model=ServiceRequestResponse,
    status_code=201,
    summary="Create Service Request (LIFF)",
    description="Submit a new service request form from the LIFF application. Accepts personal details, location, and issue topics.",
    response_description="The created service request with ID and status.",
    dependencies=[
        Depends(
            http_rate_limit(
                "liff-submit",
                max_events=settings.LIFF_SUBMIT_RATE_LIMIT,
                window_seconds=settings.LIFF_SUBMIT_RATE_WINDOW,
            )
        )
    ],
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
        if request.line_user_id and request.line_user_id != verified_line_user_id:
            logger.warning(
                "LIFF body line_user_id mismatch with verified token sub %s…; using verified identity",
                verified_line_user_id[:6],
            )
        line_user_id = verified_line_user_id
        source_details = {"source": "LIFF v2"}
    elif settings.LIFF_STRICT_MODE:
        logger.warning("LIFF_token_missing_strict_mode_reject")
        raise HTTPException(status_code=401, detail="LIFF ID token required")
    else:
        logger.warning("LIFF_token_missing_transition_mode")
        line_user_id = request.line_user_id
        source_details = {"source": "LIFF-unverified"}

    # Map Pydantic to SQLAlchemy Model
    # Note: Our Pydantic has 'name', 'phone', 'service_type'
    # But our DB Model has 'requester_name', 'phone_number', 'category'

    # Construct full name. Guard each part with `or ''` so an anonymous
    # submission (no prefix/firstname/lastname) yields "" — not the literal
    # "None None" — and is stored as NULL rather than junk text.
    full_name = f"{request.prefix or ''}{request.firstname or ''} {request.lastname or ''}".strip()
    if request.name and not full_name:
        full_name = request.name # Fallback

    # Resolve the LINE identity to a user row. LIFF submissions may precede the
    # follow event that normally creates the user, so create on miss. An
    # unverified submission without a line_user_id stays unlinked.
    user = None
    if line_user_id:
        user = await resolve_by_line_id(db, line_user_id)
        if user is None:
            user = await friend_service.get_or_create_user(line_user_id, db, commit=False)

    db_obj = ServiceRequest(
        # Context
        user_id=user.id if user else None,
        status=RequestStatus.PENDING,
        priority=None, # User requested no initial priority
        details=source_details,
        
        # Personal
        prefix=request.prefix,
        firstname=request.firstname,
        lastname=request.lastname,
        requester_name=full_name or None,
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
        line_user_id=line_user_id,
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


@router.post(
    "/debt-mediation",
    response_model=DebtMediationResponse,
    status_code=201,
    summary="Create Debt Mediation Request (LIFF)",
    description="Register a debt-mediation intention (ขอแก้หนี้) from the LIFF application. The submitter is either the debtor or the creditor; path-specific fields are enforced by the schema.",
    response_description="The created debt mediation request with ID and status.",
    dependencies=[
        Depends(
            http_rate_limit(
                "liff-submit",
                max_events=settings.LIFF_SUBMIT_RATE_LIMIT,
                window_seconds=settings.LIFF_SUBMIT_RATE_WINDOW,
            )
        )
    ],
)
async def create_debt_mediation_request(
    request: DebtMediationCreate,
    db: AsyncSession = Depends(get_db),
    x_liff_id_token: Optional[str] = Header(None),
) -> DebtMediationResponse:
    """Create a new debt mediation request from LIFF (ขอแก้หนี้)."""
    # Same identity pattern as create_service_request: trust only the verified
    # LINE token sub, reject unverified submissions in strict mode.
    if x_liff_id_token:
        verified_line_user_id = await verify_liff_token(x_liff_id_token)
        if request.line_user_id and request.line_user_id != verified_line_user_id:
            logger.warning(
                "LIFF body line_user_id mismatch with verified token sub %s…; using verified identity",
                verified_line_user_id[:6],
            )
        line_user_id = verified_line_user_id
        source_details = {"source": "LIFF"}
    elif settings.LIFF_STRICT_MODE:
        logger.warning("LIFF_token_missing_strict_mode_reject_debt_mediation")
        raise HTTPException(status_code=401, detail="LIFF ID token required")
    else:
        logger.warning("LIFF_token_missing_transition_mode_debt_mediation")
        line_user_id = request.line_user_id
        source_details = {"source": "LIFF-unverified"}

    user = None
    if line_user_id:
        user = await resolve_by_line_id(db, line_user_id)
        if user is None:
            user = await friend_service.get_or_create_user(line_user_id, db, commit=False)

    db_obj = DebtMediationRequest(
        user_id=user.id if user else None,
        status=RequestStatus.PENDING,
        submitter_type=DebtMediationParty(request.submitter_type.value),
        full_name=request.full_name.strip(),
        phone_number=request.phone_number.strip(),
        province=request.province,
        sub_district=request.sub_district,
        debt_amount=request.debt_amount,
        debt_type=DebtMediationDebtType(request.debt_type.value),
        counterparty_name=request.counterparty_name.strip(),
        interest_rate=request.interest_rate,
        issue_category=request.issue_category,
        issue_other=request.issue_other,
        details=source_details,
    )

    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    return DebtMediationResponse(
        id=db_obj.id,
        submitter_type=db_obj.submitter_type,
        full_name=db_obj.full_name,
        phone_number=db_obj.phone_number,
        province=db_obj.province,
        sub_district=db_obj.sub_district,
        debt_amount=db_obj.debt_amount,
        debt_type=db_obj.debt_type,
        counterparty_name=db_obj.counterparty_name,
        interest_rate=db_obj.interest_rate,
        issue_category=db_obj.issue_category,
        issue_other=db_obj.issue_other,
        status=db_obj.status.value if hasattr(db_obj.status, "value") else db_obj.status,
        created_at=db_obj.created_at,
    )
