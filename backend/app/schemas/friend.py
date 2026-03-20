from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class FriendResponse(BaseModel):
    line_user_id: str
    display_name: Optional[str] = None
    picture_url: Optional[str] = None
    friend_status: Optional[str] = None
    friend_since: Optional[datetime] = None
    last_message_at: Optional[datetime] = None
    chat_mode: str
    refollow_count: int = 0

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


class FriendListResponse(BaseModel):
    friends: List[Dict[str, Any]]
    total: int
