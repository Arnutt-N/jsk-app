import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.user import UserRole


class AccessRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AccessRequest(Base):
    """A request for a staff login, approved by an admin before any account exists.

    No User row is created until approval, so a pending request can never sign in.
    Requestable roles are limited to AGENT/DIRECTOR/HEAD at the API layer --
    SUPER_ADMIN/ADMIN can never be requested through this form.
    """

    __tablename__ = "access_requests"

    id = Column(Integer, primary_key=True, index=True)
    display_name = Column(String, nullable=False)
    username = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    requested_role = Column(Enum(UserRole), default=UserRole.AGENT, nullable=False)
    reason = Column(Text, nullable=True)

    status = Column(Enum(AccessRequestStatus), default=AccessRequestStatus.PENDING, nullable=False)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_note = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
