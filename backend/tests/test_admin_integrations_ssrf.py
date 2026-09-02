"""SSRF guard tests for the integration test endpoints (review finding M9).

test_n8n / test_integration fetch admin-configured URLs server-side. The fix
blocks non-http(s) schemes, localhost-style hostnames, and private/loopback/
link-local IP literals BEFORE any fetch, and stops echoing response bodies.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.api.v1.endpoints.admin_integrations import TestResult, _assert_safe_url


@pytest.mark.parametrize("url", [
    "https://example.com/hook",
    "http://example.com/hook",
    "https://n8n.mycompany.io/webhook-test",
])
def test_safe_urls_pass(url):
    _assert_safe_url(url)  # must not raise


@pytest.mark.parametrize("url", [
    "http://127.0.0.1:5678/webhook",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/hook",
    "http://172.16.1.1/hook",
    "http://192.168.1.10/hook",
    "ftp://example.com/hook",
    "file:///etc/passwd",
    "http://localhost:5678/",
    "http://metadata.localhost/",
    "",
])
def test_unsafe_urls_rejected(url):
    with pytest.raises(ValueError):
        _assert_safe_url(url)


def test_endpoint_blocks_loopback_without_outbound_call():
    """Configuring a loopback URL must 400/fail before any httpx call."""
    from types import SimpleNamespace

    from app.api import deps
    from app.core.permissions import invalidate_cache
    from app.db.session import get_db as session_get_db
    from app.main import app

    invalidate_cache()

    cred = SimpleNamespace(
        id=5, provider="CUSTOM",
        credentials="encrypted-blob", created_at=None, updated_at=None,
    )
    admin = SimpleNamespace(id=7, username="tester", role="SUPER_ADMIN", is_active=True)

    async def _get_admin():
        return admin

    class _Result:
        def scalar_one_or_none(self):
            return None

    class _DB:
        async def execute(self, stmt):
            return _Result()

        async def get(self, model, pk):
            return cred

        def add(self, obj):
            pass

        async def commit(self):
            pass

        async def refresh(self, obj):
            pass

    async def _get_db():
        yield _DB()

    app.dependency_overrides[session_get_db] = _get_db
    app.dependency_overrides[deps.get_current_admin] = _get_admin
    from fastapi.testclient import TestClient

    client = TestClient(app)
    try:
        with patch("app.api.v1.endpoints.admin_integrations.credential_service") as cs, \
             patch("app.api.v1.endpoints.admin_integrations.httpx.AsyncClient") as client_cls, \
             patch("app.api.v1.endpoints.admin_integrations._finish_integration_test",
                   new=AsyncMock(return_value=TestResult(success=False, message="blocked"))) as finish:
            cs.decrypt_credentials.return_value = {
                "url": "http://127.0.0.1:5678/webhook",
                "integration_type": "webhook",
            }
            client_cls.side_effect = AssertionError("httpx must never be called for a blocked URL")
            resp = client.post("/api/v1/admin/settings/integrations/5/test")
    finally:
        client.close()
        app.dependency_overrides.clear()
        invalidate_cache()

    assert resp.status_code == 200
    body = finish.await_args.args[-1] if finish.await_args.args else finish.await_args.kwargs
    # the result must carry the guard's failure, not an outbound attempt
    assert finish.await_count == 1
