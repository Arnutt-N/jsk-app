"""Non-text message extraction (image, sticker, file, video, audio)."""
from ._deps import get_line_service


async def extract_non_text_message(message):
    """Extract type, content label, and payload from a non-text LINE message.

    Returns (message_type, content, payload) or (None, "", {}) for unsupported types.
    """
    message_type = getattr(message, "type", None)
    line_message_id = getattr(message, "id", None)
    line_svc = get_line_service()

    if message_type == "image":
        media = await line_svc.persist_line_media(
            message_id=str(line_message_id),
            media_type="image",
        ) if line_message_id else {"url": None, "preview_url": None, "content_type": None, "size": None}
        return "image", "[Image]", {
            "line_message_id": line_message_id,
            "preview_url": media.get("preview_url"),
            "url": media.get("url"),
            "content_type": media.get("content_type"),
            "size": media.get("size"),
        }

    if message_type == "sticker":
        package_id = str(getattr(message, "package_id", ""))
        sticker_id = str(getattr(message, "sticker_id", ""))
        return "sticker", f"[Sticker {package_id}/{sticker_id}]", {
            "line_message_id": line_message_id,
            "package_id": package_id,
            "sticker_id": sticker_id,
            "sticker_resource_type": getattr(message, "sticker_resource_type", None),
        }

    if message_type == "file":
        file_name = getattr(message, "file_name", None)
        file_size = getattr(message, "file_size", None)
        media = await line_svc.persist_line_media(
            message_id=str(line_message_id),
            media_type="file",
            file_name=file_name,
        ) if line_message_id else {"url": None, "preview_url": None, "content_type": None, "size": None}
        return "file", file_name or "[File]", {
            "line_message_id": line_message_id,
            "file_name": media.get("file_name") or file_name,
            "size": media.get("size") if media.get("size") is not None else file_size,
            "url": media.get("url"),
            "content_type": media.get("content_type"),
        }

    if message_type in {"video", "audio"}:
        media = await line_svc.persist_line_media(
            message_id=str(line_message_id),
            media_type=message_type,
        ) if line_message_id else {"url": None, "preview_url": None, "content_type": None, "size": None}
        return message_type, "[Video]" if message_type == "video" else "[Audio]", {
            "line_message_id": line_message_id,
            "url": media.get("url"),
            "content_type": media.get("content_type"),
            "size": media.get("size"),
        }

    return None, "", {}
