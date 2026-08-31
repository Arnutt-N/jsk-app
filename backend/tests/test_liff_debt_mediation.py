"""LIFF debt-mediation (ขอแก้หนี้): schema validation + endpoint identity.

Schema tests are pure pydantic (no DB). Endpoint tests call the async route
handler directly with patched LIFF token verification and a mock session —
the same pattern as test_liff_bookings_endpoints.py — so the
security-relevant behaviour is testable without Postgres/Redis.
"""
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints import liff
from app.models.service_request import RequestStatus
from app.schemas.debt_mediation_liff import (
    DebtMediationCreate,
    DebtMediationResponse,
    SubmitterType,
)


def _debtor_payload(**overrides):
    base = {
        "submitter_type": "DEBTOR",
        "full_name": "สมชาย ใจดี",
        "phone_number": "0812345678",
        "province": "สกลนคร",
        "sub_district": "ธาตุเชิงชุม",
        "debt_amount": "20000",
        "debt_type": "INFORMAL",
        "counterparty_name": "นายทุนตลาดทอน",
        "interest_rate": "ร้อยละ 20 ต่อเดือน",
        "issue_category": "ค้างชำระหนี้ ถูกข่มขู่/กลั่นแกล้ง ไม่สามารถจ่ายได้",
    }
    base.update(overrides)
    return base


def _creditor_payload(**overrides):
    base = {
        "submitter_type": "CREDITOR",
        "full_name": "สายทอง ทรัพย์ดี",
        "phone_number": "0898765432",
        "province": "สกลนคร",
        "debt_amount": "50000",
        "debt_type": "FORMAL",
        "counterparty_name": "สมหญิง ก่อหนี้",
        "issue_category": "ลูกหนี้ปฏิเสธไม่ยอมชำระหนี้",
    }
    base.update(overrides)
    return base


# --- schema validation ---


def test_debtor_payload_passes():
    obj = DebtMediationCreate(**_debtor_payload())
    assert obj.submitter_type == SubmitterType.DEBTOR
    assert obj.debt_amount == Decimal("20000")


def test_creditor_payload_without_interest_rate_passes():
    obj = DebtMediationCreate(**_creditor_payload())
    assert obj.submitter_type == SubmitterType.CREDITOR
    assert obj.interest_rate is None


def test_amount_overflow_rejected():
    with pytest.raises(ValidationError, match="decimal"):
        DebtMediationCreate(**_debtor_payload(debt_amount="1e20"))


def test_amount_inf_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(debt_amount="inf"))


def test_amount_subcent_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(debt_amount="0.001"))


def test_amount_numeric_boundary_passes():
    obj = DebtMediationCreate(**_debtor_payload(debt_amount="999999999999.99"))
    assert obj.debt_amount == Decimal("999999999999.99")


def test_amount_fourteen_integer_digits_rejected():
    with pytest.raises(ValidationError, match="decimal"):
        DebtMediationCreate(**_debtor_payload(debt_amount="10000000000000"))


def test_phone_thai_digits_rejected():
    with pytest.raises(ValidationError, match="เบอร์โทร"):
        DebtMediationCreate(**_debtor_payload(phone_number="๐๘๑๒๓๔๕๖๗๘"))


def test_debtor_issue_from_creditor_list_rejected():
    with pytest.raises(ValidationError, match="issue_category"):
        DebtMediationCreate(**_debtor_payload(issue_category="ลูกหนี้หลบหนีหนี้"))


def test_creditor_issue_from_debtor_list_rejected():
    with pytest.raises(ValidationError, match="issue_category"):
        DebtMediationCreate(**_creditor_payload(issue_category="รายได้ไม่เพียงพอจะชำระหนี้"))


def test_overlong_line_user_id_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(line_user_id="U" * 65))


def test_creditor_interest_rate_cleared():
    obj = DebtMediationCreate(**_creditor_payload(interest_rate="ร้อยละ 5"))
    assert obj.interest_rate is None


def test_overlong_issue_other_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(issue_category="อื่น ๆ", issue_other="x" * 501))


def test_whitespace_full_name_rejected():
    with pytest.raises(ValidationError, match="full_name"):
        DebtMediationCreate(**_debtor_payload(full_name="   "))


