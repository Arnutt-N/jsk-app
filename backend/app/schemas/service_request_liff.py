from pydantic import BaseModel, ConfigDict, model_validator
from typing import Optional
from datetime import datetime


def _blank(value: Optional[str]) -> bool:
    """True when a string field is missing or only whitespace."""
    return value is None or not value.strip()

class ServiceRequestCreate(BaseModel):
    # Personal Info
    prefix: Optional[str] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    
    # Location
    agency: Optional[str] = None
    province: Optional[str] = None
    district: Optional[str] = None
    sub_district: Optional[str] = None
    
    # Topic
    topic_category: Optional[str] = None
    topic_subcategory: Optional[str] = None
    description: Optional[str] = None
    
    # Attachments (List of object with id/url)
    attachments: Optional[list] = []
    
    # User Context
    line_user_id: Optional[str] = None
    
    # Legacy mapping support (optional)
    name: Optional[str] = None # Will be constructed from first+last if needed
    service_type: Optional[str] = None # Will be mapped to topic_category

    @model_validator(mode="after")
    def _require_content(self) -> "ServiceRequestCreate":
        """Reject junk submissions (e.g. an empty body).

        A bare `POST {}` used to write a row with requester_name='None None'
        and every content field NULL. A real request must at least say what it
        is about, so we require some content — a topic (topic_category or the
        legacy service_type) or a description.

        The requester name is deliberately NOT required: drug-reporting tips
        ("แจ้งเบาะแสยาเสพติด") are legitimately submitted anonymously, so a
        submission with content but no name is valid.
        """
        has_content = (
            not _blank(self.topic_category)
            or not _blank(self.service_type)
            or not _blank(self.description)
        )
        if not has_content:
            raise ValueError(
                "A service request requires a topic or a description."
            )
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "prefix": "นาย",
                "firstname": "สมชาย",
                "lastname": "ใจดี",
                "phone": "0812345678",
                "email": "somchai@example.com",
                "agency": "ยุติธรรมจังหวัดเชียงใหม่",
                "province": "เชียงใหม่",
                "district": "เมืองเชียงใหม่",
                "sub_district": "สุเทพ",
                "topic_category": "ขอรับคำปรึกษากฎหมาย",
                "topic_subcategory": "คดีแพ่ง",
                "description": "ต้องการปรึกษาเรื่องการกู้ยืมเงินและการทำสัญญา",
                "attachments": [],
                "line_user_id": "U1234567890abcdef1234567890abcdef"
            }
        }
    )

class ServiceRequestResponse(BaseModel):
    id: int
    source: Optional[str] = None
    requester_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    line_user_id: Optional[str] = None
    agency: Optional[str] = None
    province: Optional[str] = None
    district: Optional[str] = None
    sub_district: Optional[str] = None
    prefix: Optional[str] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    topic_category: Optional[str] = None
    topic_subcategory: Optional[str] = None
    description: Optional[str] = None
    attachments: Optional[list] = None
    category: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    details: Optional[dict] = None
    assigned_agent_id: Optional[int] = None
    assigned_by_id: Optional[int] = None
    assignee_name: Optional[str] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class RequestCommentBase(BaseModel):
    content: str

class RequestCommentCreate(RequestCommentBase):
    pass

class RequestCommentResponse(RequestCommentBase):
    id: int
    request_id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    display_name: Optional[str] = None # For frontend display

    model_config = ConfigDict(from_attributes=True)

