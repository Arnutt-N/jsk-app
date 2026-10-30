from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.services.tag_service import TagService


@pytest.fixture
def service():
    return TagService()


class TestCreateTag:
    @pytest.mark.asyncio
    async def test_create_tag_rejects_invalid_color(self, service):
        mock_db = MagicMock()
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()
        mock_db.refresh = AsyncMock()
        with pytest.raises(ValueError, match="hex color"):
            await service.create_tag(mock_db, name="VIP", color="blue")

    @pytest.mark.asyncio
    async def test_create_tag_handles_duplicate_name(self, service):
        mock_db = MagicMock()
        mock_db.rollback = AsyncMock()
        mock_db.refresh = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.commit.side_effect = IntegrityError("duplicate", None, None)

        with pytest.raises(ValueError, match="already exists"):
            await service.create_tag(mock_db, name="VIP", color="#22c55e")
        mock_db.rollback.assert_called_once()


class TestAssignTag:
    @pytest.mark.asyncio
    async def test_assign_tag_to_user_not_found(self, service):
        mock_db = AsyncMock()

        async def get_side_effect(model, value):
            return None

        mock_db.get.side_effect = get_side_effect
        with pytest.raises(LookupError, match="User not found"):
            await service.assign_tag_to_user(mock_db, user_id=1, tag_id=2)

    @pytest.mark.asyncio
    async def test_remove_tag_from_user_returns_false_when_absent(self, service):
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.rowcount = 0
        mock_db.execute.return_value = mock_result

        removed = await service.remove_tag_from_user(mock_db, user_id=1, tag_id=2)
        assert removed is False
        mock_db.commit.assert_called_once()
