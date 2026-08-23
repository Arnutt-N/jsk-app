from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, Any
from enum import Enum

class MessageDirection(str, Enum):
    INCOMING = "INCOMING"
    OUTGOING = "OUTGOING"

class SenderRole(str, Enum):
    USER = "USER"
    BOT = "BOT"
    ADMIN = "ADMIN"

class MessageResponse(BaseModel):
    id: int
    line_user_id: Optional[str] = None
    direction: MessageDirection
    message_type: str
    content: Optional[str] = None
    payload: Optional[Any] = None
    created_at: datetime
    sender_role: Optional[SenderRole] = None
    operator_name: Optional[str] = None
    temp_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


def message_payload_dict(
    message,
    line_user_id: Optional[str] = None,
    temp_id: Optional[str] = None,
) -> dict:
    """Canonical JSON-safe message payload shared by HTTP + WS consumers.

    Single source of truth replacing the hand-rolled dicts that previously
    lived in admin_live_chat / ws_session handlers / messaging service.
    `mode="json"` converts datetime -> ISO-8601 and enums -> values, matching
    the legacy `.isoformat()` / `.value` behaviour exactly.
    """
    data = MessageResponse.model_validate(message)
    update = {"temp_id": temp_id}
    if line_user_id is not None:
        update["line_user_id"] = line_user_id
    data = data.model_copy(update=update)
    return data.model_dump(mode="json")


class MessagePage(BaseModel):
    messages: list[MessageResponse]
    has_more: bool
