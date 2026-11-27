import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from linebot.v3.messaging import (
    BroadcastRequest,
    FlexContainer,
    FlexMessage,
    ImageMessage,
    MulticastRequest,
    TextMessage,
)
from sqlalchemy import and_, delete, desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.date_windows import apply_optional_range
from app.core.line_client import get_line_bot_api
from app.models.broadcast import Broadcast, BroadcastSendAttempt, BroadcastStatus, BroadcastType
from app.models.broadcast_failed_recipient import BroadcastFailedRecipient

logger = logging.getLogger(__name__)

SEND_ATTEMPT_LIMIT = 3
STALE_SENDING_SECONDS = 900
_RETRY_NAMESPACE = uuid.UUID("0f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8")


class BroadcastValidationError(ValueError):
    """Permanent pre-send validation failure; the broadcast is marked INVALID."""


class BroadcastClaimConflict(ValueError):
    """Lost the atomic send or edit claim to a concurrent change.

    Subclasses ValueError so existing broad catchers (the double-send
    race test's `except ValueError`, the scheduler's `except Exception`)
    keep working; the admin endpoints catch this type first and map it
    to HTTP 409.
    """


class BroadcastService:
    def __init__(self):
        self._api = None

    @property
    def api(self):
        if self._api is None:
            self._api = get_line_bot_api()
        return self._api

    # ------------------------------------------------------------------ #
    #  CRUD helpers
    # ------------------------------------------------------------------ #

    async def create_broadcast(
        self,
        db: AsyncSession,
        *,
        title: str,
        message_type: BroadcastType,
        content: dict,
        target_audience: str = "all",
        target_filter: Optional[dict] = None,
        created_by: Optional[int] = None,
        operation_id: Optional[str] = None,
    ) -> Broadcast:
        broadcast = Broadcast(
            title=title,
            message_type=message_type,
            content=content,
            target_audience=target_audience,
            target_filter=target_filter or {},
            status=BroadcastStatus.DRAFT,
            created_by=created_by,
            operation_id=operation_id,
        )
        db.add(broadcast)
        await db.commit()
        await db.refresh(broadcast)
        return broadcast

    async def get_broadcast(self, db: AsyncSession, broadcast_id: int) -> Optional[Broadcast]:
        if hasattr(db, "get_broadcast"):
            return await db.get_broadcast(db, broadcast_id)
        result = await db.execute(select(Broadcast).where(Broadcast.id == broadcast_id))
        return result.scalar_one_or_none()

    async def list_broadcasts(
        self,
        db: AsyncSession,
        *,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        start_dt: Optional[datetime] = None,
        end_dt: Optional[datetime] = None,
    ) -> tuple[List[Broadcast], int]:
        query = select(Broadcast)
        count_query = select(func.count(Broadcast.id))

        if status:
            query = query.where(Broadcast.status == status)
            count_query = count_query.where(Broadcast.status == status)
        query = apply_optional_range(query, Broadcast.created_at, start_dt, end_dt)
        count_query = apply_optional_range(count_query, Broadcast.created_at, start_dt, end_dt)

        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(desc(Broadcast.created_at)).offset(skip).limit(limit)
        result = await db.execute(query)
        broadcasts = list(result.scalars().all())

        return broadcasts, total

    @staticmethod
    def _version(broadcast) -> int:
        return getattr(broadcast, "payload_version", 1) or 1

    async def update_broadcast(
        self,
        db: AsyncSession,
        broadcast: Broadcast,
        **kwargs,
    ) -> Broadcast:
        allowed = {"title", "message_type", "content", "target_audience", "target_filter"}
        updates = {key: value for key, value in kwargs.items() if key in allowed and hasattr(broadcast, key)}
        if not updates:
            return broadcast

        expected_version = self._version(broadcast)
        result = await db.execute(
            update(Broadcast)
            .where(
                Broadcast.id == broadcast.id,
                Broadcast.status == BroadcastStatus.DRAFT,
                Broadcast.payload_version == expected_version,
            )
            .values(**updates, payload_version=Broadcast.payload_version + 1)
        )
        if result.rowcount != 1:
            raise BroadcastClaimConflict(
                f"Cannot edit broadcast {broadcast.id}: status changed, refresh and try again"
            )
        for key, value in updates.items():
            setattr(broadcast, key, value)
        broadcast.payload_version = expected_version + 1
        await db.commit()
        await db.refresh(broadcast)
        return broadcast

    async def delete_broadcast(self, db: AsyncSession, broadcast: Broadcast) -> None:
        result = await db.execute(
            delete(Broadcast).where(
                Broadcast.id == broadcast.id,
                Broadcast.status.in_([BroadcastStatus.DRAFT, BroadcastStatus.CANCELLED]),
                Broadcast.payload_version == self._version(broadcast),
            )
        )
        if result.rowcount != 1:
            raise BroadcastClaimConflict(
                f"Cannot delete broadcast {broadcast.id}: status changed, refresh and try again"
            )
        await db.commit()
        if hasattr(db, "expunge"):
            db.expunge(broadcast)

    # ------------------------------------------------------------------ #
    #  Message building
    # ------------------------------------------------------------------ #

    async def _build_messages(self, broadcast: Broadcast, db: AsyncSession) -> list:
        """Convert broadcast content JSONB into LINE message objects."""
        from app.services.response_parser import resolve_object
        content = broadcast.content
        messages = []

        if broadcast.message_type == BroadcastType.TEXT:
            text = content.get("text", "")
            if text:
                messages.append(TextMessage(text=text))

        elif broadcast.message_type == BroadcastType.IMAGE:
            original_url = content.get("original_url", "")
            preview_url = content.get("preview_url", original_url)
            if original_url:
                messages.append(
                    ImageMessage(
                        original_content_url=original_url,
                        preview_image_url=preview_url,
                    )
                )

        elif broadcast.message_type == BroadcastType.FLEX:
            alt_text = content.get("alt_text", broadcast.title)
            flex_content = content.get("flex", {})
            if flex_content:
                container = FlexContainer.from_dict(flex_content)
                messages.append(FlexMessage(alt_text=alt_text, contents=container))

        elif broadcast.message_type == BroadcastType.MULTI:
            for item in content.get("messages", []):
                msg_type = item.get("type", "text")
                if msg_type == "text" and item.get("text"):
                    messages.append(TextMessage(text=item["text"]))
                elif msg_type == "image" and item.get("original_url"):
                    messages.append(
                        ImageMessage(
                            original_content_url=item["original_url"],
                            preview_image_url=item.get("preview_url", item["original_url"]),
                        )
                    )
                elif msg_type == "flex" and item.get("flex"):
                    container = FlexContainer.from_dict(item["flex"])
                    messages.append(
                        FlexMessage(alt_text=item.get("alt_text", "Flex Message"), contents=container)
                    )

        elif broadcast.message_type == BroadcastType.OBJECT_REF:
            object_id = content.get("object_id", "")
            if object_id:
                resolved = await resolve_object(object_id, db)
                if resolved:
                    messages.append(resolved)
                else:
                    logger.warning("Broadcast %s: reply object '%s' not found", broadcast.id, object_id)

        return messages[:5]  # LINE API limit

    # ------------------------------------------------------------------ #
    #  Send
    # ------------------------------------------------------------------ #

    async def send_broadcast(self, db: AsyncSession, broadcast: Broadcast) -> Broadcast:
        """Send a broadcast to all followers using LINE Broadcast API."""
        if broadcast.status not in (BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED):
            raise ValueError(f"Cannot send broadcast in status {broadcast.status}")

        claimed_version = self._version(broadcast)
        messages = await self._build_messages(broadcast, db)
        if not messages:
            await self._mark_invalid(db, broadcast, expected_version=claimed_version)
            raise BroadcastValidationError("Broadcast has no valid messages to send")

        # Atomic claim: exactly one sender may flip DRAFT/SCHEDULED to SENDING.
        # The version guard pins the payload being sent; the lease token proves
        # later writes still belong to us.
        lease_owner = str(broadcast.id)
        claimed = await db.execute(
            update(Broadcast)
            .where(
                Broadcast.id == broadcast.id,
                Broadcast.status.in_(
                    [BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED]
                ),
                Broadcast.payload_version == claimed_version,
            )
            .values(status=BroadcastStatus.SENDING, send_lease_owner=lease_owner)
        )
        if claimed.rowcount != 1:
            raise BroadcastClaimConflict(
                f"Cannot send broadcast {broadcast.id}: "
                "claimed by a concurrent send"
            )
        await db.commit()
        broadcast = await self.get_broadcast(db, broadcast.id)
        if broadcast is None:
            raise BroadcastClaimConflict(
                f"Cannot send broadcast {broadcast.id}: claimed row disappeared"
            )
        await db.refresh(broadcast)
        if (
            broadcast.status != BroadcastStatus.SENDING
            or broadcast.send_lease_owner != lease_owner
            or self._version(broadcast) != claimed_version
        ):
            raise BroadcastClaimConflict(
                f"Cannot send broadcast {broadcast.id}: send lease lost"
            )

        # Rebuild after the claim from the claimed version. A stale edit
        # cannot change the outbound payload once the claim is committed.
        messages = await self._build_messages(broadcast, db)
        if not messages:
            await self._mark_invalid(
                db, broadcast, lease_owner, expected_version=claimed_version
            )
            raise BroadcastValidationError("Broadcast has no valid messages to send")

        provider_attempted: list[bool] = []
        try:
            if broadcast.target_audience == "all":
                outcome = await self._send_chunk(
                    db, broadcast, messages, 0, [], lease_owner,
                    provider_attempted,
                )
                if outcome == "accepted":
                    await self._finalize(db, broadcast, BroadcastStatus.COMPLETED, lease_owner)
                elif outcome == "definite":
                    broadcast.failure_count = 1
                    await self._finalize(db, broadcast, BroadcastStatus.FAILED, lease_owner)
                else:
                    await self._finalize(db, broadcast, BroadcastStatus.UNKNOWN, lease_owner)
            else:
                user_ids = broadcast.target_filter.get("user_ids", [])
                if not user_ids:
                    await self._finalize(db, broadcast, BroadcastStatus.FAILED, lease_owner)
                    logger.error("Broadcast %s has no target user IDs", broadcast.id)
                else:
                    sent = 0
                    failed = 0
                    unknown = 0
                    for i in range(0, len(user_ids), 500):
                        chunk = user_ids[i : i + 500]
                        hashes = [hashlib.sha256(token.encode()).hexdigest() for token in chunk]
                        outcome = await self._send_chunk(
                            db, broadcast, messages, i // 500, hashes, lease_owner,
                            provider_attempted,
                        )
                        if outcome == "accepted":
                            sent += len(chunk)
                        elif outcome == "definite":
                            failed += len(chunk)
                            for token_hash in hashes:
                                db.add(BroadcastFailedRecipient(
                                    broadcast_id=broadcast.id,
                                    token_hash=token_hash,
                                    attempt_count=SEND_ATTEMPT_LIMIT,
                                ))
                        else:
                            unknown += len(chunk)

                        await self._persist_progress(
                            db, broadcast, sent, failed, lease_owner
                        )

                    status = (
                        BroadcastStatus.UNKNOWN if unknown
                        else BroadcastStatus.COMPLETED if failed == 0
                        else BroadcastStatus.FAILED
                    )
                    broadcast.total_recipients = len(user_ids)
                    broadcast.success_count = sent
                    broadcast.failure_count = failed
                    await self._finalize(db, broadcast, status, lease_owner)

            logger.info(
                "Broadcast %s finished: success=%s, failed=%s",
                broadcast.id, broadcast.success_count, broadcast.failure_count,
            )
        except asyncio.CancelledError:
            # Before the provider call cancellation is a definite non-send.
            # After the call started, acceptance is unknown: leave SENDING
            # and the durable ATTEMPTING/ACCEPTED row for reconciliation.
            if not provider_attempted:
                try:
                    await self._finalize(
                        db, broadcast, BroadcastStatus.FAILED, lease_owner
                    )
                except BroadcastClaimConflict:
                    pass
            raise
        except BroadcastClaimConflict:
            raise
        except Exception as exc:
            logger.error("Broadcast %s failed: %s", broadcast.id, exc)
            await self._finalize(db, broadcast, BroadcastStatus.UNKNOWN, lease_owner)

        await db.refresh(broadcast)
        return broadcast

    async def schedule_broadcast(
        self, db: AsyncSession, broadcast: Broadcast, scheduled_at: datetime
    ) -> Broadcast:
        if broadcast.status != BroadcastStatus.DRAFT:
            raise ValueError(f"Cannot schedule broadcast in status {broadcast.status}")

        now = datetime.now(timezone.utc)
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        if scheduled_at <= now:
            raise ValueError("scheduled_at must be in the future")

        result = await db.execute(
            update(Broadcast)
            .where(
                Broadcast.id == broadcast.id,
                Broadcast.status == BroadcastStatus.DRAFT,
                Broadcast.payload_version == self._version(broadcast),
            )
            .values(
                status=BroadcastStatus.SCHEDULED,
                scheduled_at=scheduled_at,
                payload_version=Broadcast.payload_version + 1,
            )
        )
        if result.rowcount != 1:
            raise BroadcastClaimConflict(
                f"Cannot schedule broadcast {broadcast.id}: status changed, refresh and try again"
            )
        broadcast.status = BroadcastStatus.SCHEDULED
        broadcast.scheduled_at = scheduled_at
        broadcast.payload_version = self._version(broadcast) + 1
        await db.commit()
        await db.refresh(broadcast)
        return broadcast

    async def cancel_broadcast(self, db: AsyncSession, broadcast: Broadcast) -> Broadcast:
        if broadcast.status in (BroadcastStatus.COMPLETED, BroadcastStatus.FAILED):
            raise ValueError(f"Cannot cancel broadcast in status {broadcast.status}")
        # Same compare-and-swap as the send claim: only DRAFT/SCHEDULED may
        # become CANCELLED. A sender that already claimed SENDING wins; the
        # stale cancel sees rowcount 0 and must not overwrite the final status.
        claimed = await db.execute(
            update(Broadcast)
            .where(
                Broadcast.id == broadcast.id,
                Broadcast.status.in_(
                    [BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED]
                ),
                Broadcast.payload_version == self._version(broadcast),
            )
            .values(
                status=BroadcastStatus.CANCELLED,
                scheduled_at=None,
                payload_version=Broadcast.payload_version + 1,
            )
        )
        if claimed.rowcount != 1:
            raise BroadcastClaimConflict(
                f"Cannot cancel broadcast {broadcast.id}: "
                "send already started or status changed"
            )
        await db.commit()
        broadcast.status = BroadcastStatus.CANCELLED
        broadcast.scheduled_at = None
        broadcast.payload_version = self._version(broadcast) + 1
        await db.refresh(broadcast)
        return broadcast

    async def get_due_scheduled(self, db: AsyncSession, limit: int = 20) -> List[Broadcast]:
        """Fetch scheduled broadcasts whose send time has arrived.

        ``SELECT ... FOR UPDATE SKIP LOCKED`` lets concurrent pollers claim rows
        without blocking each other. The durable double-send guard is the
        ``SCHEDULED -> SENDING`` transition in ``send_broadcast`` (a row not in
        SCHEDULED is rejected), so a row never sends twice across poll cycles even
        after the lock is released on commit.
        """
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(Broadcast)
            .where(
                Broadcast.status == BroadcastStatus.SCHEDULED,
                Broadcast.scheduled_at.isnot(None),
                Broadcast.scheduled_at <= now,
            )
            .order_by(Broadcast.scheduled_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        return list(result.scalars().all())

    @staticmethod
    def _reconcilable_condition(older_than_seconds: int):
        """Shared eligibility rule for stale listing and operator resolution.

        SENDING rows need a stale cutoff because a sender may still be alive.
        UNKNOWN is terminal with no lease holder, so it is resolvable at once.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=older_than_seconds)
        return or_(
            and_(
                Broadcast.status == BroadcastStatus.SENDING,
                Broadcast.updated_at <= cutoff,
            ),
            Broadcast.status == BroadcastStatus.UNKNOWN,
        ).self_group()

    async def get_stale_sending(
        self, db: AsyncSession, *, older_than_seconds: int = STALE_SENDING_SECONDS,
        limit: int = 50,
    ) -> List[Broadcast]:
        result = await db.execute(
            select(Broadcast)
            .where(self._reconcilable_condition(older_than_seconds))
            .order_by(Broadcast.updated_at)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_stale_sending_page(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 50,
        older_than_seconds: int = STALE_SENDING_SECONDS,
    ) -> tuple[List[Broadcast], int]:
        condition = self._reconcilable_condition(older_than_seconds)
        total = (
            await db.execute(select(func.count(Broadcast.id)).where(condition))
        ).scalar_one()
        result = await db.execute(
            select(Broadcast)
            .where(condition)
            .order_by(Broadcast.updated_at, Broadcast.id)
            .limit(limit)
            .offset(skip)
        )
        return list(result.scalars().all()), total

    async def reconcile_stale_sending(
        self, db: AsyncSession, broadcast: Broadcast, outcome: str,
        *, older_than_seconds: int = STALE_SENDING_SECONDS,
    ) -> Broadcast:
        """Operator resolution of an unknown provider outcome."""
        if outcome not in ("completed", "failed"):
            raise ValueError("outcome must be completed or failed")
        result = await db.execute(
            update(Broadcast)
            .where(
                Broadcast.id == broadcast.id,
                self._reconcilable_condition(older_than_seconds),
            )
            .values(
                status=BroadcastStatus.COMPLETED if outcome == "completed" else BroadcastStatus.FAILED,
                sent_at=datetime.now(timezone.utc) if outcome == "completed" else None,
                send_lease_owner=None,
            )
        )
        if result.rowcount != 1:
            raise BroadcastClaimConflict(
                f"Cannot resolve broadcast {broadcast.id}: not stale or status changed"
            )
        broadcast.status = BroadcastStatus.COMPLETED if outcome == "completed" else BroadcastStatus.FAILED
        broadcast.sent_at = datetime.now(timezone.utc) if outcome == "completed" else None
        broadcast.send_lease_owner = None
        await db.commit()
        await db.refresh(broadcast)
        return broadcast

    async def _mark_invalid(
        self,
        db: AsyncSession,
        broadcast,
        lease_owner: Optional[str] = None,
        *,
        expected_version: Optional[int] = None,
    ) -> None:
        query = (
            update(Broadcast)
            .where(Broadcast.id == broadcast.id)
            .values(status=BroadcastStatus.INVALID, send_lease_owner=None)
        )
        if expected_version is not None:
            query = query.where(Broadcast.payload_version == expected_version)
        if lease_owner is None:
            query = query.where(
                Broadcast.status.in_([BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED])
            )
        else:
            query = query.where(
                Broadcast.status == BroadcastStatus.SENDING,
                Broadcast.send_lease_owner == lease_owner,
            )
        result = await db.execute(query)
        if result.rowcount != 1:
            raise BroadcastClaimConflict(
                f"Cannot mark broadcast {broadcast.id} invalid: payload changed"
            )
        await db.commit()
        broadcast.status = BroadcastStatus.INVALID
        broadcast.send_lease_owner = None

    @staticmethod
    def _is_accepted_retry(exc: Exception) -> bool:
        """LINE can answer 409 with the original acceptance id on a retry."""
        if getattr(exc, "status", None) != 409:
            return False
        headers = getattr(exc, "headers", None) or {}
        return any(
            str(key).lower() == "x-line-accepted-request-id" and bool(value)
            for key, value in dict(headers).items()
        )

    @staticmethod
    def _is_definite_failure(exc: Exception) -> bool:
        """4xx (except rate limit) means LINE refused; other errors are unknown.

        Tests and local adapters may raise a plain exception with a numeric
        ``status`` instead of the SDK type, so classify by the field.
        """
        if BroadcastService._is_accepted_retry(exc):
            return False
        status = getattr(exc, "status", None)
        return isinstance(status, int) and 400 <= status < 500 and status != 429

    async def _record_attempt(
        self,
        db: AsyncSession,
        broadcast: Broadcast,
        chunk_index: int,
        attempt_no: int,
        token_hashes: list[str],
        state: str,
        retry_key: str,
        error: Optional[str] = None,
    ) -> None:
        result = await db.execute(
            select(BroadcastSendAttempt)
            .where(
                BroadcastSendAttempt.broadcast_id == broadcast.id,
                BroadcastSendAttempt.payload_version == broadcast.payload_version,
                BroadcastSendAttempt.chunk_index == chunk_index,
                BroadcastSendAttempt.attempt_no == attempt_no,
            )
        )
        attempt = result.scalars().first()
        if attempt is None:
            db.add(BroadcastSendAttempt(
                broadcast_id=broadcast.id,
                payload_version=broadcast.payload_version,
                chunk_index=chunk_index,
                attempt_no=attempt_no,
                token_hashes=token_hashes,
                token_count=len(token_hashes),
                retry_key=retry_key,
                attempt_state=state,
                last_error=error,
                finished_at=datetime.now(timezone.utc) if state != "ATTEMPTING" else None,
            ))
        else:
            attempt.attempt_state = state
            attempt.last_error = error
            attempt.finished_at = datetime.now(timezone.utc) if state != "ATTEMPTING" else None
        await db.commit()

    async def _send_chunk(
        self,
        db: AsyncSession,
        broadcast: Broadcast,
        messages: list,
        chunk_index: int,
        token_hashes: list[str],
        lease_owner: str,
        provider_attempted: list[bool],
    ) -> str:
        """Return accepted, definite, or unknown; durably log each attempt."""
        retry_key = str(uuid.uuid5(
            _RETRY_NAMESPACE,
            f"{broadcast.id}:{broadcast.payload_version}:{chunk_index}",
        ))
        last_exc: Optional[Exception] = None
        for attempt_no in range(1, SEND_ATTEMPT_LIMIT + 1):
            await self._record_attempt(
                db, broadcast, chunk_index, attempt_no, token_hashes,
                "ATTEMPTING", retry_key,
            )
            try:
                provider_attempted.append(True)
                if broadcast.target_audience == "all":
                    await self.api.broadcast(
                        BroadcastRequest(messages=messages), x_line_retry_key=retry_key,
                    )
                else:
                    await self.api.multicast(
                        MulticastRequest(
                            to=broadcast.target_filter.get("user_ids", [])[chunk_index * 500:(chunk_index + 1) * 500],
                            messages=messages,
                        ),
                        x_line_retry_key=retry_key,
                    )
            except Exception as exc:
                last_exc = exc
                accepted = self._is_accepted_retry(exc)
                definite = self._is_definite_failure(exc)
                state = "ACCEPTED" if accepted else ("DEFINITE_FAIL" if definite else "UNKNOWN")
                await self._record_attempt(
                    db, broadcast, chunk_index, attempt_no, token_hashes,
                    state, retry_key, str(exc),
                )
                if accepted:
                    return "accepted"
                if definite:
                    return "definite"
                if attempt_no < SEND_ATTEMPT_LIMIT:
                    await asyncio.sleep(2 ** (attempt_no - 1))
                continue

            await self._record_attempt(
                db, broadcast, chunk_index, attempt_no, token_hashes,
                "ACCEPTED", retry_key,
            )
            return "accepted"

        logger.warning(
            "Broadcast %s chunk %s outcome unknown after %s attempts: %s",
            broadcast.id, chunk_index, SEND_ATTEMPT_LIMIT, last_exc,
        )
        return "unknown"

    async def _finalize(
        self,
        db: AsyncSession,
        broadcast: Broadcast,
        status: BroadcastStatus,
        lease_owner: str,
    ) -> None:
        result = await db.execute(
            update(Broadcast)
            .where(
                Broadcast.id == broadcast.id,
                Broadcast.status == BroadcastStatus.SENDING,
                Broadcast.send_lease_owner == lease_owner,
            )
            .values(
                status=status,
                sent_at=datetime.now(timezone.utc) if status == BroadcastStatus.COMPLETED else broadcast.sent_at,
                success_count=broadcast.success_count,
                failure_count=broadcast.failure_count,
                total_recipients=broadcast.total_recipients,
                send_lease_owner=None,
            )
        )
        if result.rowcount != 1:
            raise BroadcastClaimConflict(
                f"Cannot finalize broadcast {broadcast.id}: send lease lost"
            )
        broadcast.status = status
        broadcast.send_lease_owner = None
        if status == BroadcastStatus.COMPLETED:
            broadcast.sent_at = datetime.now(timezone.utc)
        await db.commit()

    async def _persist_progress(
        self,
        db: AsyncSession,
        broadcast: Broadcast,
        sent: int,
        failed: int,
        lease_owner: str,
    ) -> None:
        result = await db.execute(
            update(Broadcast)
            .where(
                Broadcast.id == broadcast.id,
                Broadcast.status == BroadcastStatus.SENDING,
                Broadcast.send_lease_owner == lease_owner,
            )
            .values(success_count=sent, failure_count=failed)
        )
        if result.rowcount != 1:
            raise BroadcastClaimConflict(
                f"Cannot persist broadcast {broadcast.id} progress: send lease lost"
            )
        broadcast.success_count = sent
        broadcast.failure_count = failed
        await db.commit()

    async def get_broadcast_stats(self, db: AsyncSession) -> dict:
        """Return aggregate stats across all broadcasts."""
        result = await db.execute(
            select(
                func.count(Broadcast.id).label("total"),
                func.count(Broadcast.id).filter(Broadcast.status == BroadcastStatus.DRAFT).label("draft"),
                func.count(Broadcast.id).filter(Broadcast.status == BroadcastStatus.SCHEDULED).label("scheduled"),
                func.count(Broadcast.id).filter(Broadcast.status == BroadcastStatus.COMPLETED).label("completed"),
                func.count(Broadcast.id).filter(Broadcast.status == BroadcastStatus.FAILED).label("failed"),
            )
        )
        row = result.one()
        return row._asdict()


broadcast_service = BroadcastService()