def test_debtor_without_interest_rate_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(interest_rate=None))


def test_debtor_with_blank_interest_rate_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(interest_rate="   "))


def test_creditor_with_whitespace_interest_rate_normalized_to_none():
    obj = DebtMediationCreate(**_creditor_payload(interest_rate="  "))
    assert obj.interest_rate is None


def test_issue_other_without_detail_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(issue_category="อื่น ๆ"))


def test_issue_other_with_detail_passes():
    obj = DebtMediationCreate(
        **_debtor_payload(issue_category="อื่น ๆ", issue_other="ถูกยึดรถ")
    )
    assert obj.issue_other == "ถูกยึดรถ"


def test_issue_other_field_without_other_label_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(
            **_debtor_payload(issue_other="ไม่ควรมีค่านี้")
        )


def test_phone_too_short_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(phone_number="09123456"))


def test_phone_letters_rejected():
    """Length-only checks used to accept 'abcdefghij' (10 chars, no digits)."""
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(phone_number="abcdefghij"))


def test_phone_with_dashes_normalized():
    obj = DebtMediationCreate(**_debtor_payload(phone_number="081-234-5678"))
    assert obj.phone_number == "0812345678"


def test_phone_plus_prefix_accepted():
    obj = DebtMediationCreate(**_debtor_payload(phone_number="+66812345678"))
    assert obj.phone_number == "+66812345678"


def test_zero_or_negative_debt_amount_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(debt_amount="0"))
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(debt_amount="-5"))


def test_invalid_submitter_type_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(**_debtor_payload(submitter_type="LAWYER"))


def test_missing_required_fields_rejected():
    with pytest.raises(ValidationError):
        DebtMediationCreate(submitter_type="DEBTOR")


# --- endpoint: identity + persistence mapping ---


def _mock_db():
    db = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", 77))
    return db


def test_response_schema_has_no_line_user_id():
    assert "line_user_id" not in DebtMediationResponse.model_json_schema()["properties"]


@pytest.mark.asyncio
async def test_invalid_token_does_not_write():
    db = _mock_db()
    with patch.object(liff, "verify_liff_token", new=AsyncMock(side_effect=HTTPException(status_code=401, detail="Invalid LIFF ID token"))):
        with pytest.raises(HTTPException) as exc:
            await liff.create_debt_mediation_request(
                DebtMediationCreate(**_debtor_payload()),
                db=db,
                x_liff_id_token="tok",  # non-null so verify runs (liff.py:270)
            )
    assert exc.value.status_code == 401
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_missing_token_rejected_in_strict_mode():
    db = _mock_db()
    with patch.object(liff.settings, "LIFF_STRICT_MODE", True):
        with pytest.raises(HTTPException) as exc:
            await liff.create_debt_mediation_request(
                DebtMediationCreate(**_debtor_payload()), db=db, x_liff_id_token=None
            )
    assert exc.value.status_code == 401
    assert exc.value.detail == "LIFF ID token required"
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_unverified_submission_allowed_in_transition_mode():
    db = _mock_db()
    with patch.object(liff.settings, "LIFF_STRICT_MODE", False), patch.object(
        liff, "resolve_by_line_id", new=AsyncMock(return_value=None)
    ), patch.object(
        liff.friend_service, "get_or_create_user", new=AsyncMock(return_value=None)
    ):
        await liff.create_debt_mediation_request(
            DebtMediationCreate(**_debtor_payload(line_user_id="U-body")),
            db=db,
            x_liff_id_token=None,
        )
    added = db.add.call_args[0][0]
    assert added.user_id is None
    assert added.details == {"source": "LIFF-unverified"}


