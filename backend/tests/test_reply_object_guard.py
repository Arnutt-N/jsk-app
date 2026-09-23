from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.main import app
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_dollar_name_strict(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        bad = test_client.post(
            "/api/v1/admin/reply-objects",
            json={"object_id": "$100", "name": "x", "object_type": "text", "payload": {"text": "hi"}},
        )
        assert bad.status_code == 422
        good = test_client.post(
            "/api/v1/admin/reply-objects",
            json={"object_id": "$flex_traffic", "name": "จราจร", "object_type": "text", "payload": {"text": "hi"}},
        )
        assert good.status_code == 201
    finally:
        app.dependency_overrides.clear()
