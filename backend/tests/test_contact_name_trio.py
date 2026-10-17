"""Structured citizen names: prefix/firstname/lastname compose the stored string.

Both LIFF flows keep their single stored column (booking.contact_name,
debt.full_name) — the trio is composed at the schema boundary, so admin,
notifications, and existing rows never change. Pure pydantic, no DB.
"""
from datetime import date, time

import pytest
from pydantic import ValidationError

from app.schemas.booking import BookingCreate, BookingUpdateIn
from app.schemas.debt_mediation_liff import DebtMediationCreate


def _booking_kwargs(**overrides):
    base = {
        "service_type": "ปรึกษากฎหมาย",
        "booking_date": date(2026, 8, 19),
        "booking_time": time(9, 30),
    }
    base.update(overrides)
    return base


def _debt_kwargs(**overrides):
    base = {
        "submitter_type": "DEBTOR",
        "phone_number": "0812345678",
        "province": "สกลนคร",
        "debt_amount": "20000",
        "debt_type": "INFORMAL",
        "counterparty_name": "นายทุนตลาดทอน",
        "interest_rate": "ร้อยละ 20 ต่อเดือน",
        "issue_category": "ค้างชำระหนี้ ถูกข่มขู่/กลั่นแกล้ง ไม่สามารถจ่ายได้",
    }
    base.update(overrides)
    return base


def test_booking_trio_composes_contact_name():
    obj = BookingCreate(
        **_booking_kwargs(prefix="นาย", firstname="สมชาย", lastname="ใจดี")
    )
    assert obj.contact_name == "นาย สมชาย ใจดี"


def test_booking_trio_wins_over_legacy_string():
    obj = BookingCreate(
        **_booking_kwargs(
            contact_name="ชื่อเก่า",
            prefix="นาง",
            firstname="สมหญิง",
            lastname="ดีมาก",
        )
    )
    assert obj.contact_name == "นาง สมหญิง ดีมาก"


def test_booking_partial_trio_rejected():
    with pytest.raises(ValidationError, match="required together"):
        BookingCreate(**_booking_kwargs(firstname="สมชาย"))


def test_booking_empty_trio_keeps_optional_contact():
    obj = BookingCreate(**_booking_kwargs(phone_number="0812345678"))
    assert obj.contact_name is None


def test_booking_oversize_trio_rejected_not_truncated():
    with pytest.raises(ValidationError, match="exceeds 120"):
        BookingCreate(
            **_booking_kwargs(prefix="นาย", firstname="ก" * 100, lastname="ข" * 100)
        )


def test_booking_update_accepts_trio():
    obj = BookingUpdateIn(prefix="นาย", firstname="สมชาย", lastname="ใจดี")
    assert obj.contact_name == "นาย สมชาย ใจดี"


def test_debt_trio_composes_full_name():
    obj = DebtMediationCreate(
        **_debt_kwargs(prefix="นาย", firstname="สมชาย", lastname="ใจดี")
    )
    assert obj.full_name == "นาย สมชาย ใจดี"


def test_debt_partial_trio_rejected():
    with pytest.raises(ValidationError, match="required together"):
        DebtMediationCreate(**_debt_kwargs(firstname="สมชาย", lastname="ใจดี"))


def test_debt_legacy_full_name_only_still_passes():
    obj = DebtMediationCreate(**_debt_kwargs(full_name="สมชาย ใจดี"))
    assert obj.full_name == "สมชาย ใจดี"


def test_debt_oversize_trio_rejected_not_truncated():
    with pytest.raises(ValidationError, match="exceeds 200"):
        DebtMediationCreate(
            **_debt_kwargs(prefix="นาย", firstname="ก" * 100, lastname="ข" * 100)
        )