@pytest.mark.asyncio
async def test_verified_token_drives_identity_and_mapping():
    db = _mock_db()
    user = MagicMock(id=5)
    with patch.object(
        liff, "verify_liff_token", new=AsyncMock(return_value="U-verified")
    ) as mock_verify, patch.object(
        liff, "resolve_by_line_id", new=AsyncMock(return_value=user)
    ) as mock_resolve:
        resp = await liff.create_debt_mediation_request(
            DebtMediationCreate(
                **_debtor_payload(line_user_id="U-mismatched-body-id")
            ),
            db=db,
            x_liff_id_token="tok",
        )

    mock_verify.assert_awaited_once_with("tok")
    # The body's line_user_id must NOT be trusted over the verified token sub.
    mock_resolve.assert_awaited_once_with(db, "U-verified")

    added = db.add.call_args[0][0]
    assert added.user_id == 5
    assert added.full_name == "สมชาย ใจดี"
    assert added.phone_number == "0812345678"
    assert added.province == "สกลนคร"
    assert added.debt_amount == Decimal("20000")
    assert added.interest_rate == "ร้อยละ 20 ต่อเดือน"
    assert added.status == RequestStatus.PENDING
    assert added.details == {"source": "LIFF"}
    assert added.submitter_type.value == "DEBTOR"
    assert added.debt_type.value == "INFORMAL"

    assert resp.id == 77
    assert resp.status == "PENDING"


@pytest.mark.asyncio
async def test_user_created_on_identity_miss():
    db = _mock_db()
    created = MagicMock(id=9)
    with patch.object(
        liff, "verify_liff_token", new=AsyncMock(return_value="U-new")
    ), patch.object(
        liff, "resolve_by_line_id", new=AsyncMock(return_value=None)
    ), patch.object(
        liff.friend_service,
        "get_or_create_user",
        new=AsyncMock(return_value=created),
    ) as mock_create:
        await liff.create_debt_mediation_request(
            DebtMediationCreate(**_creditor_payload()), db=db, x_liff_id_token="tok"
        )

    mock_create.assert_awaited_once_with("U-new", db, commit=False)
    assert db.add.call_args[0][0].user_id == 9


@pytest.mark.asyncio
async def test_creditor_path_stores_no_interest_rate():
    db = _mock_db()
    with patch.object(
        liff, "verify_liff_token", new=AsyncMock(return_value="U-cred")
    ), patch.object(liff, "resolve_by_line_id", new=AsyncMock(return_value=None)), patch.object(
        liff.friend_service, "get_or_create_user", new=AsyncMock(return_value=None)
    ):
        resp = await liff.create_debt_mediation_request(
            DebtMediationCreate(**_creditor_payload()), db=db, x_liff_id_token="tok"
        )

    added = db.add.call_args[0][0]
    assert added.interest_rate is None
    assert resp.submitter_type.value == "CREDITOR"


# --- migration b8c9d0e1f2a3 contracts ---


def _load_dm_migration():
    import importlib.util
    from pathlib import Path

    _DM_MIGRATION = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "b8c9d0e1f2a3_add_debt_mediation_requests.py"
    )
    spec = importlib.util.spec_from_file_location("_dm_migration", _DM_MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_debt_mediation_revision_chain():
    dm_migration = _load_dm_migration()
    assert dm_migration.revision == "b8c9d0e1f2a3"
    assert dm_migration.down_revision == "s0t1u2v3w4x5"


def test_debt_mediation_migration_sql_contracts():
    from pathlib import Path

    src = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "b8c9d0e1f2a3_add_debt_mediation_requests.py"
    ).read_text(encoding="utf-8")
    assert 'ondelete="SET NULL"' in src or "ondelete='SET NULL'" in src
    assert "'{}'::jsonb" in src
    # Per-column pins so a length/nullable landing on the wrong column fails.
    assert 'sa.Column("full_name", sa.String(200), nullable=False)' in src
    assert 'sa.Column("phone_number", sa.String(20), nullable=False)' in src
    assert 'sa.Column("province", sa.String(100), nullable=False)' in src
    assert 'sa.Column("sub_district", sa.String(100), nullable=True)' in src
    assert 'sa.Column("counterparty_name", sa.String(200), nullable=False)' in src
    assert 'sa.Column("interest_rate", sa.String(80), nullable=True)' in src
    assert 'sa.Column("issue_category", sa.String(200), nullable=False)' in src
    assert 'sa.Column("issue_other", sa.String(500), nullable=True)' in src
    assert (
        'sa.Column("details", postgresql.JSONB(), nullable=False, '
        "server_default=sa.text(\"'{}'::jsonb\"))"
    ) in src
