from datetime import datetime, timezone
import csv
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.deps import require_permission
from app.core.permissions import KEY_EXPORT_CHAT
from app.models.message import Message
from app.models.user import User

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


async def _get_conversation_messages(line_user_id: str, db: AsyncSession) -> List[Message]:
    result = await db.execute(
        select(Message)
        .where(Message.line_user_id == line_user_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
    )
    return list(result.scalars().all())


async def _get_display_name(line_user_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(User.display_name).where(User.line_user_id == line_user_id).limit(1)
    )
    value = result.scalar_one_or_none()
    return value or line_user_id


@router.get("/conversations/{line_user_id}/csv")
async def export_conversation_csv(
    line_user_id: str,
    db: AsyncSession = Depends(deps.get_db),
    _current_user: User = Depends(require_permission(KEY_EXPORT_CHAT)),
):
    """Export one conversation as CSV."""
    messages = await _get_conversation_messages(line_user_id, db)
    if not messages:
        raise HTTPException(status_code=404, detail="Conversation not found or has no messages")

    display_name = await _get_display_name(line_user_id, db)
    filename = _build_export_filename(display_name, messages, "csv")

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["timestamp", "line_user_id", "direction", "sender", "message_type", "content"])
    for message in messages:
        sender = (
            message.sender_role.value if hasattr(message.sender_role, "value") else (message.sender_role or "")
        )
        writer.writerow(
            [
                message.created_at.isoformat() if message.created_at else "",
                message.line_user_id or "",
                message.direction.value if hasattr(message.direction, "value") else message.direction,
                sender,
                message.message_type or "",
                message.content or "",
            ]
        )

    data = buffer.getvalue().encode("utf-8-sig")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/conversations/{line_user_id}/pdf")
async def export_conversation_pdf(
    line_user_id: str,
    db: AsyncSession = Depends(deps.get_db),
    _current_user: User = Depends(require_permission(KEY_EXPORT_CHAT)),
):
    """Export one conversation as PDF."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except Exception as exc:
        raise HTTPException(status_code=500, detail="PDF export dependency not installed") from exc

    messages = await _get_conversation_messages(line_user_id, db)
    if not messages:
        raise HTTPException(status_code=404, detail="Conversation not found or has no messages")

    display_name = await _get_display_name(line_user_id, db)
    filename = _build_export_filename(display_name, messages, "pdf")

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left = 36
    top = height - 36
    line_height = 14

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(left, top, f"Conversation Export: {display_name}")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(left, top - line_height, f"LINE User ID: {line_user_id}")
    pdf.drawString(left, top - (line_height * 2), f"Generated UTC: {datetime.now(timezone.utc).isoformat()}")

    y = top - (line_height * 4)
    for message in messages:
        if y < 48:
            pdf.showPage()
            pdf.setFont("Helvetica", 9)
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
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

