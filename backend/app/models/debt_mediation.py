from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
import enum

from app.db.base import Base
from app.models.service_request import RequestStatus


class DebtMediationParty(str, enum.Enum):
    """Who files the debt-mediation request.

    DEBTOR   -> ลูกหนี้ (files about their creditor)
    CREDITOR -> เจ้าหนี้ (files about their debtor)
    """

    DEBTOR = "DEBTOR"
    CREDITOR = "CREDITOR"


class DebtMediationDebtType(str, enum.Enum):
    """ประเภทหนี้: หนี้นอกระบบ (INFORMAL) / หนี้ในระบบ (FORMAL)."""

    INFORMAL = "INFORMAL"
    FORMAL = "FORMAL"


class DebtMediationRequest(Base):
    __tablename__ = "debt_mediation_requests"

    id = Column(Integer, primary_key=True, index=True)

    # LINE identity (via user_id FK — same pattern as ServiceRequest;
    # SET NULL so deleting a user does not cascade-delete citizen requests)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )

    # สถานะผู้ยื่นคำขอ: ลูกหนี้ / เจ้าหนี้
    submitter_type = Column(
        Enum(DebtMediationParty, name="debtparty"), nullable=False, index=True
    )

    # ข้อมูลผู้ยื่นคำขอ
    full_name = Column(String(200), nullable=False)
    phone_number = Column(String(20), nullable=False)
    province = Column(String(100), nullable=False)
    sub_district = Column(String(100), nullable=True)

    # ข้อมูลหนี้
    debt_amount = Column(Numeric(14, 2), nullable=False)
    debt_type = Column(Enum(DebtMediationDebtType, name="debttype"), nullable=False)

    # คู่กรณี: เจ้าหนี้ (เมื่อผู้ยื่นเป็นลูกหนี้) หรือ ลูกหนี้ (เมื่อผู้ยื่นเป็นเจ้าหนี้)
    counterparty_name = Column(String(200), nullable=False)
    # อัตราดอกเบี้ย — required only when the submitter is the debtor
    # (enforced at the schema level); free text, e.g. "ร้อยละ 5 ต่อเดือน"
    interest_rate = Column(String(80), nullable=True)

    # ประเด็นความเดือดร้อน (Thai label as selected; "อื่น ๆ" when Other)
    issue_category = Column(String(200), nullable=False)
    issue_other = Column(String(500), nullable=True)

    # Flexible extra data (e.g. {"source": "LIFF"})
    details = Column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))

    # Workflow status — reuses the existing requeststatus pg type so a future
    # admin pipeline can follow the ServiceRequest lifecycle.
    status = Column(
        Enum(RequestStatus),
        default=RequestStatus.PENDING,
        server_default="PENDING",
        nullable=False,
        index=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
