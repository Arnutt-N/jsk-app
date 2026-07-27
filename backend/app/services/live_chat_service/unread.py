"""Unread-count helpers for live chat conversations."""
import logging
from datetime import datetime
from typing import Union

from sqlalchemy import DateTime, Integer, String, column, func, select, values
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis_client import redis_client
from app.core.websocket_manager import ConnectionManager
from app.models.message import Message, MessageDirection
from app.services.user_identity_service import (
    child_column,
    child_filter,
    resolve_by_line_id,
    resolve_many_by_line_id,
)

logger = logging.getLogger(__name__)


class UnreadCountsMixin:
    async def get_unread_count(self, line_user_id: str, admin_id: Union[int, str], db: AsyncSession) -> int:
        """Compute unread incoming messages for one admin and conversation."""
        admin_id_str = str(admin_id)
        raw_read = await redis_client.get(
            ConnectionManager.build_read_key(admin_id_str, line_user_id)
        )
        read_at = None
        if raw_read:
            try:
                read_at = datetime.fromisoformat(raw_read)
            except ValueError:
                read_at = None

        user = await resolve_by_line_id(db, line_user_id)
        unread_stmt = select(func.count(Message.id)).where(
            child_filter(Message, line_user_id, user.id if user else None),
            Message.direction == MessageDirection.INCOMING,
        )
        if read_at:
            unread_stmt = unread_stmt.where(Message.created_at > read_at)
        return (await db.scalar(unread_stmt)) or 0

    async def get_unread_counts(
        self,
        line_user_ids: list[str],
        admin_id: Union[int, str],
        db: AsyncSession,
    ) -> dict[str, int]:
        """Compute unread incoming messages for multiple conversations in batches."""
        unique_line_user_ids = [line_user_id for line_user_id in dict.fromkeys(line_user_ids) if line_user_id]
        if not unique_line_user_ids:
            return {}

        admin_id_str = str(admin_id)
        read_keys = [
            ConnectionManager.build_read_key(admin_id_str, line_user_id)
            for line_user_id in unique_line_user_ids
        ]
        raw_markers = await redis_client.mget(read_keys)

        counts = {line_user_id: 0 for line_user_id in unique_line_user_ids}
        ids_without_markers: list[str] = []
        ids_with_markers: list[tuple[str, datetime]] = []

        for line_user_id, raw_marker in zip(unique_line_user_ids, raw_markers):
            if not raw_marker:
                ids_without_markers.append(line_user_id)
                continue

            try:
                ids_with_markers.append((line_user_id, datetime.fromisoformat(raw_marker)))
            except ValueError:
                ids_without_markers.append(line_user_id)

        use_pseudonym = settings.LINE_ID_STORAGE_MODE == "pseudonym"
        id_to_user: dict[str, int] = {}
        user_to_id: dict[int, str] = {}
        if use_pseudonym:
            id_to_user = await resolve_many_by_line_id(
                db,
                ids_without_markers + [line_user_id for line_user_id, _ in ids_with_markers],
            )
            user_to_id = {user_id: line_user_id for line_user_id, user_id in id_to_user.items()}

        msg_col = child_column(Message)

        if ids_without_markers:
            if use_pseudonym:
                owner_cond = msg_col.in_(
                    [id_to_user[line_user_id] for line_user_id in ids_without_markers if line_user_id in id_to_user]
                )
            else:
                owner_cond = msg_col.in_(ids_without_markers)
            result = await db.execute(
                select(
                    msg_col,
                    func.count(Message.id).label("unread_count"),
                )
                .where(
                    owner_cond,
                    Message.direction == MessageDirection.INCOMING,
                )
                .group_by(msg_col)
            )
            for key, unread_count in result.all():
                counts[user_to_id.get(key, key)] = int(unread_count)

        if ids_with_markers:
            if use_pseudonym:
                id_column = column("user_id", Integer())
                marker_rows = [
                    (id_to_user[line_user_id], read_at)
                    for line_user_id, read_at in ids_with_markers
                    if line_user_id in id_to_user
                ]
            else:
                id_column = column("line_user_id", String())
                marker_rows = ids_with_markers
            if marker_rows:
                marker_values = (
                    values(
                        id_column,
                        column("read_at", DateTime(timezone=True)),
                        name="read_markers",
                    )
                    .data(marker_rows)
                    .alias("read_markers")
                )
                result = await db.execute(
                    select(
                        msg_col,
                        func.count(Message.id).label("unread_count"),
                    )
                    .select_from(Message)
                    .join(
                        marker_values,
                        msg_col == marker_values.c[id_column.name],
                    )
                    .where(
                        Message.direction == MessageDirection.INCOMING,
                        Message.created_at > marker_values.c.read_at,
                    )
                    .group_by(msg_col)
                )
                for key, unread_count in result.all():
                    counts[user_to_id.get(key, key)] = int(unread_count)

        return counts
