from datetime import datetime
from typing import List
from uuid import UUID

from pydantic import BaseModel


class MediaFileSummary(BaseModel):
    id: UUID
    file_name: str
    content_type: str
    size: int
    created_at: datetime


class MediaFileListResponse(BaseModel):
    items: List[MediaFileSummary]
    total: int


class MediaUploadResponse(BaseModel):
    id: UUID
    filename: str


class ResizeTicketResponse(BaseModel):
    ticket: str
    expires_in: int
