import pytest

from app.api import deps as api_deps
from app.main import app


@pytest.mark.asyncio
async def test_detailed_and_ws_health_require_admin(test_client, monkeypatch):
    # F1: local .env files may set DEV_AUTH_BYPASS=true, which would answer
    # these admin endpoints 200 and mask the auth gate. Force the bypass off
    # so the test asserts gate behavior, not ambient env. (.env files are
    # never modified for tests.)
    monkeypatch.setattr(api_deps.settings, "DEV_AUTH_BYPASS", False)
    for path in ("/api/v1/health/detailed", "/api/v1/health/websocket"):
        resp = test_client.get(path)
        assert resp.status_code in (401, 403), path


@pytest.mark.asyncio
async def test_basic_health_hides_raw_error(test_client):
    class _BoomSession:
        async def execute(self, *_a, **_k):
            raise RuntimeError("boom-secret-host")

    async def _override_get_db():
        yield _BoomSession()

    app.dependency_overrides[api_deps.get_db] = _override_get_db
    try:
        resp = test_client.get("/api/v1/health")
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200
    assert "boom-secret-host" not in resp.text
    assert "database_error" not in resp.json()
    assert resp.json()["database"] is False
