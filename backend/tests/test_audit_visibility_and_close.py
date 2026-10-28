"""F-006 / F-007: audit rows for public links and conversation force-close.

F-006 — creating, revoking, and bulk-creating public links changes whether a
citizen's upload is world-readable. The delete path already wrote an audit row;
these three did not, so the most privacy-sensitive transitions left no trace.

F-007 — `delete_conversation` force-closed ANY session through the permissive
staff gate and stamped `closed_by = OPERATOR` without recording who did it. It
must now:
  * be gated on the live-chat key (already true after Task 1),
  * require ownership or SUPER_ADMIN/ADMIN (an unclaimed session included),
  * write an audit row carrying the actor.

These tests assert on the audit calls rather than on DB rows: `create_audit_log`
is patched in each endpoint module, so no database is involved.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import admin_live_chat
from app.api.v1.endpoints import media as media_endpoint
from app.models.user import UserRole


def _user(role: UserRole = UserRole.AGENT, uid: int = 7):
    u = MagicMock()
    u.id = uid
    u.role = role
    u.is_active = True
    return u


def _media_row(is_public: bool = False, token: str | None = None):
    m = MagicMock()
    m.id = "11111111-1111-1111-1111-111111111111"
    m.is_public = is_public
    m.public_token = token
    m.filename = "x.jpg"
    m.mime_type = "image/jpeg"
    return m


# --- F-006: media public-link paths -----------------------------------------


@pytest.mark.asyncio
async def test_create_public_link_writes_an_audit_row():
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=lambda: _media_row())
    )
    admin = _user(UserRole.ADMIN, 3)

    with patch.object(
        media_endpoint, "create_audit_log", new=AsyncMock()
    ) as audit, patch.object(media_endpoint, "_serialise", return_value={}):
        await media_endpoint.create_public_link(
            media_id="11111111-1111-1111-1111-111111111111", db=db, _admin=admin
        )

    audit.assert_awaited_once()
    kwargs = audit.await_args.kwargs
    assert kwargs["admin_id"] == 3
    assert kwargs["resource_type"] == "media_file"
    assert kwargs["action"] == "create_public_link"


@pytest.mark.asyncio
async def test_revoke_public_link_writes_an_audit_row():
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(
            scalar_one_or_none=lambda: _media_row(True, "token-abc")
        )
    )
    admin = _user(UserRole.ADMIN, 3)

    with patch.object(
        media_endpoint, "create_audit_log", new=AsyncMock()
    ) as audit, patch.object(media_endpoint, "_serialise", return_value={}):
        await media_endpoint.revoke_public_link(
            media_id="11111111-1111-1111-1111-111111111111", db=db, _admin=admin
        )

    audit.assert_awaited_once()
    kwargs = audit.await_args.kwargs
    assert kwargs["admin_id"] == 3
    assert kwargs["action"] == "revoke_public_link"


@pytest.mark.asyncio
async def test_bulk_create_public_links_writes_one_audit_row():
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [_media_row()]))
    )
    admin = _user(UserRole.ADMIN, 3)
    body = MagicMock(ids=["11111111-1111-1111-1111-111111111111"])

    with patch.object(
        media_endpoint, "create_audit_log", new=AsyncMock()
    ) as audit:
        await media_endpoint.bulk_create_public_links(body=body, db=db, _admin=admin)

    audit.assert_awaited_once()
    kwargs = audit.await_args.kwargs
    assert kwargs["action"] == "bulk_create_public_links"
    assert kwargs["details"]["count"] == 1


@pytest.mark.asyncio
async def test_no_audit_row_when_the_media_does_not_exist():
    """404 must not leave a misleading audit trail."""
    db = AsyncMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=lambda: None))

    with patch.object(
        media_endpoint, "create_audit_log", new=AsyncMock()
    ) as audit:
        with pytest.raises(HTTPException) as exc:
            await media_endpoint.create_public_link(
                media_id="11111111-1111-1111-1111-111111111111",
                db=db,
                _admin=_user(UserRole.ADMIN, 3),
            )

    assert exc.value.status_code == 404
    audit.assert_not_awaited()


# --- F-007: delete_conversation ownership + audit ---------------------------


def _session(operator_id: int | None, status: str = "ACTIVE"):
    s = MagicMock()
    s.id = 42
    s.operator_id = operator_id
    s.status = status
    s.is_archived = False
    s.archived_at = None
    s.archived_by = None
    s.closed_at = None
    s.closed_by = None
    return s


async def _call_delete(role: UserRole, uid: int, operator_id: int | None):
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(
            scalar_one_or_none=lambda: _session(operator_id)
        )
    )
    with patch.object(
        admin_live_chat, "resolve_by_line_id", new=AsyncMock(return_value=None)
    ), patch.object(admin_live_chat, "child_filter", return_value=None), patch.object(
        admin_live_chat, "create_audit_log", new=AsyncMock()
    ) as audit:
        result = await admin_live_chat.delete_conversation(
            line_user_id="U1", db=db, current_user=_user(role, uid)
        )
    return result, audit


@pytest.mark.asyncio
async def test_owner_can_force_close_their_own_session():
    result, audit = await _call_delete(UserRole.AGENT, 7, operator_id=7)

    assert result["success"] is True
    audit.assert_awaited_once()
    kwargs = audit.await_args.kwargs
    assert kwargs["admin_id"] == 7
    assert kwargs["action"] == "force_close_conversation"
    assert kwargs["details"]["actor_id"] == 7
    assert kwargs["details"]["force_close"] is True


@pytest.mark.asyncio
async def test_non_owner_agent_is_refused():
    """An AGENT must not close a session another operator holds."""
    with pytest.raises(HTTPException) as exc:
        await _call_delete(UserRole.AGENT, 7, operator_id=99)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_unclaimed_session_requires_supervisor():
    """operator_id is NULL on a WAITING session — an AGENT cannot claim-then-kill."""
    with pytest.raises(HTTPException) as exc:
        await _call_delete(UserRole.AGENT, 7, operator_id=None)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_supervisor_can_close_an_unclaimed_session():
    result, audit = await _call_delete(UserRole.ADMIN, 3, operator_id=None)

    assert result["success"] is True
    audit.assert_awaited_once()


@pytest.mark.asyncio
async def test_supervisor_can_close_someone_elses_session():
    result, audit = await _call_delete(UserRole.SUPER_ADMIN, 1, operator_id=99)

    assert result["success"] is True
    audit.assert_awaited_once()
