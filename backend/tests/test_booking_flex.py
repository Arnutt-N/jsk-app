"""Flex bubbles for bookings, and the 'คิว' text command that returns them."""
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.flex_messages import build_booking_confirmation, build_booking_list
from app.services.message_intake import commands


def _booking(queue="260819-001", status="CONFIRMED"):
    return SimpleNamespace(
        id=1,
        queue_number=queue,
        service_type="ปรึกษากฎหมาย",
        booking_date=date(2026, 8, 19),
        booking_time=time(9, 30),
        contact_name="สมชาย ใจดี",
        status=SimpleNamespace(value=status),
    )


def _texts(node, found=None):
    """Collect every rendered text string in a Flex tree."""
    found = [] if found is None else found
    if isinstance(node, dict):
        if node.get("type") == "text":
            found.append(node.get("text", ""))
        for value in node.values():
            _texts(value, found)
    elif isinstance(node, list):
        for item in node:
            _texts(item, found)
    return found


# --- confirmation bubble ---


def test_confirmation_shows_the_queue_number_and_appointment():
    bubble = build_booking_confirmation(_booking())
    texts = _texts(bubble)
    assert "260819-001" in texts
    assert "ปรึกษากฎหมาย" in texts
    assert "09:30 น." in texts


def test_confirmation_renders_the_date_in_buddhist_era():
    """2026 CE is 2569 BE — the counter and the citizen both read BE."""
    bubble = build_booking_confirmation(_booking())
    assert "19/8/2569" in _texts(bubble)


def test_the_reminder_reuses_the_bubble_with_its_own_title():
    reminder = build_booking_confirmation(_booking(), title="🔔 เตือนนัดหมาย")
    assert "🔔 เตือนนัดหมาย" in _texts(reminder)
    assert "✅ จองคิวสำเร็จ" not in _texts(reminder)


def test_missing_optional_fields_do_not_render_as_none():
    bare = SimpleNamespace(
        queue_number=None, service_type=None, booking_date=None,
        booking_time=None, contact_name=None, status=SimpleNamespace(value="CONFIRMED"),
    )
    assert "None" not in "".join(_texts(build_booking_confirmation(bare)))


# --- list bubble ---


def test_empty_list_explains_how_to_book():
    texts = _texts(build_booking_list([]))
    assert any("ไม่พบคิวนัดหมาย" in t for t in texts)


def test_list_renders_one_row_per_booking_with_status():
    bubble = build_booking_list([_booking("260819-001"), _booking("260820-002", "CANCELLED")])
    texts = _texts(bubble)
    assert "2 รายการ" in texts
    assert any("260819-001" in t for t in texts)
    assert "ยืนยันแล้ว" in texts
    assert "ยกเลิก" in texts


def test_list_drops_only_the_trailing_separator():
    """Popping unconditionally would strip a real content row on a 1-item list."""
    bubble = build_booking_list([_booking()])
    rows = bubble["body"]["contents"]
    assert len(rows) == 1
    assert all(c.get("type") != "separator" for c in rows[0]["contents"])
    assert any(c.get("type") == "text" for c in rows[0]["contents"])


# --- the text command ---


@pytest.mark.asyncio
async def test_queue_keywords_are_whole_message_matches():
    assert "คิว" in commands.BOOKING_QUERY_KEYWORDS
    assert "นัดหมาย" in commands.BOOKING_QUERY_KEYWORDS
    # A sentence must not be treated as the command; it falls through to intents.
    assert "อยากทราบคิวของผมครับ" not in commands.BOOKING_QUERY_KEYWORDS


@pytest.mark.asyncio
async def test_check_booking_replies_with_flex():
    line_svc = AsyncMock()
    with patch.object(commands, "get_line_service", return_value=line_svc), \
         patch("app.services.user_identity_service.resolve_by_line_id", new=AsyncMock(return_value=SimpleNamespace(id=1))), \
         patch("app.services.booking_service.list_user_bookings", new=AsyncMock(return_value=[_booking()])):
        await commands.handle_check_booking("U1", "tok", AsyncMock())

    line_svc.reply_flex.assert_awaited_once()
    assert line_svc.reply_flex.await_args.args[1] == "คิวนัดหมายของคุณ"


@pytest.mark.asyncio
async def test_check_booking_for_an_unknown_user_still_replies():
    """A first-time sender must get the friendly empty bubble, not silence."""
    line_svc = AsyncMock()
    with patch.object(commands, "get_line_service", return_value=line_svc), \
         patch("app.services.user_identity_service.resolve_by_line_id", new=AsyncMock(return_value=None)):
        await commands.handle_check_booking("U-new", "tok", AsyncMock())

    line_svc.reply_flex.assert_awaited_once()


@pytest.mark.asyncio
async def test_a_lookup_failure_falls_back_to_a_text_apology():
    line_svc = AsyncMock()
    with patch.object(commands, "get_line_service", return_value=line_svc), \
         patch("app.services.user_identity_service.resolve_by_line_id", new=AsyncMock(side_effect=Exception("db down"))):
        await commands.handle_check_booking("U1", "tok", AsyncMock())

    line_svc.reply_text.assert_awaited_once()
    line_svc.reply_flex.assert_not_awaited()
