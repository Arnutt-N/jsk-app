from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base

class RequestStatus(str, enum.Enum):
    """Request lifecycle states (ordered by workflow progression).

    PENDING            -> Just submitted. Display label depends on assignment:
                          - assigned_agent_id IS NULL -> "รอมอบหมาย" (awaiting assignment)
                          - assigned_agent_id IS NOT NULL -> "รอรับเรื่อง" (assigned, awaiting acknowledgement)
    ACKNOWLEDGED       -> Assignee acknowledged the assignment. "รอดำเนินการ" (queued).
    IN_PROGRESS        -> Assignee actively working. "กำลังดำเนินการ".
    AWAITING_APPROVAL  -> Work done, awaiting supervisor approval. "รออนุมัติ".
    COMPLETED          -> Approved and closed. "เสร็จสิ้น".
    REJECTED           -> Declined by supervisor. "ปฏิเสธ".
    """

    PENDING = "PENDING"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    IN_PROGRESS = "IN_PROGRESS"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"

class RequestPriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id = Column(Integer, primary_key=True, index=True)

    # แหล่งที่มาของคำร้อง (LIFF, ADMIN, PHONE, PAPER, WALK_IN)
    source = Column(String(20), default="LIFF", nullable=False, index=True)

    # Requester
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    requester = relationship("User", back_populates="requests", foreign_keys=[requester_id])
    
    # LINE Integration
    line_user_id = Column(String, index=True, nullable=True)
    
    # Detailed form fields matching User Request
    requester_name = Column(String, nullable=True) # Keep for backward compatibility or full name
    phone_number = Column(String, nullable=True)
    email = Column(String, nullable=True)
    
    # Enhanced Fields
    agency = Column(String, nullable=True)        # หน่วยงาน
    province = Column(String, nullable=True)      # จังหวัด
    district = Column(String, nullable=True)      # อำเภอ/สภ.
    sub_district = Column(String, nullable=True)  # ตำบล
    prefix = Column(String, nullable=True)        # คำนำหน้า
    firstname = Column(String, nullable=True)     # ชื่อ
    lastname = Column(String, nullable=True)      # สกุล
    
    topic_category = Column(String, nullable=True)    # เรื่องขอรับความช่วยเหลือ
    topic_subcategory = Column(String, nullable=True) # รายละเอียดเรื่อง
    
    # Files (store as JSON list of URLs e.g. [{"name": "...", "url": "..."}])
    attachments = Column(JSONB, nullable=True)
    
    description = Column(Text, nullable=True)
    
    # Legacy / Mapped Fields (Optional, kept for compatibility if needed)
    category = Column(String, index=True, nullable=True)    
    subcategory = Column(String, nullable=True)
    location = Column(JSONB, default={})
    
    # Flexible extra data
    details = Column(JSONB, default={})
    
    status = Column(Enum(RequestStatus), default=RequestStatus.PENDING, index=True)
    priority = Column(Enum(RequestPriority), default=RequestPriority.MEDIUM, index=True)
    
    # Dates for tracking
    due_date = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Assignment
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_agent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    assignor = relationship("User", foreign_keys=[assigned_by_id])
    assignee = relationship("User", back_populates="assigned_requests", foreign_keys=[assigned_agent_id])


    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
