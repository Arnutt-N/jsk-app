from linebot.v3.messaging import (
    AsyncMessagingApi,
    AsyncMessagingApiBlob,
    ReplyMessageRequest,
    PushMessageRequest,
    TextMessage,
    ImageMessage,
    FlexMessage,
    FlexContainer,
    ShowLoadingAnimationRequest,
    VideoMessage,
    AudioMessage,
    StickerMessage,
    LocationMessage,
    TemplateMessage,
    ImagemapMessage,
)
from linebot.v3.messaging.exceptions import ApiException
import mimetypes
from pathlib import Path
from typing import Optional, Tuple
from uuid import uuid4
from datetime import datetime, timedelta, timezone
import logging
from app.core.line_client import get_line_bot_api
from app.core.config import settings
from app.core.line_client import get_async_api_client
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.message import Message, MessageDirection

logger = logging.getLogger(__name__)


def describe_line_message(message) -> Tuple[str, str, Optional[dict]]:
    """Map a LINE SDK send-message object to a (message_type, content, payload)
    triple for the messages table, so the admin panel renders the real reply
    the customer received instead of a summary string."""
    if isinstance(message, TextMessage):
        return "text", message.text, None
    if isinstance(message, ImageMessage):
        return "image", "[Image]", {
            "url": message.original_content_url,
            "preview_url": message.preview_image_url,
        }
    if isinstance(message, VideoMessage):
        return "video", "[Video]", {
            "url": message.original_content_url,
            "preview_url": message.preview_image_url,
        }
    if isinstance(message, AudioMessage):
        return "audio", "[Audio]", {
            "url": message.original_content_url,
            "duration": message.duration,
        }
    if isinstance(message, StickerMessage):
        return "sticker", "[Sticker]", {
            "package_id": str(message.package_id),
            "sticker_id": str(message.sticker_id),
        }
    if isinstance(message, LocationMessage):
        content = message.title or message.address or "[Location]"
        return "location", content, {
            "lat": message.latitude,
            "lng": message.longitude,
            "address": message.address,
        }
    if isinstance(message, FlexMessage):
        return "flex", message.alt_text or "Rich Content", None
    if isinstance(message, TemplateMessage):
        return "template", message.alt_text or "[Template]", None
    if isinstance(message, ImagemapMessage):
        return "imagemap", message.alt_text or "[Imagemap]", None
    alt = getattr(message, "alt_text", None) or getattr(message, "text", None)
    return "text", alt or f"[{type(message).__name__}]", None


