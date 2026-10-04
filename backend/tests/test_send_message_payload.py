"""send_message returns the persisted payload; callers drop re-fetch (R3-M18)."""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest

from app.services.live_chat_service import LiveChatService


@pytest.mark.asyncio
async def test_send_message_returns_persisted_payload():
    svc = LiveChatService()
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    session = SimpleNamespace(
        id=3, user_id=9, message_count=4,
        last_activity_at=now, first_response_at=None,
    )
    saved = SimpleNamespace(
        id=11,
        direction="OUTGOING",
        message_type="text",
        content="hi",
        payload=None,  # mutated to {"delivery_status": "sent"} by the push
        created_at=now,
        sender_role="ADMIN",
        operator_name="Op",
    )
    operator_result = MagicMock()
    operator_result.scalar_one_or_none.return_value = SimpleNamespace(
        display_name="Op"
    )
    guard_result = MagicMock()
    guard_result.rowcount = 1
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[operator_result, guard_result])
    line_svc = Mock()
    line_svc.save_message = AsyncMock(return_value=saved)
    line_svc.push_messages = AsyncMock()
    sla = Mock()
    sla.check_frt_on_first_response = AsyncMock()

    with (
        patch.object(
            svc, "_require_active_session_owner",
            new=AsyncMock(return_value=session),
        ),
        patch(
            "app.services.live_chat_service.messaging.line_service",
            new=line_svc,
        ),
        patch(
            "app.services.live_chat_service.messaging.get_sla_service",
            return_value=sla,
        ),
        patch(
            "app.services.live_chat_service.messaging.resolve_by_line_id",
            new=AsyncMock(return_value=SimpleNamespace(last_message_at=None)),
        ),
    ):
        result = await svc.send_message("U1", "hi", 7, db)

    assert result["success"] is True
    assert result["message"]["content"] == "hi"
    assert result["message"]["line_user_id"] == "U1"
    assert result["message"]["payload"] == {"delivery_status": "sent"}


@pytest.mark.asyncio
async def test_ws_send_message_uses_returned_payload_and_stamps_temp_id():
    from app.services.ws_session.handlers import handle_send_message

    message = {
        "id": 5,
        "content": "hi",
        "created_at": "2026-01-01T00:00:00",
        "line_user_id": "U1",
    }
    svc = Mock()
    svc.send_message = AsyncMock(
        return_value={"success": True, "message": dict(message)}
    )
    svc.get_recent_messages = AsyncMock()
    ws = Mock()
    ws.send_personal = AsyncMock()
    ws.broadcast_to_room = AsyncMock()
    health = Mock()
    health.record_message_sent = Mock()
    notify = AsyncMock()
    db = AsyncMock()

    class _Ctx:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *exc):
            return False

    websocket = AsyncMock()
    with (
        patch(
            "app.services.ws_session.handlers.get_live_chat_service",
            return_value=svc,
        ),
        patch(
            "app.services.ws_session.handlers.get_ws_manager", return_value=ws
        ),
        patch(
            "app.services.ws_session.handlers.get_ws_health_monitor",
            return_value=health,
        ),
        patch(
            "app.services.ws_session.handlers.get_resolve_by_line_id",
            new=Mock(return_value=AsyncMock(return_value=None)),
        ),
        patch(
            "app.services.ws_session.handlers.get_notify_admins_message_sent",
            return_value=notify,
        ),
        patch(
            "app.services.ws_session.handlers.AsyncSessionLocal",
            return_value=_Ctx(),
        ),
    ):
        await handle_send_message(
            websocket, 7, {"text": "hi", "temp_id": "t1"},
            "conversation:U1", "ts", 0.0,
        )

    svc.send_message.assert_awaited_once()
    svc.get_recent_messages.assert_not_awaited()
    sent_payload = ws.send_personal.await_args.args[1]["payload"]
    assert sent_payload["content"] == "hi"
    assert sent_payload["temp_id"] == "t1"
