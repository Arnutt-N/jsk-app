from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.user import UserRole
from app.services import super_admin_guard


class _DB:
    def __init__(self, current_role, count):
        self.statements = []
        self._current = (current_role, True) if current_role is not None else None
        self._count = count

    async def execute(self, stmt):
        sql = str(stmt)
        self.statements.append(sql)
        if "pg_advisory_xact_lock" in sql:
            return SimpleNamespace()
        if "FROM users" in sql and "count(" not in sql:
            return SimpleNamespace(first=lambda: self._current)
        return SimpleNamespace(scalar_one=lambda: self._count)


@pytest.mark.asyncio
async def test_guard_rejects_removing_last_active_super_admin():
    db = _DB(UserRole.SUPER_ADMIN, 0)
    with pytest.raises(HTTPException) as exc:
        await super_admin_guard.ensure_active_super_admin(db, 7, UserRole.ADMIN, True)
    assert exc.value.status_code == 403
    assert "pg_advisory_xact_lock" in db.statements[0]
    assert any("count(" in sql for sql in db.statements[1:])


@pytest.mark.asyncio
async def test_guard_allows_when_another_owner_remains():
    db = _DB(UserRole.SUPER_ADMIN, 1)
    await super_admin_guard.ensure_active_super_admin(db, 7, UserRole.ADMIN, True)
    assert len(db.statements) == 3


@pytest.mark.asyncio
async def test_guard_ignores_non_owner_changes():
    db = _DB(UserRole.AGENT, 0)
    await super_admin_guard.ensure_active_super_admin(db, 7, UserRole.AGENT, False)
    assert len(db.statements) == 2
