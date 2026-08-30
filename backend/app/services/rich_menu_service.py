from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any, Optional
import httpx
import json
import logging
from datetime import datetime, timezone
from app.models.rich_menu import RichMenu, RichMenuStatus, RichMenuSyncStatus
from app.models.media_file import MediaFile, FileCategory
from app.models.user_rich_menu_link import UserRichMenuLink
from app.services.settings_service import SettingsService
from app.core.redis_client import redis_client
from app.services.user_identity_service import child_column
import os

logger = logging.getLogger(__name__)

INSIGHT_CACHE_TTL = 1800

# LINE caps rich-menu image content at 1 MB — POST api-data.line.me/v2/bot/
# richmenu/{id}/content answers 413 above it. This is the Messaging API's
# limit; LINE OA Manager's UI accepts bigger picks only because it compresses
# client-side before its own upload. (PRPs/2026-08-31-rich-menu-image-1mb.prd.md)
LINE_IMAGE_LIMIT_BYTES = 1024 * 1024
LINE_IMAGE_TOO_LARGE_DETAIL = (
    "รูปใหญ่เกินขีดจำกัด 1 MB ของ LINE — เลือกรูปใหม่แล้วระบบจะย่อให้อัตโนมัติ "
    "หรือย่อรูปเองที่ /admin/image-resize ก่อนอัปโหลด"
)

# LINE has no image-replace endpoint: a rich menu's image uploads exactly once
# (POST /content answers 400 "An image has already been uploaded to the
# richmenu" on any second push; only delete-and-recreate changes it). Matched
# as a case-insensitive substring so LINE rewording the message stays benign.
LINE_IMAGE_ALREADY_UPLOADED_MARKER = "an image has already been uploaded"
# Response body signaling "LINE kept the menu's existing image" — returned
# (not raised) so sync/upload of an already-decorated menu completes green.
LINE_IMAGE_ALREADY_UPLOADED_RESULT = {"already_uploaded": True}

