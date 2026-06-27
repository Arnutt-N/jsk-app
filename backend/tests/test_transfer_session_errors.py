"""Endpoint tests for transfer_session ValueError -> HTTP status mapping.

The REST endpoint POST /api/v1/admin/live-chat/conversations/{id}/transfer
catches the ValueError raised by LiveChatService.transfer_session and maps it
to 404 / 403 / 400. transfer_session carries an @audit_action decorator and
needs a real DB, so the service layer is mocked here -- these tests exercise
only the endpoint's error mapping, not the transfer business logic itself.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.api.v1.endpoints import admin_live_chat
from app.main import app
from app.models.user import UserRole
from app.services.live_chat_service import (
    TRANSFER_ERR_NO_ACTIVE_SESSION,
    TRANSFER_ERR_NOT_CURRENT_OPERATOR,
    TRANSFER_ERR_TRANSFER_TO_SELF,
    TRANSFER_ERR_INVALID_TARGET,
)

TRANSFER_URL = "/api/v1/admin/live-chat/conversations/U123/transfer"


async def _override_get_db():
    # transfer_session is mocked to raise before the DB is touched, so a bare
    # AsyncMock session is sufficient here.
    yield AsyncMock()


async def _override_get_current_staff():
    return SimpleNamespace(id=1, role=UserRole.AGENT, username="operator")


def _post_transfer_expecting(error_message: str):
    """Mock transfer_session to raise ValueError(error_message) and POST."""
    app.dependency_overrides[deps.get_db] = _override_get_db
    app.dependency_overrides[deps.get_current_staff] = _override_get_current_staff

    original = admin_live_chat.live_chat_service.transfer_session
    admin_live_chat.live_chat_service.transfer_session = AsyncMock(
        side_effect=ValueError(error_message)
    )

    client = TestClient(app)
    try:
        response = client.post(
            TRANSFER_URL,
            json={"to_operator_id": 2, "reason": "test"},
        )
    finally:
        client.close()
        admin_live_chat.live_chat_service.transfer_session = original
        app.dependency_overrides.clear()
    return response


def test_no_active_session_maps_to_404():
    response = _post_transfer_expecting(TRANSFER_ERR_NO_ACTIVE_SESSION)
    assert response.status_code == 404
    assert response.json()["detail"] == TRANSFER_ERR_NO_ACTIVE_SESSION


def test_not_current_operator_maps_to_403():
    response = _post_transfer_expecting(TRANSFER_ERR_NOT_CURRENT_OPERATOR)
    assert response.status_code == 403
    assert response.json()["detail"] == TRANSFER_ERR_NOT_CURRENT_OPERATOR


def test_transfer_to_self_maps_to_400():
    response = _post_transfer_expecting(TRANSFER_ERR_TRANSFER_TO_SELF)
    assert response.status_code == 400
    assert response.json()["detail"] == TRANSFER_ERR_TRANSFER_TO_SELF


def test_invalid_target_operator_maps_to_400():
    response = _post_transfer_expecting(TRANSFER_ERR_INVALID_TARGET)
    assert response.status_code == 400
    assert response.json()["detail"] == TRANSFER_ERR_INVALID_TARGET


def test_unrecognized_value_error_falls_back_to_400():
    response = _post_transfer_expecting("some unexpected failure")
    assert response.status_code == 400
    assert response.json()["detail"] == "some unexpected failure"
