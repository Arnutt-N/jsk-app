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
    # unique suffix — a leftover $flex_traffic row from an earlier aborted run
    # must not 400 the good case
    import uuid as uuid_mod
    good_id = f"$flex_traffic_{uuid_mod.uuid4().hex[:8]}"
    try:
        bad = test_client.post(
            "/api/v1/admin/reply-objects",
            json={"object_id": "$100", "name": "x", "object_type": "text", "payload": {"text": "hi"}},
        )
        assert bad.status_code == 422
        good = test_client.post(
            "/api/v1/admin/reply-objects",
            json={"object_id": good_id, "name": "จราจร", "object_type": "text", "payload": {"text": "hi"}},
        )
        assert good.status_code == 201
        # cleanup the row this test created (delete keyed by object_id string)
        if good.status_code == 201:
            test_client.delete(f"/api/v1/admin/reply-objects/{good.json()['object_id']}")
    finally:
        app.dependency_overrides.clear()