class RichMenuService:
    API_BASE = "https://api.line.me/v2/bot"
    DATA_API_BASE = "https://api-data.line.me/v2/bot"

    @staticmethod
    async def get_client_headers(db: AsyncSession) -> Dict[str, str]:
        token = await SettingsService.get_setting(db, "LINE_CHANNEL_ACCESS_TOKEN")
        if not token:
            # Fail fast with an actionable message instead of sending
            # "Authorization: Bearer " and letting LINE answer with a raw 401.
            raise RuntimeError("LINE channel access token is not configured")
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

    @staticmethod
    def _line_error_detail(e: httpx.HTTPStatusError) -> str:
        """Extract LINE's own error text from an HTTPStatusError for user-facing
        detail (LINE bodies carry `message`/`details`; the httpx str(e) blob that
        used to reach admins contained neither)."""
        try:
            payload = e.response.json()
            if isinstance(payload, dict):
                parts = [payload.get("message") or ""]
                details = payload.get("details")
                if details:
                    parts.append(json.dumps(details, ensure_ascii=False))
                joined = " - ".join(p for p in parts if p)
                if joined:
                    return joined
        except Exception:
            pass
        return (e.response.text or "").strip()[:500] or str(e)

    # ---- Image storage (media_files pipeline) ----------------------------

    @staticmethod
    async def replace_image(
        db: AsyncSession, rich_menu: RichMenu, filename: str, mime_type: str, data: bytes
    ) -> MediaFile:
        """Store the menu image as a media_files row and point the menu at it.

        Replaces (deletes) any previous media row so re-uploads never orphan
        bytes. The caller has already validated mime/size; this is pure storage.
        """
        if rich_menu.image_media_id:
            previous = await db.get(MediaFile, rich_menu.image_media_id)
            if previous:
                await db.delete(previous)
        media = MediaFile(
            filename=filename,
            mime_type=mime_type,
            data=data,
            size_bytes=len(data),
            category=FileCategory.IMAGE,
        )
        db.add(media)
        await db.flush()
        rich_menu.image_media_id = media.id
        await db.commit()
        await db.refresh(rich_menu)
        await db.refresh(media)
        return media

    @staticmethod
    async def push_image_to_line(db: AsyncSession, rich_menu: RichMenu) -> bool | Dict[str, Any]:
        """Push the stored image bytes to LINE for an already-synced menu.

        Returns False when the menu has no stored image (menu-only sync stays
        valid); raises on LINE failures so the caller can surface them.
        A True/False legacy return means pushed/absent; the already-uploaded
        dict means LINE kept its existing image — also a completed state.
        """
        if not rich_menu.line_rich_menu_id or not rich_menu.image_media_id:
            return False
        result = await db.execute(
            select(MediaFile).where(MediaFile.id == rich_menu.image_media_id)
        )
        media = result.scalar_one_or_none()
        if not media:
            return False
        return await RichMenuService.upload_image_to_line(
            db, rich_menu.line_rich_menu_id, media.data, media.mime_type
        )

    @staticmethod
    async def get_current_links_for_users(
        db: AsyncSession, user_ids: List[int]
    ) -> Dict[int, Dict[str, Any]]:
        """Map each given user id to its current rich menu {id, name}.

        Joins user_rich_menu_links -> rich_menus so a friends-list page can show
        which menu each user is bound to. Users with no per-user link are simply
        absent from the result (the caller treats absence as "on the default
        menu"). Scoped to the passed ids (one page) so we never scan the whole
        table.
        """
        if not user_ids:
            return {}
        owner_col = child_column(UserRichMenuLink)
        query = (
            select(
                owner_col.label("owner_key"),
                RichMenu.id.label("rich_menu_id"),
                RichMenu.name.label("rich_menu_name"),
            )
            .join(RichMenu, RichMenu.id == UserRichMenuLink.rich_menu_id)
            .where(owner_col.in_(list(user_ids)))
        )

        result = await db.execute(query)
        return {
            row.owner_key: {
                "rich_menu_id": row.rich_menu_id,
                "rich_menu_name": row.rich_menu_name,
            }
            for row in result.all()
        }

    @staticmethod
    async def create_on_line(db: AsyncSession, rich_menu_config: Dict[str, Any]) -> str:
        """Create rich menu on LINE and return the rich menu ID."""
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RichMenuService.API_BASE}/richmenu",
                headers=headers,
                json=rich_menu_config
            )
            response.raise_for_status()
            return response.json()["richMenuId"]

    @staticmethod
    async def upload_image_to_line(db: AsyncSession, line_rich_menu_id: str, image_bytes: bytes, content_type: str):
        """Upload rich menu image to LINE.

        httpx.HTTPStatusError is re-raised as RuntimeError carrying LINE's own
        error text — the raw str(e) blob (no LINE body, no instruction) must
        not reach admins (same principle as _line_error_detail). One exception:
        LINE allows an image exactly once per rich menu, so a 400 saying the
        menu already has one is a completed state, returned as
        LINE_IMAGE_ALREADY_UPLOADED_RESULT instead of raised — re-syncing an
        already-decorated menu must land green, not FAILED.
        """
        headers = await RichMenuService.get_client_headers(db)
        headers["Content-Type"] = content_type
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{RichMenuService.DATA_API_BASE}/richmenu/{line_rich_menu_id}/content",
                    headers=headers,
                    content=image_bytes
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 413:
                raise RuntimeError(LINE_IMAGE_TOO_LARGE_DETAIL) from e
            if e.response.status_code == 400 and (
                LINE_IMAGE_ALREADY_UPLOADED_MARKER
                in RichMenuService._line_error_detail(e).lower()
            ):
                return dict(LINE_IMAGE_ALREADY_UPLOADED_RESULT)
            raise RuntimeError(
                f"LINE rejected image upload ({e.response.status_code}): "
                f"{RichMenuService._line_error_detail(e)}"
            ) from e

    @staticmethod
    async def set_default_on_line(db: AsyncSession, line_rich_menu_id: str):
        """Set rich menu as default for all users."""
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RichMenuService.API_BASE}/user/all/richmenu/{line_rich_menu_id}",
                headers=headers
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def delete_from_line(db: AsyncSession, line_rich_menu_id: str):
        """Delete rich menu from LINE."""
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{RichMenuService.API_BASE}/richmenu/{line_rich_menu_id}",
                headers=headers
            )
            # 404 is acceptable if already deleted on LINE
            if response.status_code != 404:
                response.raise_for_status()
            return response.status_code

    @staticmethod
    async def list_from_line(db: AsyncSession) -> List[Dict[str, Any]]:
        """List all rich menus from LINE."""
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{RichMenuService.API_BASE}/richmenu/list",
                headers=headers
            )
            response.raise_for_status()
            return response.json().get("richmenus", [])

    @staticmethod
    async def get_from_line(db: AsyncSession, line_rich_menu_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific rich menu from LINE by ID."""
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{RichMenuService.API_BASE}/richmenu/{line_rich_menu_id}",
                headers=headers
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()

    # ---- Rich Menu Aliases (tab switching via `richmenuswitch`) ----

    @staticmethod
    async def create_alias_on_line(
        db: AsyncSession, alias_id: str, line_rich_menu_id: str
    ) -> Dict[str, Any]:
        """Create an alias on LINE mapping alias_id -> rich menu (LINE returns empty body)."""
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RichMenuService.API_BASE}/richmenu/alias",
                headers=headers,
                json={"richMenuAliasId": alias_id, "richMenuId": line_rich_menu_id},
            )
            response.raise_for_status()
            return response.json() if response.content else {}

    @staticmethod
    async def update_alias_on_line(
        db: AsyncSession, alias_id: str, line_rich_menu_id: str
    ) -> Dict[str, Any]:
        """Re-point an existing alias to a different rich menu.

        LINE uses PUT for alias updates (POST is create-only and returns 404/405).
        alias_id itself is immutable; only the target rich menu can change.
        """
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{RichMenuService.API_BASE}/richmenu/alias/{alias_id}",
                headers=headers,
                json={"richMenuId": line_rich_menu_id},
            )
            response.raise_for_status()
            return response.json() if response.content else {}

    @staticmethod
    async def delete_alias_on_line(db: AsyncSession, alias_id: str) -> int:
        """Delete an alias on LINE. 404 is accepted (already gone)."""
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{RichMenuService.API_BASE}/richmenu/alias/{alias_id}",
                headers=headers,
            )
            if response.status_code != 404:
                response.raise_for_status()
            return response.status_code

    @staticmethod
    async def list_aliases_from_line(db: AsyncSession) -> List[Dict[str, Any]]:
        """List all rich menu aliases from LINE (response shape: {"aliases": [...]})."""
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{RichMenuService.API_BASE}/richmenu/alias/list",
                headers=headers,
            )
            response.raise_for_status()
            return response.json().get("aliases", [])

    # ---- Per-user assignment (override the default menu for one user) ----

    @staticmethod
    async def link_to_user(
        db: AsyncSession, line_user_id: str, line_rich_menu_id: str
    ) -> Dict[str, Any]:
        """Link a rich menu to a single user (overrides the default menu).

        Uses the LINE rich menu id (string), NOT the local DB id.
        """
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RichMenuService.API_BASE}/user/{line_user_id}/richmenu/{line_rich_menu_id}",
                headers=headers,
            )
            response.raise_for_status()
            return response.json() if response.content else {}

    @staticmethod
    async def unlink_from_user(db: AsyncSession, line_user_id: str) -> int:
        """Remove a user's per-user rich menu, reverting them to the default menu.

        404 is accepted: the user may already have no per-user menu (e.g. they
        are on the default), which makes unlinking effectively idempotent.
        """
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{RichMenuService.API_BASE}/user/{line_user_id}/richmenu",
                headers=headers,
            )
            if response.status_code != 404:
                response.raise_for_status()
            return response.status_code

    @staticmethod
    async def get_user_rich_menu(
        db: AsyncSession, line_user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get the rich menu currently linked to a user. None if the user has none (404)."""
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{RichMenuService.API_BASE}/user/{line_user_id}/richmenu",
                headers=headers,
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()

    @staticmethod
    async def bulk_link(
        db: AsyncSession, line_rich_menu_id: str, user_ids: List[str]
    ) -> Dict[str, Any]:
        """Link one rich menu to up to 500 users in a single call.

        Body is a dict: {"richMenuId": ..., "userIds": [...]}.
        """
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RichMenuService.API_BASE}/richmenu/bulk/link",
                headers=headers,
                json={"richMenuId": line_rich_menu_id, "userIds": user_ids},
            )
            response.raise_for_status()
            return response.json() if response.content else {}

    @staticmethod
    async def bulk_unlink(db: AsyncSession, user_ids: List[str]) -> Dict[str, Any]:
        """Unlink the per-user rich menu for up to 500 users in a single call.

        Body is a dict with userIds only (no richMenuId): {"userIds": [...]}.
        """
        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{RichMenuService.API_BASE}/richmenu/bulk/unlink",
                headers=headers,
                json={"userIds": user_ids},
            )
            response.raise_for_status()
            return response.json() if response.content else {}

    @staticmethod
    async def update_sync_status(
        db: AsyncSession,
        rich_menu: RichMenu,
        status: RichMenuSyncStatus | str,
        error: Optional[str] = None
    ):
        """Update the sync status of the rich menu."""
        rich_menu.sync_status = (
            status.value if isinstance(status, RichMenuSyncStatus) else status
        )
        rich_menu.last_synced_at = datetime.now(timezone.utc)
        rich_menu.last_sync_error = error
        await db.commit()

    @staticmethod
    async def sync_with_idempotency(
        db: AsyncSession,
        rich_menu_id: int
    ) -> Dict[str, Any]:
        """
        Sync rich menu to LINE with idempotency.
        If already synced (line_rich_menu_id exists), verify existence on LINE.
        If not synced, create on LINE and store the ID.
        """
        from sqlalchemy import select

        # Get rich menu from database
        result = await db.execute(select(RichMenu).where(RichMenu.id == rich_menu_id))
        rich_menu = result.scalar_one_or_none()

        if not rich_menu:
            return {"success": False, "message": "Rich menu not found"}

        # If already has LINE ID, verify it exists on LINE. When it does not,
        # the id is stale (deleted on LINE / different channel): clear it and
        # fall through to the create path — publish's 409 message tells the
        # user "กด Sync เพื่อสร้างใหม่", so Sync MUST be able to recreate.
        # A get_from_line 404 proves the old menu is gone, so recreation
        # cannot duplicate anything.
        was_stale = False
        if rich_menu.line_rich_menu_id:
            line_menu = await RichMenuService.get_from_line(db, rich_menu.line_rich_menu_id)
            if line_menu:
                # Already exists on LINE - no need to recreate
                await RichMenuService.update_sync_status(db, rich_menu, RichMenuSyncStatus.SYNCED)
                return {
                    "success": True,
                    "message": "Already synced with LINE",
                    "line_rich_menu_id": rich_menu.line_rich_menu_id,
                    "sync_status": RichMenuSyncStatus.SYNCED.value
                }
            else:
                was_stale = True
                rich_menu.line_rich_menu_id = None

        # Fail-fast before create (covers fresh create AND stale-recreate):
        # LINE caps image content at 1 MB, so creating a menu whose stored
        # image is over the cap would strand an imageless, un-publishable
        # menu on LINE. Refuse before any LINE call creates anything.
        if rich_menu.image_media_id:
            media = await db.get(MediaFile, rich_menu.image_media_id)
            if media and media.size_bytes > LINE_IMAGE_LIMIT_BYTES:
                await RichMenuService.update_sync_status(
                    db, rich_menu, RichMenuSyncStatus.FAILED,
                    LINE_IMAGE_TOO_LARGE_DETAIL,
                )
                return {
                    "success": False,
                    "message": LINE_IMAGE_TOO_LARGE_DETAIL,
                    "sync_status": RichMenuSyncStatus.FAILED.value,
                    "error": LINE_IMAGE_TOO_LARGE_DETAIL,
                }

        # Not synced yet - create on LINE
        try:
            line_id = await RichMenuService.create_on_line(db, rich_menu.config)
            rich_menu.line_rich_menu_id = line_id
            await RichMenuService.update_sync_status(db, rich_menu, RichMenuSyncStatus.SYNCED)
            await db.refresh(rich_menu)
            return {
                "success": True,
                "message": (
                    "Recreated on LINE (previous id was stale)"
                    if was_stale else "Created on LINE successfully"
                ),
                "line_rich_menu_id": line_id,
                "sync_status": RichMenuSyncStatus.SYNCED.value
            }
        except httpx.HTTPStatusError as e:
            error_msg = f"LINE API error: {e.response.status_code} - {e.response.text}"
            await RichMenuService.update_sync_status(db, rich_menu, RichMenuSyncStatus.FAILED, error_msg)
            return {
                "success": False,
                "message": error_msg,
                "sync_status": RichMenuSyncStatus.FAILED.value,
                "error": error_msg
            }
        except Exception as e:
            error_msg = f"Sync failed: {str(e)}"
            await RichMenuService.update_sync_status(db, rich_menu, RichMenuSyncStatus.FAILED, error_msg)
            return {
                "success": False,
                "message": error_msg,
                "sync_status": RichMenuSyncStatus.FAILED.value,
                "error": error_msg
            }

    @staticmethod
    async def get_sync_status(db: AsyncSession, rich_menu_id: int) -> Dict[str, Any]:
        """Get the current sync status of a rich menu."""
        from sqlalchemy import select

        result = await db.execute(select(RichMenu).where(RichMenu.id == rich_menu_id))
        rich_menu = result.scalar_one_or_none()

        if not rich_menu:
            return {"success": False, "message": "Rich menu not found"}

        return {
            "sync_status": rich_menu.sync_status,
            "last_synced_at": rich_menu.last_synced_at.isoformat() if rich_menu.last_synced_at else None,
            "last_sync_error": rich_menu.last_sync_error,
            "line_rich_menu_id": rich_menu.line_rich_menu_id
        }

    @staticmethod
    async def get_insight_summary(
        db: AsyncSession,
        line_rich_menu_id: str,
        from_date: str,
        to_date: str,
    ) -> Dict[str, Any]:
        cache_key = f"insight:summary:{line_rich_menu_id}:{from_date}:{to_date}"
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{RichMenuService.API_BASE}/insight/richmenu/{line_rich_menu_id}/summary",
                headers=headers,
                params={"from": from_date, "to": to_date},
            )
            response.raise_for_status()
            data = response.json()

        data["privacy_restricted"] = "impression" not in data

        await redis_client.setex(cache_key, INSIGHT_CACHE_TTL, json.dumps(data))
        return data

    @staticmethod
    async def get_insight_daily(
        db: AsyncSession,
        line_rich_menu_id: str,
        from_date: str,
        to_date: str,
    ) -> Dict[str, Any]:
        cache_key = f"insight:daily:{line_rich_menu_id}:{from_date}:{to_date}"
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

        headers = await RichMenuService.get_client_headers(db)
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{RichMenuService.API_BASE}/insight/richmenu/{line_rich_menu_id}/daily",
                headers=headers,
                params={"from": from_date, "to": to_date},
            )
            response.raise_for_status()
            data = response.json()

        data["privacy_restricted"] = "impression" not in data

        await redis_client.setex(cache_key, INSIGHT_CACHE_TTL, json.dumps(data))
        return data
