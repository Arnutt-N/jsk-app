from sqlalchemy import Column, Integer, Date, ForeignKey, UniqueConstraint
from app.db.base import Base

class ChatAnalytics(Base):
    __tablename__ = "chat_analytics"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, index=True)
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    total_sessions = Column(Integer, default=0)
    avg_response_time_seconds = Column(Integer, nullable=True)
    avg_resolution_time_seconds = Column(Integer, nullable=True)
    total_messages_sent = Column(Integer, default=0)

    __table_args__ = (UniqueConstraint('date', 'operator_id', name='uq_chat_analytics_date_operator'),)
