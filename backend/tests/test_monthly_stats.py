"""Monthly dashboard stats: a bounded 12-month window with zero-filled gaps (F24)."""
from datetime import datetime
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints import admin_requests
from app.core.date_windows import BANGKOK


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _Db:
    def __init__(self, rows):
        self._rows = rows
        self.stmt = None

    async def execute(self, stmt):
        self.stmt = stmt
        return _Result(self._rows)


def _month_key(months_ago: int) -> str:
    now = datetime.now(BANGKOK)
    year, month = now.year, now.month - months_ago
    while month <= 0:
        month += 12
        year -= 1
    return f"{year:04d}-{month:02d}"


@pytest.mark.asyncio
async def test_monthly_stats_returns_12_chronological_months_with_gaps_filled():
    current = _month_key(0)
    two_ago = _month_key(2)
    db = _Db(
        [
            SimpleNamespace(month=current, count=5),
            SimpleNamespace(month=two_ago, count=2),
        ]
    )

    stats = await admin_requests.get_monthly_stats(db=db, current_admin=None)

    assert len(stats) == 12
    assert stats[-1].month == current
    assert stats[-1].count == 5
    assert stats[-3].month == two_ago
    assert stats[-3].count == 2
    # The month between them has no rows and must still appear, as zero.
    assert stats[-2].count == 0
    assert [s.month for s in stats] == sorted(s.month for s in stats)


@pytest.mark.asyncio
async def test_monthly_stats_bounds_the_grouped_input():
    db = _Db([])
    await admin_requests.get_monthly_stats(db=db, current_admin=None)

    sql = str(db.stmt)
    assert "created_at >=" in sql
    assert "created_at <" in sql
