"""Postback event handling (button taps): routing, CSAT survey."""
import logging
from functools import partial

from sqlalchemy.ext.asyncio import AsyncSession

from ._deps import get_line_service
from .commands import handle_check_status
from app.core.logging_utils import mask_line_id
from app.services.outbox import Outbox, drain_outbox

logger = logging.getLogger(__name__)


async def handle_postback_event(event, db: AsyncSession, outbox: Outbox | None = None):
    """Route a LINE PostbackEvent to the appropriate command handler.

    Mutations announce via the shared outbox after commit (D2, mirrors R3-M3);
    the loading animation stays a direct call (ephemeral, not persisted data).
    """
    line_user_id = event.source.user_id
    data = event.postback.data

    await get_line_service().show_loading_animation(line_user_id)

    box = outbox if outbox is not None else []
    if data == "action=track_requests":
        await handle_check_status(line_user_id, event.reply_token, db, outbox=box)
    elif data.startswith("csat|"):
        await handle_csat_response(line_user_id, data, event.reply_token, db, outbox=box)
    else:
        logger.info("Unhandled postback data '%s' from user %s", data, mask_line_id(line_user_id))
    if outbox is None:
        await drain_outbox(box)


async def handle_csat_response(line_user_id: str, data: str, reply_token: str, db: AsyncSession, outbox: Outbox | None = None):
    """Handle CSAT survey postback: csat|{session_id}|{score}"""
    box = outbox if outbox is not None else []
    try:
        parts = data.split("|")
        if len(parts) != 3:
            logger.warning(f"Invalid CSAT postback data: {data}")
            return

        session_id = int(parts[1])
        score = int(parts[2])

        if not 1 <= score <= 5:
            logger.warning(f"Invalid CSAT score: {score}")
            return

        from app.services.csat_service import csat_service
        from app.services.user_identity_service import resolve_by_line_id

        resolved_user = await resolve_by_line_id(db, line_user_id)
        await csat_service.record_response(
            session_id=session_id,
            score=score,
            feedback=None,
            db=db,
            user_id=resolved_user.id if resolved_user else None,
        )

        thank_you = csat_service.get_thank_you_message(score)
        box.append(partial(get_line_service().reply_text, reply_token, thank_you))
        if outbox is None:
            await drain_outbox(box)

    except (ValueError, IndexError) as e:
        logger.error(f"Error parsing CSAT postback '{data}': {e}")
    except Exception as e:
        logger.error(f"Error recording CSAT response: {e}")
