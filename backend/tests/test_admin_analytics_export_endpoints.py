"""Endpoint tests for analytics dashboard and conversation export APIs."""
import pytest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1.endpoints import admin_analytics, admin_export, admin_live_chat
from app.main import app
from app.models.message import MessageDirection, SenderRole
from app.models.user import UserRole


async def _override_get_db():
    yield AsyncMock()


async def _override_get_current_admin():
    return SimpleNamespace(id=1, role=UserRole.ADMIN, username="admin")


def test_dashboard_endpoint_returns_aggregated_payload():
    payload = {
        "trends": {"sessions_today": {"current": 5, "previous": 3, "delta": 2, "delta_percent": 66.7}},
        "session_volume": [{"day": "2026-02-01", "sessions": 5}],
        "peak_hours": [{"day_of_week": 1, "hour": 10, "message_count": 8}],
        "funnel": {"bot_entries": 100, "human_handoff": 40, "resolved": 30},
        "percentiles": {"frt": {"p50": 10, "p90": 25, "p99": 90}, "resolution": {"p50": 180, "p90": 500, "p99": 1200}},
    }

    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin
    original_get_dashboard = admin_analytics.analytics_service.get_dashboard
    admin_analytics.analytics_service.get_dashboard = AsyncMock(return_value=payload)

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/analytics/dashboard?days=7")
    finally:
        client.close()
        admin_analytics.analytics_service.get_dashboard = original_get_dashboard
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["funnel"]["resolved"] == 30


def test_export_csv_endpoint_streams_file():
    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

    original_get_display_name = admin_export._get_display_name
    original_get_messages = admin_export._get_conversation_messages
    admin_export._get_display_name = AsyncMock(return_value="Demo User")
    admin_export._get_conversation_messages = AsyncMock(
        return_value=[
            SimpleNamespace(
                id=1,
                created_at=datetime(2026, 2, 8, 3, 0, 0, tzinfo=timezone.utc),
                line_user_id="U123",
                direction=MessageDirection.INCOMING,
                sender_role=SenderRole.USER,
                message_type="text",
                content="hello",
            ),
            SimpleNamespace(
                id=2,
                created_at=datetime(2026, 2, 8, 3, 1, 0, tzinfo=timezone.utc),
                line_user_id="U123",
                direction=MessageDirection.OUTGOING,
                sender_role=SenderRole.ADMIN,
                message_type="text",
                content="hi",
            ),
        ]
    )

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/export/conversations/U123/csv")
    finally:
        client.close()
        admin_export._get_display_name = original_get_display_name
        admin_export._get_conversation_messages = original_get_messages
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "attachment;" in response.headers["content-disposition"]
    assert 'filename="Demo_User_20260208-20260208.csv"' in response.headers["content-disposition"]
    text = response.content.decode("utf-8-sig")
    assert "timestamp,line_user_id,direction,sender,message_type,content" in text
    assert "hello" in text
    assert "hi" in text


@pytest.mark.skipif(
    not __import__("importlib").util.find_spec("reportlab"),
    reason="reportlab not installed",
)
def test_export_pdf_endpoint_streams_file():
    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_admin] = _override_get_current_admin

    original_get_display_name = admin_export._get_display_name
    original_get_messages = admin_export._get_conversation_messages
    admin_export._get_display_name = AsyncMock(return_value="Demo User")
    admin_export._get_conversation_messages = AsyncMock(
        return_value=[
            SimpleNamespace(
                id=1,
                created_at=datetime(2026, 2, 8, 3, 0, 0, tzinfo=timezone.utc),
                line_user_id="U123",
                direction=MessageDirection.INCOMING,
                sender_role=SenderRole.USER,
                message_type="text",
                content="hello",
            ),
        ]
    )

    client = TestClient(app)
    try:
        response = client.get("/api/v1/admin/export/conversations/U123/pdf")
    finally:
        client.close()
        admin_export._get_display_name = original_get_display_name
        admin_export._get_conversation_messages = original_get_messages
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "application/pdf" in response.headers["content-type"]
    assert "attachment;" in response.headers["content-disposition"]
    assert 'filename="Demo_User_20260208-20260208.pdf"' in response.headers["content-disposition"]


def test_refresh_profile_endpoint_returns_updated_user():
    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_admin

    original_refresh = admin_live_chat.friend_service.refresh_profile
    admin_live_chat.friend_service.refresh_profile = AsyncMock(
        return_value=SimpleNamespace(
            display_name="Fresh Name",
            picture_url="https://example.com/fresh.png",
            profile_updated_at=datetime(2026, 2, 9, 3, 0, 0, tzinfo=timezone.utc),
        )
    )

    client = TestClient(app)
    try:
        response = client.post("/api/v1/admin/live-chat/conversations/U123/refresh-profile")
    finally:
        client.close()
        admin_live_chat.friend_service.refresh_profile = original_refresh
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["line_user_id"] == "U123"
    assert payload["display_name"] == "Fresh Name"
