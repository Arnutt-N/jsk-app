"""Bounds tests for the phone-bind command (T3, M-3).

`handle_bind_phone` scans a bounded newest-first tuple window (1000+1 rows)
and binds at most 50 rows via a single UPDATE. Reply texts and the latest-5
query are unchanged by the task - the tests assert call shapes and SQL, plus
the not-found/all-bound branch split via the not-found marker.

All DB/LINE collaborators are mocked - no real DB is touched.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.services.message_intake.commands import handle_bind_phone

PHONE = "0812345678"
LINE_USER_ID = "Utestuser"
REPLY_TOKEN = "tok123"


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


def _make_db(scan_rows, latest_rows=None):
    """Mock session: scan question first, UPDATE answer unused, latest last."""
    db = AsyncMock()
    results = [_FakeResult(scan_rows), SimpleNamespace()]
    if latest_rows is not None:
        results.append(_FakeResult(latest_rows))
    db.execute = AsyncMock(side_effect=results)
    return db


def _make_line_svc():
    svc = Mock()
    svc.reply_text = AsyncMock()
    svc.reply_flex = AsyncMock()
    return svc


async def _run_bind(db, line_svc, user_id=7):
    with patch(
        "app.services.user_identity_service.resolve_by_line_id",
        new=AsyncMock(return_value=SimpleNamespace(id=user_id)),
    ), patch(
        "app.services.message_intake.commands.get_line_service",
        return_value=line_svc,
    ), patch(
        "app.services.message_intake.commands.build_request_status_list",
        return_value={"flex": "sentinel"},
    ):
        await handle_bind_phone(PHONE, LINE_USER_ID, REPLY_TOKEN, db)


def _in_list(sql):
    return [i.strip() for i in sql.split("IN (")[1].split(")")[0].split(",")]


@pytest.mark.asyncio
async def test_bind_succeeds_and_sets_user_id():
    scan = [(1, None, None), (2, 7, None)]
    db = _make_db(scan, latest_rows=[])
    line_svc = _make_line_svc()
    await _run_bind(db, line_svc)

    assert db.execute.await_count == 3
    update_stmt = db.execute.await_args_list[1].args[0]
    sql = str(update_stmt.compile(compile_kwargs={"literal_binds": True}))
    assert "user_id=7" in sql
    assert _in_list(sql) == ["1", "2"]
    db.flush.assert_awaited_once()
    line_svc.reply_text.assert_not_awaited()
    line_svc.reply_flex.assert_awaited_once()
    assert line_svc.reply_flex.await_args.args[0] == REPLY_TOKEN
    assert line_svc.reply_flex.await_args.args[2] == {"flex": "sentinel"}


@pytest.mark.asyncio
async def test_shared_number_binds_newest_50_and_logs_leftover(caplog):
    scan = [(i, None, None) for i in range(1, 61)]
    db = _make_db(scan, latest_rows=[])
    line_svc = _make_line_svc()
    await _run_bind(db, line_svc)

    update_stmt = db.execute.await_args_list[1].args[0]
    sql = str(update_stmt.compile(compile_kwargs={"literal_binds": True}))
    assert _in_list(sql) == [str(i) for i in range(1, 51)]
    assert any("bind limit" in r.message for r in caplog.records)
    line_svc.reply_flex.assert_awaited_once()


@pytest.mark.asyncio
async def test_all_bound_to_others_still_replies_correctly():
    scan = [(1, 9, None), (2, 10, None)]
    db = _make_db(scan)
    line_svc = _make_line_svc()
    await _run_bind(db, line_svc)

    assert db.execute.await_count == 1
    line_svc.reply_text.assert_awaited_once()
    msg = line_svc.reply_text.await_args.args[1]
    assert PHONE in msg
    assert "\u274c" not in msg
    line_svc.reply_flex.assert_not_awaited()


@pytest.mark.asyncio
async def test_zero_rows_still_replies_not_found():
    db = _make_db([])
    line_svc = _make_line_svc()
    await _run_bind(db, line_svc)

    assert db.execute.await_count == 1
    line_svc.reply_text.assert_awaited_once()
    msg = line_svc.reply_text.await_args.args[1]
    assert PHONE in msg
    assert "\u274c" in msg
    line_svc.reply_flex.assert_not_awaited()


@pytest.mark.asyncio
async def test_1001_row_scan_warns_and_proceeds_with_1000(caplog):
    scan = [(i, None, None) for i in range(1, 1002)]
    db = _make_db(scan, latest_rows=[])
    line_svc = _make_line_svc()
    await _run_bind(db, line_svc)

    assert any("scan window" in r.message for r in caplog.records)
    assert any("bind limit" in r.message for r in caplog.records)
    update_stmt = db.execute.await_args_list[1].args[0]
    sql = str(update_stmt.compile(compile_kwargs={"literal_binds": True}))
    assert _in_list(sql) == [str(i) for i in range(1, 51)]
    line_svc.reply_flex.assert_awaited_once()
