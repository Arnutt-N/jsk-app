"""R3-H1: booking confirmations must push an SDK FlexMessage, not raw dicts."""
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from linebot.v3.messaging import FlexMessage

from app.services import booking_notifications


def _booking():
    return SimpleNamespace(
        queue_number="A1",
        service_type="svc",
        booking_date=date(2026, 1, 15),
        booking_time=time(10, 30),
        contact_name="Ann",
    )


@pytest.mark.asyncio
async def test_confirm_pushes_flex_message_object():
    with (
        patch.object(
            booking_notifications, "resolve_raw_for_push", AsyncMock(return_value="U1")
        ),
        patch.object(
            booking_notifications.line_service, "push_messages", AsyncMock()
        ) as mock_push,
    ):
        ok = await booking_notifications.notify_booking_confirmed(
            AsyncMock(), _booking(), SimpleNamespace(id=7)
        )
    assert ok is True
    mock_push.assert_awaited_once()
    messages = mock_push.call_args.args[1]
    assert len(messages) == 1
    assert isinstance(messages[0], FlexMessage)
    assert messages[0].alt_text == "จองคิวสำเร็จ A1"
    assert mock_push.call_args.args[0] == "U1"


@pytest.mark.asyncio
async def test_confirm_skips_push_when_unresolvable():
    with (
        patch.object(
            booking_notifications, "resolve_raw_for_push", AsyncMock(return_value=None)
        ),
        patch.object(
            booking_notifications.line_service, "push_messages", AsyncMock()
        ) as mock_push,
    ):
        ok = await booking_notifications.notify_booking_confirmed(
            AsyncMock(), _booking(), SimpleNamespace(id=7)
        )
    assert ok is False
    mock_push.assert_not_called()
