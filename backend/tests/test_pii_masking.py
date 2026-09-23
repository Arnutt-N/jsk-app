from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.core.pii_masking import mask_line_id, mask_phone
from app.main import app
from app.models.user import UserRole


def test_mask_helpers_by_role():
    assert mask_line_id("U1234567890abcdef", "AGENT") != "U1234567890abcdef"
    assert "***" in mask_line_id("U1234567890abcdef", "AGENT")
    assert mask_line_id("U1234567890abcdef", "ADMIN") == "U1234567890abcdef"
    assert mask_line_id("U1234567890abcdef", "SUPER_ADMIN") == "U1234567890abcdef"
    assert mask_phone("0812345678", "AGENT") != "0812345678"
    assert mask_phone(None, "AGENT") is None


@pytest.mark.asyncio
async def test_friends_limit_capped(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.get("/api/v1/admin/friends?limit=9999")
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()
