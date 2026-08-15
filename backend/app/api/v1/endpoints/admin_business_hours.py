"""Admin endpoints for the weekly business-hours schedule.

The same table drives booking slots and the live-chat handoff gate, so reading
it is counter work (staff) while rewriting the week is an administrator action
and is audit-logged.
"""
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_staff
from app.core.audit import create_audit_log
from app.db.session import get_db
from app.models.business_hours import BusinessHours
from app.schemas.business_hours import BusinessHoursOut, BusinessHoursUpdate

logger = logging.getLogger(__name__)

router = APIRouter()

# Shown for weekdays that have no row yet. The times are placeholders — a
# missing row behaves as "closed" in both the slot engine and the handoff gate.
_PLACEHOLDER_TIMES = {"open_time": "08:00", "close_time": "17:00"}


@router.get("", response_model=BusinessHoursOut, summary="Read weekly business hours")
async def get_business_hours(
    db: AsyncSession = Depends(get_db),
    _staff=Depends(get_current_staff),
):
    result = await db.execute(select(BusinessHours))
    rows = {row.day_of_week: row for row in result.scalars().all()}
    days = []
    for weekday in range(7):
        row = rows.get(weekday)
        if row is None:
            days.append({"day_of_week": weekday, "is_open": False, **_PLACEHOLDER_TIMES})
        else:
            days.append(
                {
                    "day_of_week": weekday,
                    "is_open": row.is_open,
                    "open_time": row.open_time,
                    "close_time": row.close_time,
                }
            )
    return BusinessHoursOut(days=days)


@router.put("", response_model=BusinessHoursOut, summary="Update weekly business hours")
async def update_business_hours(
    payload: BusinessHoursUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    result = await db.execute(select(BusinessHours))
    rows = {row.day_of_week: row for row in result.scalars().all()}
    for day in payload.days:
        row = rows.get(day.day_of_week)
        if row is None:
            db.add(
                BusinessHours(
                    day_of_week=day.day_of_week,
                    is_open=day.is_open,
                    open_time=day.open_time,
                    close_time=day.close_time,
                )
            )
        else:
            row.is_open = day.is_open
            row.open_time = day.open_time
            row.close_time = day.close_time

    await create_audit_log(
        db=db,
        admin_id=admin.id,
        action="update_business_hours",
        resource_type="business_hours",
        resource_id=None,
        details={"days": [d.model_dump() for d in payload.days]},
    )
    await db.commit()
    return BusinessHoursOut(days=payload.days)
