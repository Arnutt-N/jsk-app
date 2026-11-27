from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.models.broadcast import BroadcastType
from app.services.broadcast_service import BroadcastService


class AcceptedRetry(Exception):
    status = 409
    headers = {"x-line-accepted-request-id": "original-request-id"}


class PlainRefusal(Exception):
    status = 400
    headers = {}


def test_accepted_409_is_not_a_definite_failure():
    assert BroadcastService._is_accepted_retry(AcceptedRetry()) is True
    assert BroadcastService._is_definite_failure(AcceptedRetry()) is False
    assert BroadcastService._is_definite_failure(PlainRefusal()) is True


@pytest.mark.asyncio
async def test_send_chunk_treats_accepted_409_as_success():
    svc = BroadcastService()
    svc._api = SimpleNamespace(
        broadcast=AsyncMock(side_effect=AcceptedRetry()),
        multicast=AsyncMock(),
    )
    broadcast = SimpleNamespace(
        id=7,
        payload_version=1,
        target_audience="all",
        target_filter={},
        message_type=BroadcastType.TEXT,
    )

    with patch.object(svc, "_record_attempt", new=AsyncMock()) as record:
        outcome = await svc._send_chunk(
            AsyncMock(), broadcast, [{"type": "text", "text": "hi"}], 0, [], "lease", []
        )

    assert outcome == "accepted"
    assert record.await_args.args[5] == "ACCEPTED"
    svc._api.broadcast.assert_awaited_once()
