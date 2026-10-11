"""A2: a failed LINE push must not be reported as success.

send_message/send_media_message persist first, then push. When the push
raised, the old code logged it but still returned {"success": True}, bumped
message_count/last_message_at, and ran first-response SLA — the operator saw
"sent" for a message the customer never got, and response-time stats lied.

Fixed contract:
- service returns {"success": False, ...} with delivery_status "failed";
  counters, last_message_at, and SLA updates are skipped (the DB record is
  still kept for audit/retry);
- the HTTP endpoints answer 502 (upstream LINE failure) after committing;
- the WS handler emits MESSAGE_FAILED (which the console already honors)
  instead of MESSAGE_SENT + NEW_MESSAGE.
"""
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import admin_live_chat
from app.schemas.live_chat import SendMessageRequest
from app.schemas.ws_events import WSEventType
from app.services.live_chat_service import LiveChatService


def _session():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=3, user_id=9, message_count=4,
        last_activity_at=now, first_response_at=None,
    )


def _saved_text():
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=11, direction="OUTGOING", message_type="text", content="hi",
        payload=None, created_at=now,
        sender_role="ADMIN", operator_name="Op",
    )


def _operator_and_guard_db():
    operator_result = MagicMock()
    operator_result.scalar_one_or_none.return_value = SimpleNamespace(
        display_name="Op"
    )
    guard_result = MagicMock()
    guard_result.rowcount = 1
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[operator_result, guard_result])
    return db


def _service_patches(svc, session, line_svc, sla):
    return (
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
            new=AsyncMock(return_value=None),
        ),
    )


@pytest.mark.asyncio
async def test_send_message_push_failure_returns_failure_and_skips_counters():
    svc = LiveChatService()
    session = _session()
    saved = _saved_text()
    db = _operator_and_guard_db()
    line_svc = Mock()
    line_svc.save_message = AsyncMock(return_value=saved)
    line_svc.push_messages = AsyncMock(side_effect=Exception("LINE 500"))
    sla = Mock()
    sla.check_frt_on_first_response = AsyncMock()

    patches = _service_patches(svc, session, line_svc, sla)
    for p in patches:
        p.start()
    try:
        result = await svc.send_message("U1", "hi", 7, db)
    finally:
        for p in patches:
            p.stop()

    assert result["success"] is False
    assert result["message"]["payload"] == {"delivery_status": "failed"}
    # Audit record still returned for retry flows.
    assert result["message"]["content"] == "hi"
    # Counters / SLA skipped: the customer never got this message.
    assert session.message_count == 4
    assert session.first_response_at is None
    sla.check_frt_on_first_response.assert_not_awaited()


@pytest.mark.asyncio
async def test_send_message_push_success_still_counts_and_slas():
    svc = LiveChatService()
    session = _session()
    saved = _saved_text()
    db = _operator_and_guard_db()
    line_svc = Mock()
    line_svc.save_message = AsyncMock(return_value=saved)
    line_svc.push_messages = AsyncMock()
    sla = Mock()
    sla.check_frt_on_first_response = AsyncMock()

    patches = _service_patches(svc, session, line_svc, sla)
    for p in patches:
        p.start()
    try:
        result = await svc.send_message("U1", "hi", 7, db)
    finally:
        for p in patches:
            p.stop()

    assert result["success"] is True
    assert result["message"]["payload"] == {"delivery_status": "sent"}
    assert session.message_count == 5
    assert session.first_response_at is not None
    sla.check_frt_on_first_response.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_media_push_failure_returns_failure_and_skips_counters():
    svc = LiveChatService()
    session = _session()
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    saved = SimpleNamespace(
        id=12, direction="OUTGOING", message_type="file", content="a.txt",
        payload={"url": "https://files.example/a.txt"},
        created_at=now, sender_role="ADMIN", operator_name="Op",
    )
    db = AsyncMock()
    operator_result = MagicMock()
    operator_result.scalar_one_or_none.return_value = SimpleNamespace(
        display_name="Op"
    )
    db.execute = AsyncMock(return_value=operator_result)
    line_svc = Mock()
    line_svc.persist_operator_upload = AsyncMock(return_value={
        "url": "https://files.example/a.txt",
        "preview_url": None,
        "file_name": "a.txt",
        "content_type": "text/plain",
        "size": 3,
    })
    line_svc.save_message = AsyncMock(return_value=saved)
    line_svc.push_messages = AsyncMock(side_effect=Exception("LINE 500"))
    sla = Mock()
    sla.check_frt_on_first_response = AsyncMock()

    patches = _service_patches(svc, session, line_svc, sla)
    for p in patches:
        p.start()
    try:
        result = await svc.send_media_message(
            "U1", 7, b"123", "a.txt", "text/plain", db
        )
    finally:
        for p in patches:
            p.stop()

    assert result["success"] is False
    assert result["message"]["payload"]["delivery_status"] == "failed"
    assert session.message_count == 4
    assert session.first_response_at is None
    sla.check_frt_on_first_response.assert_not_awaited()


