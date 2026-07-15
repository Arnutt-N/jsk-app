"""Tests for the CredentialResponse 500 fix (see
.claude/PRPs/prds/fix-credential-response.prd.md).

Every route in admin_credentials.py that builds a CredentialResponse used to
raise ValidationError on a bare Credential ORM instance because:
  1. the schema's `metadata` field resolved (via from_attributes) to
     SQLAlchemy's inherited `Base.metadata` registry -- a MetaData object,
     not a dict -- since the ORM maps the JSONB column under the Python
     attribute name `metadata_json`.
  2. `credentials_masked` was a required field with no ORM counterpart,
     assigned only AFTER the (already-failing) model_validate() call.

These tests prove both are fixed at the schema level (FR2.1), at the
endpoint level for create/get (FR2.2), and that JSON clients' "metadata"
key still round-trips for input parsing (FR2.3).
"""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints import admin_credentials
from app.models.credential import Credential, Provider as ORMProvider
from app.schemas.credential import CredentialCreate, CredentialResponse, Provider
from app.models.user import UserRole


def _real_credential(**overrides) -> Credential:
    """Build a real (unsaved) Credential ORM instance, matching what
    SQLAlchemy would hand back after a flush/refresh."""
    defaults = dict(
        id=1,
        name="LINE Prod",
        provider=ORMProvider.LINE.value,
        credentials="encrypted-blob-XYZ9",
        metadata_json={"webhook_url": "https://example.com/wh"},
        is_active=True,
        is_default=True,
    )
    defaults.update(overrides)
    credential = Credential(**defaults)
    now = datetime.now(timezone.utc)
    credential.created_at = now
    credential.updated_at = now
    return credential


# ── FR2.1 -- schema-level: model_validate() against a real ORM instance ────


def test_credential_response_model_validate_succeeds_on_real_orm_instance():
    credential = _real_credential()

    response = CredentialResponse.model_validate(credential)

    assert response.metadata == credential.metadata_json == {"webhook_url": "https://example.com/wh"}
    assert response.credentials_masked == ""


def test_credential_response_serializes_metadata_not_metadata_json():
    credential = _real_credential()

    dumped = CredentialResponse.model_validate(credential).model_dump(by_alias=True)

    assert "metadata" in dumped
    assert "metadata_json" not in dumped
    assert dumped["metadata"] == {"webhook_url": "https://example.com/wh"}


def test_credential_response_handles_null_metadata():
    """metadata_json is nullable -- confirm None survives the alias path
    instead of tripping the AliasChoices resolution."""
    credential = _real_credential(metadata_json=None)

    response = CredentialResponse.model_validate(credential)

    assert response.metadata is None


# ── FR2.3 -- input compatibility: JSON clients still send "metadata" ──────


def test_credential_create_still_parses_metadata_json_key():
    payload = {
        "name": "LINE Prod",
        "provider": "LINE",
        "metadata": {"webhook_url": "https://example.com/wh"},
        "credentials": {"channel_access_token": "SECRET"},
    }

    parsed = CredentialCreate.model_validate(payload)

    assert parsed.metadata == {"webhook_url": "https://example.com/wh"}
    assert parsed.provider == Provider.LINE
    assert parsed.credentials == {"channel_access_token": "SECRET"}


# ── FR2.2 -- endpoint-level: create_credential / get_credential ───────────


class _FakeDB:
    """Minimal AsyncSession stand-in covering what create_credential /
    get_credential / create_audit_log touch: add, commit, refresh, flush,
    execute (unused here since is_default stays False), and db.get."""

    def __init__(self, get_registry=None):
        self.added = []
        self.commit_calls = 0
        self._get_registry = dict(get_registry or {})
        self._next_id = 42

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.commit_calls += 1

    async def refresh(self, obj) -> None:
        if getattr(obj, "id", None) is None:
            obj.id = self._next_id
        now = datetime.now(timezone.utc)
        if getattr(obj, "created_at", None) is None:
            obj.created_at = now
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = now

    async def flush(self) -> None:
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = self._next_id

    async def get(self, model, id_):
        return self._get_registry.get(id_)

    async def execute(self, stmt):
        raise AssertionError("not expected in these tests (is_default stays False)")


def _admin(admin_id: int = 7):
    return SimpleNamespace(id=admin_id, role=UserRole.SUPER_ADMIN, username="root-admin")


@pytest.mark.asyncio
async def test_create_credential_endpoint_returns_populated_response_no_validation_error():
    db = _FakeDB()
    payload = CredentialCreate(
        name="LINE Prod",
        provider=Provider.LINE,
        metadata={"webhook_url": "https://example.com/wh"},
        credentials={"channel_access_token": "SENTINEL_TOKEN"},
        is_active=True,
        is_default=False,
    )

    response = await admin_credentials.create_credential(
        request=payload, db=db, current_admin=_admin()
    )

    assert isinstance(response, CredentialResponse)
    assert response.metadata == {"webhook_url": "https://example.com/wh"}
    assert response.credentials_masked  # populated by the endpoint, non-empty
    assert response.credentials_masked.startswith("****")
    assert response.name == "LINE Prod"


@pytest.mark.asyncio
async def test_get_credential_endpoint_returns_populated_response_no_validation_error():
    credential = _real_credential()
    db = _FakeDB(get_registry={1: credential})

    response = await admin_credentials.get_credential(
        id=1, db=db, current_admin=_admin()
    )

    assert isinstance(response, CredentialResponse)
    assert response.metadata == {"webhook_url": "https://example.com/wh"}
    assert response.credentials_masked  # populated by the endpoint, non-empty
    assert response.credentials_masked.startswith("****")
