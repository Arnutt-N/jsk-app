from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ISSUE_OTHER_LABEL = "อื่น ๆ"

_PHONE_PATTERN = re.compile(r"^\+?\d{9,15}$")


class SubmitterType(str, Enum):
    """สถานะผู้ยื่นคำขอ."""

    DEBTOR = "DEBTOR"      # ลูกหนี้
    CREDITOR = "CREDITOR"  # เจ้าหนี้


class DebtType(str, Enum):
    """ประเภทหนี้."""

    INFORMAL = "INFORMAL"  # หนี้นอกระบบ
    FORMAL = "FORMAL"      # หนี้ในระบบ


def _blank(value: Optional[str]) -> bool:
    """True when a string field is missing or only whitespace."""
    return value is None or not value.strip()


class DebtMediationCreate(BaseModel):
    submitter_type: SubmitterType
    full_name: str = Field(min_length=1, max_length=200)
    # Raw input may include dashes/spaces; the field validator strips them and
    # then enforces 9–15 digits (optional leading +). Keep the raw cap loose.
    phone_number: str = Field(min_length=1, max_length=20)
    province: str = Field(min_length=1, max_length=100)
    sub_district: Optional[str] = None

    debt_amount: Decimal = Field(gt=0)
    debt_type: DebtType

    # อีกฝ่ายของข้อพิพาท (ชื่อเจ้าหนี้ เมื่อผู้ยื่นเป็นลูกหนี้ หรือกลับกัน)
    counterparty_name: str = Field(min_length=1, max_length=200)
    interest_rate: Optional[str] = None

    issue_category: str = Field(min_length=1)
    issue_other: Optional[str] = None

    # User context
    line_user_id: Optional[str] = None

    @field_validator("phone_number")
    @classmethod
    def _normalize_phone(cls, value: str) -> str:
        cleaned = value.strip().replace("-", "").replace(" ", "")
        if not _PHONE_PATTERN.fullmatch(cleaned):
            raise ValueError("เบอร์โทรต้องเป็นตัวเลข 9–15 หลัก")
        return cleaned

    @model_validator(mode="after")
    def _require_path_fields(self) -> "DebtMediationCreate":
        """Path-specific requirements mirroring the source Google Form.

        - A debtor must state the interest rate they are charged; a creditor
          has no such field.
        - Selecting "อื่น ๆ" (Other) as the issue requires the free-text
          detail; otherwise issue_other must stay empty.
        - Required text fields are stripped: a whitespace-only value is
          rejected instead of being stored as junk (and stripped values never
          become empty strings in NOT NULL columns).
        """
        # Strip user-typed text so padded junk doesn't survive, then reject
        # values that were whitespace-only.
        for field in (
            "full_name",
            "phone_number",
            "province",
            "counterparty_name",
            "issue_category",
            "sub_district",
            "issue_other",
        ):
            value = getattr(self, field)
            if value is not None:
                stripped = value.strip()
                if field in ("sub_district", "issue_other") and not stripped:
                    setattr(self, field, None)
                else:
                    setattr(self, field, stripped or value)

        # Optional sub_district / issue_other that are whitespace-only become
        # NULL; required fields must not be blank after stripping.
        for field in ("full_name", "phone_number", "province", "issue_category", "counterparty_name"):
            if _blank(getattr(self, field)):
                raise ValueError(f"{field} must not be blank.")

        if self.submitter_type == SubmitterType.DEBTOR and _blank(self.interest_rate):
            raise ValueError(
                "interest_rate is required when the submitter is a debtor."
            )
        if self.interest_rate is not None and _blank(self.interest_rate):
            # Whitespace-only -> None so a creditor cannot store junk.
            self.interest_rate = None
        elif self.interest_rate is not None:
            self.interest_rate = self.interest_rate.strip()

        if self.issue_category == ISSUE_OTHER_LABEL and _blank(self.issue_other):
            raise ValueError(
                "issue_other is required when issue_category is อื่น ๆ."
            )
        if self.issue_category != ISSUE_OTHER_LABEL and not _blank(self.issue_other):
            raise ValueError(
                "issue_other must be empty unless issue_category is อื่น ๆ."
            )
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
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
                "issue_other": None,
                "line_user_id": "U1234567890abcdef1234567890abcdef",
            }
        }
    )


class DebtMediationResponse(BaseModel):
    id: int
    submitter_type: SubmitterType
    full_name: str
    phone_number: str
    province: str
    sub_district: Optional[str] = None
    debt_amount: Optional[Decimal] = None
    debt_type: DebtType
    counterparty_name: str
    interest_rate: Optional[str] = None
    issue_category: str
    issue_other: Optional[str] = None
    line_user_id: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