# ---------------------------------------------------------------------------
# HTTP endpoints: 502 after commit on push failure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_http_send_message_push_failure_returns_502():
    db = AsyncMock()
    current_user = SimpleNamespace(id=7)
    request = SendMessageRequest(text="hi")

    with (
        patch.object(
            admin_live_chat.live_chat_service, "send_message",
            new=AsyncMock(return_value={
                "success": False,
                "message": {"id": 11, "content": "hi"},
                "error": "LINE push failed",
            }),
        ),
        patch.object(
            admin_live_chat, "_broadcast_conversation_update",
            new=AsyncMock(),
        ) as broadcast,
    ):
        with pytest.raises(HTTPException) as exc_info:
            await admin_live_chat.send_message("U1", request, db, current_user)

    assert exc_info.value.status_code == 502
    db.commit.assert_awaited_once()  # failed record still persisted
    broadcast.assert_not_awaited()


@pytest.mark.asyncio
async def test_http_send_message_success_still_returns_result():
    db = AsyncMock()
    current_user = SimpleNamespace(id=7)
    request = SendMessageRequest(text="hi")
    ok = {"success": True, "message": {"id": 11, "content": "hi"}}

    with (
        patch.object(
            admin_live_chat.live_chat_service, "send_message",
            new=AsyncMock(return_value=ok),
        ),
        patch.object(
            admin_live_chat, "_broadcast_conversation_update",
            new=AsyncMock(),
        ) as broadcast,
    ):
        result = await admin_live_chat.send_message("U1", request, db, current_user)

    assert result == ok
    broadcast.assert_awaited_once()


@pytest.mark.asyncio
async def test_http_send_media_push_failure_returns_502():
    db = AsyncMock()
    current_user = SimpleNamespace(id=7)
    file = SimpleNamespace(
        size=3, filename="a.txt", content_type="text/plain",
        read=AsyncMock(return_value=b"123"),
    )

    with (
        patch.object(
            admin_live_chat.live_chat_service, "send_media_message",
            new=AsyncMock(return_value={
                "success": False,
                "message": {"id": 12, "content": "a.txt"},
                "error": "LINE push failed",
            }),
        ),
        patch.object(
            admin_live_chat, "notify_admins_message_sent",
            new=AsyncMock(),
        ) as notify,
    ):
        with pytest.raises(HTTPException) as exc_info:
            await admin_live_chat.send_media("U1", file, db, current_user)

    assert exc_info.value.status_code == 502
    db.commit.assert_awaited_once()
    notify.assert_not_awaited()


# ---------------------------------------------------------------------------
# WS handler: MESSAGE_FAILED instead of MESSAGE_SENT + NEW_MESSAGE
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ws_send_message_push_failure_emits_message_failed():
    from app.services.ws_session.handlers import handle_send_message

    svc = Mock()
    svc.send_message = AsyncMock(return_value={
        "success": False,
        "message": {"id": 11, "content": "hi"},
        "error": "LINE push failed",
    })
    ws = Mock()
    ws.send_personal = AsyncMock()
    ws.broadcast_to_room = AsyncMock()
    health = Mock()
    health.record_message_sent = Mock()
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
        # The failure frame goes through auth.send_message_failed, which
        # resolves the manager from its own namespace.
        patch(
            "app.services.ws_session.auth.get_ws_manager", return_value=ws
        ),
        patch(
            "app.services.ws_session.handlers.get_ws_health_monitor",
            return_value=health,
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

    assert ws.send_personal.await_count == 1
    frame = ws.send_personal.await_args.args[1]
    assert frame["type"] == WSEventType.MESSAGE_FAILED.value
    assert frame["payload"]["temp_id"] == "t1"
    ws.broadcast_to_room.assert_not_awaited()
    health.record_message_sent.assert_not_called()
