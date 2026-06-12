"""Audit Log model for tracking admin actions."""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class AuditLog(Base):
    """Audit log for tracking admin actions."""
    
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(50), index=True)  # e.g., claim_session, close_session, send_message
    resource_type = Column(String(50), index=True)  # e.g., chat_session, message, user
    resource_id = Column(String(100), index=True)  # filtered per-resource by request-detail timeline
    details = Column(JSONB, default={})  # Additional context
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationship
    admin = relationship("User", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog(id={self.id}, action={self.action}, admin_id={self.admin_id})>"
