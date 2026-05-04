from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base

class UserRole(str, enum.Enum):
    """Application-wide user roles.

    Hierarchy (ordered by privilege, highest first):
      SUPER_ADMIN -> Owner-level: all permissions, can edit permission settings.
      ADMIN       -> Office-level: all operational permissions, can edit permission settings.
      DIRECTOR    -> Director (ผู้อำนวยการ): supervisor of HEAD/AGENT staff.
      HEAD        -> Head of section (หัวหน้าฝ่าย): supervises AGENT staff.
      AGENT       -> Front-line officer (เจ้าหน้าที่): processes assigned work.
      USER        -> End user (LIFF / public): submits requests only.

    DIRECTOR and HEAD share the same default permissions as ADMIN for
    request workflow actions (assign, self-assign) but cannot edit
    permission settings (only SUPER_ADMIN/ADMIN can).
    """

    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    DIRECTOR = "DIRECTOR"
    HEAD = "HEAD"
    AGENT = "AGENT"
    USER = "USER"

class ChatMode(str, enum.Enum):
    BOT = "BOT"
    HUMAN = "HUMAN"

class FriendStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    BLOCKED = "BLOCKED"
    DELETED = "DELETED"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    line_user_id = Column(String, unique=True, index=True, nullable=True) # For LINE users
    username = Column(String, unique=True, index=True, nullable=True)     # For Admins
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=True)
    
    display_name = Column(String, nullable=True)
    picture_url = Column(String, nullable=True)
    
    role = Column(Enum(UserRole), default=UserRole.USER)
    is_active = Column(Boolean, default=True)
    
    # Organization (For Admins/Agents)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    organization = relationship("Organization", back_populates="users")

    # Chat State
    chat_mode = Column(Enum(ChatMode), default=ChatMode.BOT)

    # Friend Status (For LINE Users) -- FriendStatus enum defined above; Column kept as String to avoid migration
    friend_status = Column(String, nullable=True, default="ACTIVE")
    friend_since = Column(DateTime(timezone=True), nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    profile_updated_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    requests = relationship("ServiceRequest", back_populates="requester", foreign_keys="ServiceRequest.requester_id")
    assigned_requests = relationship("ServiceRequest", back_populates="assignee", foreign_keys="ServiceRequest.assigned_agent_id")
    bookings = relationship("Booking", back_populates="user")
    chat_sessions = relationship("ChatSession", back_populates="operator", foreign_keys="ChatSession.operator_id")
    audit_logs = relationship("AuditLog", back_populates="admin")
    tags = relationship("Tag", secondary="user_tags", back_populates="users", overlaps="tag_links,user_links,user,tag")
    tag_links = relationship(
        "UserTag",
        back_populates="user",
        cascade="all, delete-orphan",
        overlaps="tags,users,tag",
    )
