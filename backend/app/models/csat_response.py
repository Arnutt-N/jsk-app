"""CSAT (Customer Satisfaction) response model."""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class CsatResponse(Base):
    """Stores customer satisfaction survey responses."""
    
    __tablename__ = "csat_responses"
    
    id = Column(Integer, primary_key=True)
    
    # Reference to chat session
    session_id = Column(
        Integer,
        ForeignKey("chat_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    
    # User who submitted
    line_user_id = Column(String, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    
    # Score (1-5)
    score = Column(Integer, nullable=False)  # 1 = Very Dissatisfied, 5 = Very Satisfied
    
    # Optional feedback text
    feedback = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    session = relationship("ChatSession", back_populates="csat_responses")
