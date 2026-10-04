from datetime import datetime, timezone
import csv
import io
import logging
import asyncio
import os
from typing import List, Optional
from urllib.parse import quote

logger = logging.getLogger(__name__)
_EXPORT_CHUNK = 500
_EXPORT_MAX_MESSAGES = 20000


def _content_disposition(filename: str) -> str:
    # RFC 5987: Thai filenames must be percent-encoded, not quoted raw.
    return f"attachment; filename*=UTF-8''{quote(filename)}"

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.deps import require_permission
from app.core.permissions import KEY_EXPORT_CHAT
from app.core.pii_masking import mask_line_id
from app.models.message import Message
from app.models.user import User, UserRole
from app.services.user_identity_service import child_filter, resolve_by_line_id

router = APIRouter()


def _sanitize_filename(value: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in value.strip())
    return safe[:80] or "conversation"


def _build_export_filename(display_name: str, messages: List[Message], extension: str) -> str:
    if messages:
        first_dt = messages[0].created_at
        last_dt = messages[-1].created_at
    else:
        first_dt = None
        last_dt = None

    start = first_dt.strftime("%Y%m%d") if first_dt else "unknown"
    end = last_dt.strftime("%Y%m%d") if last_dt else start
    return f"{_sanitize_filename(display_name)}_{start}-{end}.{extension}"


async def _load_conversation(
    line_user_id: str, db: AsyncSession
) -> tuple[Optional[User], List[Message]]:
    """Resolve identity + messages once per export (not twice)."""
    user = await resolve_by_line_id(db, line_user_id)
    result = await db.execute(
        select(Message)
        .where(child_filter(Message, line_user_id, user.id if user else None))
        .order_by(Message.created_at.asc(), Message.id.asc())
    )
    return user, list(result.scalars().all())


async def _conversation_bounds(
    line_user_id: str, db: AsyncSession
) -> tuple[Optional[User], Optional[Message], Optional[Message]]:
    """Resolve identity + first/last messages without loading the body."""
    user = await resolve_by_line_id(db, line_user_id)
    first = (
        await db.execute(
            select(Message)
            .where(child_filter(Message, line_user_id, user.id if user else None))
            .order_by(Message.created_at.asc(), Message.id.asc())
            .limit(1)
        )
    ).scalars().first()
    last = (
        await db.execute(
            select(Message)
            .where(child_filter(Message, line_user_id, user.id if user else None))
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(1)
        )
    ).scalars().first()
    return user, first, last


def _display_name(user: Optional[User], line_user_id: str, role: UserRole | str) -> str:
    if user and user.display_name:
        return user.display_name
    return mask_line_id(line_user_id, role)


_FORMULA_LEADERS = ("=", "+", "-", "@", "\t", "\r")


def _defuse_csv_cell(value: str) -> str:
    """Prefix a single quote so spreadsheet apps never execute the cell."""
    if value[:1] in _FORMULA_LEADERS:
        return "'" + value
    return value


async def _iter_csv_rows(line_user_id: str, db: AsyncSession, role: UserRole | str):
    """Stream CSV one chunk at a time instead of buffering the whole conversation."""
    user = await resolve_by_line_id(db, line_user_id)
    last_id = 0
    yield "timestamp,line_user_id,direction,sender,message_type,content\n"
    while True:
        rows = (await db.execute(
            select(Message)
            .where(child_filter(Message, line_user_id, user.id if user else None))
            .where(Message.id > last_id)
            .order_by(Message.id.asc())
            .limit(_EXPORT_CHUNK)
        )).scalars().all()
        if not rows:
            return
        for m in rows:
            buf = io.StringIO()
            csv.writer(buf).writerow([
                m.created_at.isoformat() if m.created_at else "",
                mask_line_id(line_user_id, role),
                m.direction.value if hasattr(m.direction, "value") else m.direction,
                m.sender_role.value if hasattr(m.sender_role, "value") else (m.sender_role or ""),
                m.message_type or "",
                _defuse_csv_cell(m.content or ""),
            ])
            yield buf.getvalue()
        last_id = rows[-1].id


