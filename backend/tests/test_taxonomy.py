"""Shared taxonomy tests — Unit 1: frozen seed equality (authoring-time).

The migration seed is a literal frozen copy of
frontend/lib/constants/categories.ts TOPIC_OPTIONS. This test hardcodes the
same literal so any drift in the migration file fails fast. It needs no DB.
"""

import importlib.util
from pathlib import Path


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "d7e8f9a0b1c2_create_taxonomy_tables.py"
    )
    spec = importlib.util.spec_from_file_location("_taxonomy_migration", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


TOPIC_SEED = _load_migration().TOPIC_SEED


EXPECTED_TOPIC_OPTIONS: dict[str, list[str]] = {
    "แจ้งเบาะแสยาเสพติด": [
        "ปัญหายาเสพติด",
        "ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย",
        "ขอความช่วยเหลือบำบัดผู้เสพ",
        "ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด",
    ],
    "กองทุนยุติธรรม": [
        "ค่าจ้างทนายความ",
        "ค่าธรรมเนียมศาล",
        "เงินประกันตัว",
        "อื่นๆ",
    ],
    "เงินเยียวยาเหยื่ออาชญากรรม": [
        "กรณีถูกทำร้ายร่างกาย/ถูกลูกหลง",
        "กรณีอุบัติเหตุจราจร",
        "กรณีอุบัติเหตุอื่นๆ/ไม่ทราบผู้กระทำผิด",
        "อื่นๆ",
    ],
    "พยานในคดีอาญา": [
        "ค่าพาหนะ/ค่าที่พัก/ค่าอาหาร (พยาน)",
        "ค่าตอบแทนความเสียหาย (พยาน)",
        "การคุ้มครองพยาน",
    ],
    "ไกล่เกลี่ยระงับข้อพิพาท": [
        "หนี้สิน",
        "ที่ดิน",
        "มรดก",
        "อื่นๆ",
    ],
    "รับเรื่องราวร้องทุกข์": [
        "ขอถวายฎีกา/รื้อฟื้นคดี",
        "การบังคับคดี",
        "ความขัดแย้งกับหน่วยงานรัฐ",
        "อื่นๆ",
    ],
    "ให้คำปรึกษากฎหมาย": [
        "แพ่ง",
        "อาญา",
        "อื่นๆ",
    ],
}


def test_seed_matches_frozen_frontend_options():
    assert TOPIC_SEED == EXPECTED_TOPIC_OPTIONS


def test_seed_encodes_exactly_two_levels():
    assert len(TOPIC_SEED) == 7
    for category, topics in TOPIC_SEED.items():
        assert category.strip(), "category name must be non-empty"
        assert isinstance(topics, list) and topics, "each category needs topics"
        for topic in topics:
            assert isinstance(topic, str) and topic.strip()
    assert len(set(TOPIC_SEED)) == len(TOPIC_SEED)


# --- Unit 2: service (sole owner, cache, validation) ------------------------

import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.exc import IntegrityError

from app.core.permissions import (
    DEFAULT_POLICY,
    KEY_MANAGE_TAXONOMY,
    LEVEL_MANAGE,
    PERMISSION_REGISTRY,
)
from app.models.user import UserRole
from app.schemas.taxonomy import CategoryRead, TaxonomyMapResponse
from app.services.taxonomy_service import taxonomy_service


@pytest.fixture(autouse=True)
def _fresh_taxonomy_cache():
    taxonomy_service.invalidate()
    yield
    taxonomy_service.invalidate()


def _result(items):
    scalars = MagicMock()
    scalars.all.return_value = items
    result = MagicMock()
    result.scalars.return_value = scalars
    result.scalar_one_or_none.return_value = items[0] if items else None
    return result


def _mock_db(*exec_results, get_map=None):
    db = AsyncMock()
    db.execute.side_effect = list(exec_results)
    if get_map is not None:
        db.get.side_effect = lambda _model, _id: get_map.get(_id)
    db.add = MagicMock()
    return db


class TestTaxonomyPermissionKey:
    def test_key_defaults_to_super_admin_and_admin_only(self):
        assert DEFAULT_POLICY[KEY_MANAGE_TAXONOMY] == frozenset(
            {UserRole.SUPER_ADMIN, UserRole.ADMIN}
        )

    def test_key_registered_as_system_manage(self):
        metas = [m for m in PERMISSION_REGISTRY if m.key == KEY_MANAGE_TAXONOMY]
        assert len(metas) == 1
        assert metas[0].module == "system"
        assert metas[0].level == LEVEL_MANAGE


class TestGetTaxonomyMap:
    @pytest.mark.asyncio
    async def test_empty_tables_return_empty_map(self):
        db = _mock_db(_result([]), _result([]))
        assert await taxonomy_service.get_taxonomy_map(db) == {}

    @pytest.mark.asyncio
    async def test_builds_bare_map_and_caches_for_60s_window(self):
        cats = [SimpleNamespace(id=1, name="ก")]
        topics = [
            SimpleNamespace(category_id=1, name="ข"),
            SimpleNamespace(category_id=1, name="ค"),
        ]
        db = _mock_db(_result(cats), _result(topics))
        first = await taxonomy_service.get_taxonomy_map(db)
        assert first == {"ก": ["ข", "ค"]}
        TaxonomyMapResponse.model_validate(first)
        second = await taxonomy_service.get_taxonomy_map(db)
        assert second == first
        assert db.execute.call_count == 2

    @pytest.mark.asyncio
    async def test_writer_invalidates_cached_map(self):
        cats = [SimpleNamespace(id=1, name="ก")]
        db = _mock_db(_result(cats), _result([]), _result([]), _result([]))
        await taxonomy_service.get_taxonomy_map(db)
        assert db.execute.call_count == 2
        taxonomy_service.invalidate()
        await taxonomy_service.get_taxonomy_map(db)
        assert db.execute.call_count == 4


class TestCategoryWriters:
    @pytest.mark.asyncio
    async def test_create_trims_name(self):
        db = _mock_db(_result([]))
        db.get = AsyncMock(return_value=None)
        created = await taxonomy_service.create_category(db, "  กองทุน  ")
        assert created.name == "กองทุน"
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_rejects_blank_name(self):
        db = _mock_db()
        with pytest.raises(ValueError, match="must not be empty"):
            await taxonomy_service.create_category(db, "   ")
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_create_duplicate_maps_to_409_value_error(self):
        db = _mock_db()
        db.commit = AsyncMock(side_effect=IntegrityError("dup", None, None))
        db.rollback = AsyncMock()
        with pytest.raises(ValueError, match="Category 'กองทุน' already exists"):
            await taxonomy_service.create_category(db, "กองทุน")
        db.rollback.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_race_integrity_error_maps_to_409(self):
        db = _mock_db(_result([]))
        db.commit = AsyncMock(side_effect=IntegrityError("dup", None, None))
        db.rollback = AsyncMock()
        with pytest.raises(ValueError, match="already exists"):
            await taxonomy_service.create_category(db, "กองทุน")
        db.rollback.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_missing_category_raises_lookup(self):
        db = _mock_db()
        db.get = AsyncMock(return_value=None)
        with pytest.raises(LookupError, match="Category not found"):
            await taxonomy_service.update_category(db, 999, name="ใหม่")

    @pytest.mark.asyncio
    async def test_update_duplicate_name_raises(self):
        row = SimpleNamespace(id=2, name="เก่า")
        db = _mock_db()
        db.get = AsyncMock(return_value=row)
        db.commit = AsyncMock(side_effect=IntegrityError("dup", None, None))
        db.rollback = AsyncMock()
        with pytest.raises(ValueError, match="already exists"):
            await taxonomy_service.update_category(db, 2, name="ซ้ำ")
        db.rollback.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_missing_returns_false(self):
        db = _mock_db()
        db.get = AsyncMock(return_value=None)
        assert await taxonomy_service.delete_category(db, 999) is False

    @pytest.mark.asyncio
    async def test_delete_category_cascade_hides_topics(self):
        db = _mock_db()
        db.execute = AsyncMock()
        category = SimpleNamespace(id=1, name="ก", is_active=True)
        db.get = AsyncMock(return_value=category)
        assert await taxonomy_service.delete_category(db, 1) is True
        assert db.execute.called
        db.delete.assert_not_called()
        assert category.is_active is False

    @pytest.mark.asyncio
    async def test_delete_empty_category_soft_hides(self):
        db = _mock_db()
        db.execute = AsyncMock()
        category = SimpleNamespace(id=1, name="ก", is_active=True)
        db.get = AsyncMock(return_value=category)
        db.scalar = AsyncMock(return_value=0)
        assert await taxonomy_service.delete_category(db, 1) is True
        db.delete.assert_not_called()
        assert category.is_active is False


class TestTopicWriters:
    @pytest.mark.asyncio
    async def test_create_missing_category_raises_lookup(self):
        db = _mock_db()
        db.get = AsyncMock(return_value=None)
        with pytest.raises(LookupError, match="Category not found"):
            await taxonomy_service.create_topic(db, 999, "หัวข้อ")

    @pytest.mark.asyncio
    async def test_create_duplicate_in_category_raises(self):
        db = _mock_db()
        db.get = AsyncMock(return_value=SimpleNamespace(id=3))
        db.commit = AsyncMock(side_effect=IntegrityError("dup", None, None))
        db.rollback = AsyncMock()
        with pytest.raises(ValueError, match="already exists"):
            await taxonomy_service.create_topic(db, 3, "ซ้ำ")
        db.rollback.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_same_name_across_categories_allowed(self):
        db = _mock_db(_result([]))
        db.get = AsyncMock(return_value=SimpleNamespace(id=3))
        topic = await taxonomy_service.create_topic(db, 3, "อื่นๆ")
        assert topic.name == "อื่นๆ"
        assert topic.category_id == 3

    @pytest.mark.asyncio
    async def test_update_move_to_missing_category_raises(self):
        db = _mock_db()
        db.get = AsyncMock(
            side_effect=lambda _model, _id: SimpleNamespace(id=5, category_id=1)
            if _id == 5
            else None
        )
        with pytest.raises(LookupError, match="Category not found"):
            await taxonomy_service.update_topic(db, 5, category_id=999)

    @pytest.mark.asyncio
    async def test_delete_missing_returns_false(self):
        db = _mock_db()
        db.get = AsyncMock(return_value=None)
        assert await taxonomy_service.delete_topic(db, 999) is False


class TestSchemas:
    def test_category_read_from_attributes(self):
        read = CategoryRead.model_validate(
            SimpleNamespace(id=1, name="ก", sort_order=0, is_active=True, topics=[])
        )
        assert read.name == "ก"
        assert read.topics == []


# --- Unit 3: endpoints (public map + matrix-gated admin CRUD) ----------------

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import deps
from app.main import app


def _override_user(role):
    async def _user():
        return SimpleNamespace(id=1, username="t", display_name="T", role=role)

    return _user


async def _deny_anonymous():
    raise HTTPException(status_code=401, detail="Not authenticated")


async def _fake_db():
    yield AsyncMock()


@pytest.fixture()
def api_client(monkeypatch):
    app.dependency_overrides[deps.get_db] = _fake_db
    client = TestClient(app)
    yield client
    client.close()
    app.dependency_overrides.clear()


def _mock_service(monkeypatch, **methods):
    from app.api.v1.endpoints import admin_taxonomy as admin_module
    from app.api.v1.endpoints import taxonomy as public_module

    for name, impl in methods.items():
        target = admin_module if hasattr(admin_module, name) or name != "get_taxonomy_map" else public_module
        _ = target
        monkeypatch.setattr(taxonomy_service, name, impl)


class TestPublicTaxonomyEndpoint:
    @pytest.mark.asyncio
    async def test_returns_bare_map_without_auth(self, api_client, monkeypatch):
        async def _map(_db):
            return {"กองทุนยุติธรรม": ["ค่าจ้างทนายความ"]}

        _mock_service(monkeypatch, get_taxonomy_map=_map)
        response = api_client.get("/api/v1/taxonomy")
        assert response.status_code == 200
        assert response.json() == {"กองทุนยุติธรรม": ["ค่าจ้างทนายความ"]}

    @pytest.mark.asyncio
    async def test_empty_tables_return_empty_object(self, api_client, monkeypatch):
        async def _map(_db):
            return {}

        _mock_service(monkeypatch, get_taxonomy_map=_map)
        response = api_client.get("/api/v1/taxonomy")
        assert response.status_code == 200
        assert response.json() == {}


class TestAdminTaxonomyEndpoints:
    def test_list_requires_authentication(self, api_client):
        app.dependency_overrides[deps.get_current_user] = _deny_anonymous
        response = api_client.get("/api/v1/admin/taxonomy")
        assert response.status_code == 401

    def test_list_forbidden_without_matrix_key(self, api_client):
        app.dependency_overrides[deps.get_current_user] = _override_user(UserRole.AGENT)
        response = api_client.get("/api/v1/admin/taxonomy")
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_list_ok_for_admin(self, api_client, monkeypatch):
        app.dependency_overrides[deps.get_current_user] = _override_user(UserRole.ADMIN)
        cats = [
            SimpleNamespace(
                id=1,
                name="ก",
                sort_order=0,
                is_active=True,
                topics=[
                    SimpleNamespace(
                        id=11, category_id=1, name="ข", sort_order=0, is_active=True
                    )
                ],
            )
        ]

        async def _list(_db):
            return cats

        _mock_service(monkeypatch, get_admin_taxonomy=_list)
        response = api_client.get("/api/v1/admin/taxonomy")
        assert response.status_code == 200
        body = response.json()
        assert body["categories"][0]["name"] == "ก"
        assert body["categories"][0]["topics"][0]["name"] == "ข"

    @pytest.mark.asyncio
    async def test_create_duplicate_maps_to_409(self, api_client, monkeypatch):
        app.dependency_overrides[deps.get_current_user] = _override_user(UserRole.ADMIN)

        async def _dup(*_a, **_k):
            raise ValueError("Category 'ก' already exists")

        _mock_service(monkeypatch, create_category=_dup)
        response = api_client.post("/api/v1/admin/taxonomy/categories", json={"name": "ก"})
        assert response.status_code == 409

    def test_create_invalid_body_maps_to_422(self, api_client):
        app.dependency_overrides[deps.get_current_user] = _override_user(UserRole.ADMIN)
        response = api_client.post("/api/v1/admin/taxonomy/categories", json={"name": ""})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_update_missing_maps_to_404(self, api_client, monkeypatch):
        app.dependency_overrides[deps.get_current_user] = _override_user(UserRole.ADMIN)

        async def _missing(*_a, **_k):
            raise LookupError("Category not found")

        _mock_service(monkeypatch, update_category=_missing)
        response = api_client.patch(
            "/api/v1/admin/taxonomy/categories/999", json={"name": "ใหม่"}
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_missing_maps_to_404(self, api_client, monkeypatch):
        app.dependency_overrides[deps.get_current_user] = _override_user(UserRole.ADMIN)

        async def _false(*_a, **_k):
            return False

        _mock_service(monkeypatch, delete_category=_false)
        response = api_client.delete("/api/v1/admin/taxonomy/categories/999")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_category_cascade_maps_to_hidden(self, api_client, monkeypatch):
        app.dependency_overrides[deps.get_current_user] = _override_user(UserRole.ADMIN)

        async def _hidden(*_a, **_k):
            return True

        _mock_service(monkeypatch, delete_category=_hidden)
        response = api_client.delete("/api/v1/admin/taxonomy/categories/1")
        assert response.status_code == 200
        assert response.json() == {"status": "hidden", "id": 1}

    @pytest.mark.asyncio
    async def test_topic_create_missing_category_maps_to_404(
        self, api_client, monkeypatch
    ):
        app.dependency_overrides[deps.get_current_user] = _override_user(UserRole.ADMIN)

        async def _missing(*_a, **_k):
            raise LookupError("Category not found")

        _mock_service(monkeypatch, create_topic=_missing)
        response = api_client.post(
            "/api/v1/admin/taxonomy/topics", json={"category_id": 999, "name": "ข"}
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_topic_update_duplicate_maps_to_409(self, api_client, monkeypatch):
        app.dependency_overrides[deps.get_current_user] = _override_user(UserRole.ADMIN)

        async def _dup(*_a, **_k):
            raise ValueError("Topic 'ข' already exists in this category")

        _mock_service(monkeypatch, update_topic=_dup)
        response = api_client.patch("/api/v1/admin/taxonomy/topics/11", json={"name": "ข"})
        assert response.status_code == 409

    def test_admin_routes_use_matrix_gate_not_broad_admin(self):
        from pathlib import Path as _Path

        source = (
            _Path(__file__).resolve().parents[1]
            / "app"
            / "api"
            / "v1"
            / "endpoints"
            / "admin_taxonomy.py"
        ).read_text(encoding="utf-8")
        assert "require_permission(KEY_MANAGE_TAXONOMY)" in source
        assert "Depends(get_current_admin)" not in source
