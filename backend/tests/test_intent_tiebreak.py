"""Intent keyword matching is deterministic (R3-M14). Mocked db, local."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.message_intake.intent_matching import find_intent_keyword


@pytest.mark.asyncio
async def test_exact_match_query_orders_by_id():
    row = SimpleNamespace(id=7)
    res = MagicMock()
    res.scalars.return_value.first.return_value = row
    db = AsyncMock()
    db.execute = AsyncMock(return_value=res)

    out = await find_intent_keyword("เวลาเปิด", db)
    assert out is row
    assert "ORDER BY" in str(db.execute.call_args.args[0])