@router.get("/conversations/{line_user_id}/csv")
async def export_conversation_csv(
    line_user_id: str,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(require_permission(KEY_EXPORT_CHAT)),
):
    """Export one conversation as CSV (streamed, RFC 5987 filename)."""
    user, first, last = await _conversation_bounds(line_user_id, db)
    if first is None:
        raise HTTPException(status_code=404, detail="Conversation not found or has no messages")

    display_name = _display_name(user, line_user_id, current_user.role)
    filename = _build_export_filename(display_name, [first, last], "csv")

    return StreamingResponse(
        _iter_csv_rows(line_user_id, db, current_user.role),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


@router.get("/conversations/{line_user_id}/pdf")
async def export_conversation_pdf(
    line_user_id: str,
    db: AsyncSession = Depends(deps.get_db),
    current_user: User = Depends(require_permission(KEY_EXPORT_CHAT)),
):
    """Export one conversation as PDF."""
    try:
        import reportlab  # noqa: F401 — availability probe
    except Exception as exc:
        raise HTTPException(status_code=500, detail="PDF export dependency not installed") from exc

    user = await resolve_by_line_id(db, line_user_id)
    count = await db.scalar(
        select(func.count())
        .select_from(Message)
        .where(child_filter(Message, line_user_id, user.id if user else None))
    )
    if count > _EXPORT_MAX_MESSAGES:
        raise HTTPException(status_code=413, detail="Conversation too large")

    user, messages = await _load_conversation(line_user_id, db)
    if not messages:
        raise HTTPException(status_code=404, detail="Conversation not found or has no messages")

    display_name = _display_name(user, line_user_id, current_user.role)
    filename = _build_export_filename(display_name, messages, "pdf")

    # ReportLab drawing is CPU-bound sync — offload to a thread.
    data = await asyncio.to_thread(
        _build_conversation_pdf, line_user_id, display_name, messages,
        role=current_user.role,
    )
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


def _thai_font_name() -> str:
    """Thai-capable font when the asset exists, else Helvetica fallback."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    for path in (
        "assets/fonts/NotoSansThai-Regular.ttf",
        "backend/assets/fonts/NotoSansThai-Regular.ttf",
        "/usr/share/fonts/NotoSansThai-Regular.ttf",
    ):
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont("Thai", path))
            return "Thai"
    return "Helvetica"


def _build_conversation_pdf(
    line_user_id: str, display_name: str, messages: List[Message],
    role: UserRole | str | None = None,
) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left = 36
    top = height - 36
    line_height = 14

    pdf.setFont(_thai_font_name(), 12)
    pdf.drawString(left, top, f"Conversation Export: {display_name}")
    pdf.setFont(_thai_font_name(), 9)
    pdf.drawString(left, top - line_height, f"LINE User ID: {mask_line_id(line_user_id, role)}")
    pdf.drawString(left, top - (line_height * 2), f"Generated UTC: {datetime.now(timezone.utc).isoformat()}")

    y = top - (line_height * 4)
    for message in messages:
        if y < 48:
            pdf.showPage()
            pdf.setFont(_thai_font_name(), 9)
            y = height - 48

        timestamp = message.created_at.isoformat() if message.created_at else "-"
        direction = message.direction.value if hasattr(message.direction, "value") else str(message.direction)
        sender_role = (
            message.sender_role.value if hasattr(message.sender_role, "value") else (message.sender_role or "")
        )
        message_type = message.message_type or ""
        content = (message.content or "").replace("\n", " ").strip()
        if len(content) > 180:
            content = f"{content[:177]}..."

        line = f"[{timestamp}] {direction}/{sender_role} ({message_type}) {content}"
        pdf.drawString(left, y, line)
        y -= line_height

    pdf.save()
    return buffer.getvalue()