class LineService:
    def __init__(self):
        self._api = None
        self._blob_api = None
        self._cb_failures = 0
        self._cb_open_until: Optional[datetime] = None
        self._cb_failure_threshold = 5
        self._cb_recovery_timeout_seconds = 30

    @property
    def api(self) -> AsyncMessagingApi:
        """Lazy initialization of LINE API client"""
        if self._api is None:
            self._api = get_line_bot_api()
        return self._api

    @property
    def blob_api(self) -> AsyncMessagingApiBlob:
        """Lazy initialization of LINE Blob API client"""
        if self._blob_api is None:
            self._blob_api = AsyncMessagingApiBlob(get_async_api_client())
        return self._blob_api

    async def _call_with_circuit(self, operation: str, call):
        now = datetime.now(timezone.utc)
        open_until = self._cb_open_until
        # Legacy tests/data may still set naive UTC datetimes.
        if open_until and open_until.tzinfo is None:
            open_until = open_until.replace(tzinfo=timezone.utc)
        if open_until and now < open_until:
            logger.warning(
                "LINE circuit open; fast-fail operation=%s until=%s",
                operation,
                open_until.isoformat(),
            )
            raise RuntimeError("LINE API circuit is open")

        try:
            result = await call()
        except Exception as exc:
            self._cb_failures += 1
            if self._cb_failures >= self._cb_failure_threshold:
                self._cb_open_until = datetime.now(timezone.utc) + timedelta(seconds=self._cb_recovery_timeout_seconds)
                logger.error(
                    "LINE circuit opened after %s failures; operation=%s error=%s",
                    self._cb_failures,
                    operation,
                    exc,
                )
            else:
                logger.warning(
                    "LINE API failure %s/%s; operation=%s error=%s",
                    self._cb_failures,
                    self._cb_failure_threshold,
                    operation,
                    exc,
                )
            raise

        if self._cb_failures > 0 or self._cb_open_until:
            logger.info("LINE circuit closed after successful operation=%s", operation)
        self._cb_failures = 0
        self._cb_open_until = None
        return result

    async def reply_text(self, reply_token: str, text: str):
        await self._call_with_circuit(
            "reply_text",
            lambda: self.api.reply_message(
                ReplyMessageRequest(
                    reply_token=reply_token,
                    messages=[TextMessage(text=text)]
                )
            ),
        )

    async def reply_flex(self, reply_token: str, alt_text: str, contents: dict):
        container = FlexContainer.from_dict(contents)
        await self._call_with_circuit(
            "reply_flex",
            lambda: self.api.reply_message(
                ReplyMessageRequest(
                    reply_token=reply_token,
                    messages=[FlexMessage(alt_text=alt_text, contents=container)]
                )
            ),
        )

    async def reply_messages(self, reply_token: str, messages: list):
        """
        Reply with multiple messages at once (max 5 per LINE API).
        
        Args:
            reply_token: LINE reply token
            messages: List of LINE message objects (TextMessage, FlexMessage, etc.)
        """
        if not messages:
            return
        
        # LINE API limit: max 5 messages per reply
        await self._call_with_circuit(
            "reply_messages",
            lambda: self.api.reply_message(
                ReplyMessageRequest(
                    reply_token=reply_token,
                    messages=messages[:5]
                )
            ),
        )

    async def push_messages(self, line_user_id: str, messages: list):
        """
        Push messages to a user proactively (no reply token needed).
        Used for Live Chat operator messages.
        
        Args:
            line_user_id: LINE user ID
            messages: List of LINE message objects (TextMessage, FlexMessage, etc.)
        """
        if not messages:
            return
        
        # LINE API limit: max 5 messages per push
        await self._call_with_circuit(
            "push_messages",
            lambda: self.api.push_message(
                PushMessageRequest(
                    to=line_user_id,
                    messages=messages[:5]
                )
            ),
        )

    async def show_loading_animation(self, chat_id: str, loading_seconds: int = 20):
        try:
            await self._call_with_circuit(
                "show_loading_animation",
                lambda: self.api.show_loading_animation(
                    ShowLoadingAnimationRequest(chatId=chat_id, loadingSeconds=loading_seconds)
                ),
            )
        except Exception as e:
            # Helper: Log but don't crash if loading animation fails (e.g. rate limit)
            logger.warning("Error showing loading animation: %s", e)

    async def get_incoming_message_by_line_message_id(
        self,
        db: AsyncSession,
        line_user_id: str,
        line_message_id: str,
    ) -> Optional[Message]:
        """Return an already-persisted incoming LINE message by LINE message id."""
        from app.services.user_identity_service import child_filter, resolve_by_line_id

        user = await resolve_by_line_id(db, line_user_id)
        result = await db.execute(
            select(Message).where(
                child_filter(Message, line_user_id, user.id if user else None),
                Message.direction == MessageDirection.INCOMING,
                Message.payload["line_message_id"].astext == line_message_id,
            )
        )
        return result.scalar_one_or_none()

    async def save_message(
        self,
        db: AsyncSession,
        line_user_id: str,
        direction: MessageDirection,
        message_type: str,
        content: str,
        payload: dict = None,
        sender_role: str = None,
        operator_name: str = None,
        commit: bool = True,
        user_id: int = None,
    ):
        """
        Save a message to the database.

        Args:
            db: Database session
            line_user_id: LINE user ID
            direction: INCOMING or OUTGOING
            message_type: text, image, sticker, etc.
            content: Message content
            payload: Full JSON payload for complex messages
            sender_role: USER, BOT, or ADMIN
            operator_name: Display name of admin operator (for live chat)
            user_id: Internal user ID (dual-write pseudonymization)
        """
        message = Message(
            line_user_id=line_user_id,
            user_id=user_id,
            direction=direction,
            message_type=message_type,
            content=content,
            payload=payload,
            sender_role=sender_role,
            operator_name=operator_name
        )
        db.add(message)
        if commit:
            await db.commit()
            await db.refresh(message)
        else:
            await db.flush()
            await db.refresh(message)
        return message

    async def download_message_content(self, message_id: str, preview: bool = False) -> Tuple[bytes, Optional[str]]:
        """Download message content bytes and content-type from LINE Blob API."""
        try:
            if preview:
                resp = await self.blob_api.get_message_content_preview_with_http_info(message_id=message_id)
            else:
                resp = await self.blob_api.get_message_content_with_http_info(message_id=message_id)
            data = bytes(resp.data) if resp and resp.data is not None else b""
            content_type = resp.headers.get("Content-Type") if resp and resp.headers else None
            return data, content_type
        except ApiException as e:
            logger.warning("Failed to download LINE media %s (ApiException): %s", message_id, e)
            return b"", None
        except Exception as e:
            logger.warning("Failed to download LINE media %s: %s", message_id, e)
            return b"", None

    async def persist_line_media(
        self,
        message_id: str,
        media_type: str,
        file_name: Optional[str] = None,
    ) -> dict:
        """
        Download and persist LINE message binary content into uploads/line_media.
        Returns URL metadata for message payload.
        """
        uploads_root = Path(__file__).resolve().parents[2] / "uploads" / "line_media"
        uploads_root.mkdir(parents=True, exist_ok=True)

        data, content_type = await self.download_message_content(message_id=message_id, preview=False)
        if not data:
            return {"url": None, "preview_url": None, "content_type": content_type, "size": None}

        ext = ""
        guessed = mimetypes.guess_extension(content_type or "") if content_type else None
        if guessed:
            ext = guessed
        elif media_type == "image":
            ext = ".jpg"
        elif media_type == "video":
            ext = ".mp4"
        elif media_type == "audio":
            ext = ".m4a"

        raw_name = file_name or f"{media_type}_{uuid4().hex}{ext}"
        safe_name = Path(raw_name).name.replace("..", "").strip()
        if not safe_name:
            safe_name = f"{media_type}_{uuid4().hex}{ext}"
        if not Path(safe_name).suffix and ext:
            safe_name = f"{safe_name}{ext}"

        full_path = (uploads_root / safe_name).resolve()
        if not str(full_path).startswith(str(uploads_root.resolve())):
            safe_name = f"{media_type}_{uuid4().hex}{ext}"
            full_path = uploads_root / safe_name
        full_path.write_bytes(data)

        relative_url = f"/uploads/line_media/{safe_name}"
        base = (settings.SERVER_BASE_URL or "").rstrip("/")
        absolute_url = f"{base}{relative_url}" if base else relative_url

        preview_url = None
        if media_type == "image":
            preview_data, preview_ct = await self.download_message_content(message_id=message_id, preview=True)
            if preview_data:
                preview_name = f"preview_{uuid4().hex}{mimetypes.guess_extension(preview_ct or '') or '.jpg'}"
                preview_path = uploads_root / preview_name
                preview_path.write_bytes(preview_data)
                preview_relative = f"/uploads/line_media/{preview_name}"
                preview_url = f"{base}{preview_relative}" if base else preview_relative

        return {
            "url": absolute_url,
            "preview_url": preview_url,
            "content_type": content_type,
            "size": len(data),
            "file_name": safe_name,
        }

    async def persist_operator_upload(
        self,
        data: bytes,
        media_type: str,
        file_name: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> dict:
        """Persist operator-uploaded media into uploads/operator_media."""
        uploads_root = Path(__file__).resolve().parents[2] / "uploads" / "operator_media"
        uploads_root.mkdir(parents=True, exist_ok=True)

        ext = ""
        guessed = mimetypes.guess_extension(content_type or "") if content_type else None
        if guessed:
            ext = guessed
        elif media_type == "image":
            ext = ".jpg"

        base_name = Path(file_name or f"{media_type}_{uuid4().hex}{ext}").name
        if not Path(base_name).suffix and ext:
            base_name = f"{base_name}{ext}"
        if not base_name:
            base_name = f"{media_type}_{uuid4().hex}{ext}"

        safe_name = f"{uuid4().hex}_{base_name}"
        full_path = uploads_root / safe_name
        full_path.write_bytes(data)

        relative_url = f"/uploads/operator_media/{safe_name}"
        base = (settings.SERVER_BASE_URL or "").rstrip("/")
        absolute_url = f"{base}{relative_url}" if base else relative_url

        return {
            "url": absolute_url,
            "preview_url": absolute_url if media_type == "image" else None,
            "content_type": content_type,
            "size": len(data),
            "file_name": safe_name,
        }

    async def push_image_message(self, line_user_id: str, image_url: str, preview_url: Optional[str] = None):
        """Push image message via LINE using public HTTPS URLs."""
        await self._call_with_circuit(
            "push_image_message",
            lambda: self.api.push_message(
                PushMessageRequest(
                    to=line_user_id,
                    messages=[
                        ImageMessage(
                            original_content_url=image_url,
                            preview_image_url=preview_url or image_url,
                        )
                    ],
                )
            ),
        )

# Singleton instance
line_service = LineService()


async def resolve_raw_for_push(db: AsyncSession, user) -> str:
    """Resolve the raw LINE user ID for outbound push.

    Prefers decrypting line_user_id_encrypted; falls back to plaintext column.
    PR B will switch push callers to use this instead of user.line_user_id directly.
    """
    from app.services.user_identity_service import decrypt_line_id_for_user

    decrypted = await decrypt_line_id_for_user(db, user.id)
    if decrypted:
        return decrypted
    return user.line_user_id

