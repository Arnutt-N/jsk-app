from types import SimpleNamespace
import pytest

from app.api import deps as api_deps
from app.api.v1.endpoints.admin_reports import _csv_line_id
from app.main import app
from app.models.user import UserRole


def test_csv_line_id_masked_by_role():
    assert _csv_line_id("U1234567890abcdef", "AGENT") != "U1234567890abcdef"
    assert _csv_line_id("U1234567890abcdef", "ADMIN") == "U1234567890abcdef"


@pytest.mark.asyncio
async def test_bad_export_type_422(test_client):
    async def _override():
        yield SimpleNamespace(id=1, role=UserRole.SUPER_ADMIN, is_active=True)

    app.dependency_overrides[api_deps.get_current_user] = _override
    try:
        r1 = test_client.get("/api/v1/admin/reports/export?type=diagonal")
        assert r1.status_code == 422
        r2 = test_client.get("/api/v1/admin/reports/export/pdf?report_type=diagonal")
        assert r2.status_code == 422
    finally:
        app.dependency_overrides.clear()
