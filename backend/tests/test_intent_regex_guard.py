from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.main import app
from app.models.user import UserRole


@pytest.mark.asyncio
async def test_nested_quantifier_regex_rejected(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        resp = test_client.post(
            "/api/v1/admin/intents/keywords",
            json={"category_id": 1, "keyword": "(a+)+$", "match_type": "regex"},
        )
        assert resp.status_code == 422
        assert "เจาะจง" in resp.text or "ค้าง" in resp.text
    finally:
        app.dependency_overrides.clear()


def test_compile_intent_keyword_rejects_poison():
    from app.services.message_intake.intent_matching import compile_intent_keyword
    with pytest.raises(ValueError):
        compile_intent_keyword("(a+)+$" * 5)
    with pytest.raises(ValueError):
        compile_intent_keyword("x" * 300)
