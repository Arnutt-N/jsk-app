"""
Response Parser Service
Parses auto-reply response text and resolves $object_id references to actual LINE message objects.

Example:
  Input: "ท่านสามารถขอรับค่าตอบแทน... $flex_traffic"
  Output: [TextMessage("ท่านสามารถขอรับค่าตอบแทน..."), FlexMessage(contents=...)]
"""
import re
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from linebot.v3.messaging import (
    TextMessage,
    FlexMessage,
    FlexContainer,
    ImageMessage,
    StickerMessage,
    LocationMessage,
    VideoMessage,
    AudioMessage,
    ImagemapMessage,
    ImagemapBaseSize,
    TemplateMessage,
    QuickReply,
)
from app.models.reply_object import ReplyObject, ObjectType
import logging

logger = logging.getLogger(__name__)

# Pattern to find $object_id references (e.g., $flex_1, $image_contact)
OBJECT_REF_PATTERN = re.compile(r'\$([a-zA-Z0-9_]+)')


async def parse_response(response_text: str, db: AsyncSession) -> List[Any]:
    """
    Parse response text and return a list of LINE message objects.
    
    Supports:
    - Plain text: "สวัสดีค่ะ" → [TextMessage]
    - Object reference: "$flex_1" → [FlexMessage]
    - Mixed: "สวัสดีค่ะ $flex_1 $image_1" → [TextMessage, FlexMessage, ImageMessage]
    
    Args:
        response_text: The response string from auto_replies table
        db: Database session
    
    Returns:
        List of LINE message objects (max 5 per LINE API limit)
    """
    if not response_text or not response_text.strip():
        return []
    
    messages = []
    
    # Find all object references
    refs = OBJECT_REF_PATTERN.findall(response_text)
    
    if not refs:
        # No object references, just return as text message
        messages.append(TextMessage(text=response_text.strip()))
        return messages
    
    # Extract text portion (remove all $xxx references)
    text_content = OBJECT_REF_PATTERN.sub('', response_text).strip()
    
    # Add text message if there's remaining text
    if text_content:
        messages.append(TextMessage(text=text_content))
    
    # Resolve object references
    for object_id in refs:
        message = await resolve_object(object_id, db)
        if message:
            messages.append(message)
    
    # LINE API limit: max 5 messages per reply
    return messages[:5]


async def resolve_object(object_id: str, db: AsyncSession) -> Optional[Any]:
    """
    Resolve a single object_id to a LINE message object.
    
    Args:
        object_id: The object identifier (without $)
        db: Database session
    
    Returns:
        LINE message object or None if not found
    """
    try:
        result = await db.execute(
            select(ReplyObject).filter(
                ReplyObject.object_id == object_id,
                ReplyObject.is_active == True
            )
        )
        obj = result.scalars().first()
        
        if not obj:
            logger.warning(f"ReplyObject not found: ${object_id}")
            return None
        
        return build_message_from_object(obj)
        
    except Exception as e:
        logger.error(f"Error resolving object ${object_id}: {e}")
        return None


def build_message_from_object(obj: ReplyObject) -> Optional[Any]:
    """
    Build a LINE message object from a ReplyObject.
    
    Args:
        obj: ReplyObject instance
    
    Returns:
        LINE message object
    """
    try:
        payload = obj.payload
        message = None

        if obj.object_type == ObjectType.FLEX:
            # Flex Message
            container = FlexContainer.from_dict(payload)
            message = FlexMessage(
                alt_text=obj.alt_text or f"Message: {obj.name}",
                contents=container
            )

        elif obj.object_type == ObjectType.IMAGE:
            # Image Message
            message = ImageMessage(
                original_content_url=payload.get("url"),
                preview_image_url=payload.get("preview_url") or payload.get("url")
            )

        elif obj.object_type == ObjectType.STICKER:
            # Sticker Message
            message = StickerMessage(
                package_id=str(payload.get("package_id")),
                sticker_id=str(payload.get("sticker_id"))
            )

        elif obj.object_type == ObjectType.LOCATION:
            # Location Message
            message = LocationMessage(
                title=payload.get("title", "Location"),
                address=payload.get("address", ""),
                latitude=float(payload.get("latitude", 0)),
                longitude=float(payload.get("longitude", 0))
            )

        elif obj.object_type in (ObjectType.TEXT, ObjectType.TEXT_V2):
            # Text / Text v2 — both render as a TextMessage; text_v2's emoji /
            # substitution features are handled by LINE from the same `text`.
            message = TextMessage(text=payload.get("text", ""))

        elif obj.object_type == ObjectType.TEMPLATE:
            # Template Message (buttons / confirm / carousel / image_carousel).
            # Payload is already LINE-API shaped (built by the editor), so let the
            # SDK resolve the template + nested action oneOf via from_dict.
            template_dict = payload.get("template") or {}
            message = TemplateMessage.from_dict({
                "type": "template",
                "altText": obj.alt_text or payload.get("altText") or f"Template: {obj.name}",
                "template": template_dict,
            })

        elif obj.object_type == ObjectType.VIDEO:
            # Video Message
            message = VideoMessage(
                original_content_url=payload.get("original_content_url") or payload.get("url"),
                preview_image_url=payload.get("preview_image_url") or payload.get("preview_url") or payload.get("url"),
            )

        elif obj.object_type == ObjectType.AUDIO:
            # Audio Message
            message = AudioMessage(
                original_content_url=payload.get("original_content_url") or payload.get("url"),
                duration=int(payload.get("duration", 0)),
            )

        elif obj.object_type == ObjectType.IMAGEMAP:
            # ImageMap Message
            base_size = ImagemapBaseSize(
                width=int(payload.get("base_size", {}).get("width", 1040)),
                height=int(payload.get("base_size", {}).get("height", 1040)),
            )
            message = ImagemapMessage(
                base_url=payload.get("base_url") or payload.get("url"),
                alt_text=obj.alt_text or payload.get("alt_text") or f"ImageMap: {obj.name}",
                base_size=base_size,
                actions=payload.get("actions", []),
            )

        else:
            logger.warning(f"Unsupported object type: {obj.object_type}")
            return None

        # Quick reply is an optional modifier valid on ANY message type. The
        # editor stores it at payload.quickReply ({items: [...]}, ≤13).
        if message is not None and isinstance(payload, dict):
            quick_reply = payload.get("quickReply")
            if isinstance(quick_reply, dict) and quick_reply.get("items"):
                try:
                    message.quick_reply = QuickReply.from_dict(quick_reply)
                except Exception as qr_exc:
                    logger.warning(f"Invalid quickReply on {obj.object_id}: {qr_exc}")

        return message

    except Exception as e:
        logger.error(f"Error building message from object {obj.object_id}: {e}")
        return None
