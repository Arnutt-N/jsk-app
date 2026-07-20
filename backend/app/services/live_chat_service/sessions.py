"""Session lifecycle: claim, close, takeover, release, and transfer."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import desc, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit_action
from app.core.permissions import can, KEY_ACCESS_LIVE_CHAT
from app.models.chat_session import ChatSession, ClosedBy, SessionStatus
from app.models.user import ChatMode, User, UserRole

from ._deps import get_sla_service
from .errors import (
    TRANSFER_ERR_INVALID_TARGET,
    TRANSFER_ERR_NO_ACTIVE_SESSION,
    TRANSFER_ERR_NOT_CURRENT_OPERATOR,
    TRANSFER_ERR_TRANSFER_TO_SELF,
)

logger = logging.getLogger(__name__)


class SessionLifecycleMixin:
    @audit_action("claim_session", "chat_session")
    async def claim_session(
        self,
        line_user_id: str,
        operator_id: int,
        db: AsyncSession
    ):
        """Operator claims a chat session"""
        session = await self.get_active_session(line_user_id, db)
        if not session:
            return None
        if session.status != SessionStatus.WAITING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Session already claimed by another operator",
            )

        now = datetime.now(timezone.utc)
        result = await db.execute(
            update(ChatSession)
            .where(
                ChatSession.id == session.id,
                ChatSession.status == SessionStatus.WAITING,
            )
            .values(
                status=SessionStatus.ACTIVE,
                operator_id=operator_id,
                claimed_at=now,
                last_activity_at=now,
            )
        )
        if result.rowcount != 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Session already claimed by another operator",
            )

        refreshed = await db.get(ChatSession, session.id)
        await get_sla_service().check_queue_wait_on_claim(refreshed, db)
        return refreshed

    @audit_action("close_session", "chat_session")
    async def close_session(
        self,
        line_user_id: str,
        closed_by: ClosedBy,
        db: AsyncSession,
        operator_id: Optional[int] = None,
    ):
        """Close a chat session and return to bot mode"""
        session = await self.get_active_session(line_user_id, db)
        if not session or session.status != SessionStatus.ACTIVE:
            return None

        if operator_id is not None and session.operator_id != operator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the claiming operator can close this session",
            )

        session.status = SessionStatus.CLOSED
        session.closed_at = datetime.now(timezone.utc)
        session.closed_by = closed_by

        # Return user to bot mode
        result = await db.execute(select(User).where(User.line_user_id == line_user_id))
        user = result.scalar_one_or_none()
        if user:
            user.chat_mode = ChatMode.BOT

        await get_sla_service().check_resolution_on_close(session, db)

        # Send CSAT survey after closing (non-blocking)
        if session:
            try:
                from app.services.csat_service import csat_service
                await csat_service.send_survey(line_user_id, session.id)
            except Exception as e:
                logger.error(f"Failed to send CSAT survey: {e}")

        return session

    async def _require_active_session_owner(
        self,
        line_user_id: str,
        operator_id: int,
        db: AsyncSession,
    ) -> ChatSession:
        """Load an active session and ensure the operator owns it."""
        session = await self.get_active_session(line_user_id, db)
        if not session or session.status != SessionStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active session not found",
            )
        if session.operator_id != operator_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the claiming operator can respond to this session",
            )
        return session

    async def ensure_operator_session(
        self,
        line_user_id: str,
        operator_id: int,
        db: AsyncSession,
    ) -> ChatSession:
        """Guarantee an ACTIVE session owned by ``operator_id`` (auto-takeover).

        Used when an operator switches a conversation to HUMAN via the header
        toggle: there is no customer-initiated WAITING session to claim, so the
        operator would otherwise be unable to send (send requires an ACTIVE
        session they own — see ``_require_active_session_owner``) and the
        "รับสาย" button never appears (it only shows for WAITING sessions).

        - ACTIVE owned by this operator  -> return as-is (idempotent)
        - ACTIVE owned by someone else    -> 409 (never steal an active handoff)
        - WAITING                         -> claim it (WAITING -> ACTIVE)
        - no open session                 -> create one directly as ACTIVE

        Respects the partial-unique "one open session per line_user_id" index;
        a lost create race is reconciled by re-reading the winning session.
        """
        session = await self.get_active_session(line_user_id, db)
        if session and session.status == SessionStatus.ACTIVE:
            if session.operator_id == operator_id:
                return session
            owner = await db.get(User, session.operator_id) if session.operator_id else None
            owner_name = owner.display_name if owner and owner.display_name else "เจ้าหน้าที่อีกคน"
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{owner_name} กำลังรับเรื่องนี้อยู่ — โอนสายหรือให้ปิดสายก่อน",
            )
        if session and session.status == SessionStatus.WAITING:
            return await self.claim_session(line_user_id, operator_id, db)

        now = datetime.now(timezone.utc)
        new_session = ChatSession(
            line_user_id=line_user_id,
            operator_id=operator_id,
            status=SessionStatus.ACTIVE,
            started_at=now,
            claimed_at=now,
            last_activity_at=now,
        )
        try:
            async with db.begin_nested():
                db.add(new_session)
                await db.flush()
        except IntegrityError:
            existing = await self.get_active_session(line_user_id, db)
            if existing is None:
                raise
            if existing.status == SessionStatus.WAITING:
                return await self.claim_session(line_user_id, operator_id, db)
            if existing.operator_id != operator_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="เจ้าหน้าที่อีกคนกำลังรับเรื่องนี้อยู่",
                )
            return existing
        return new_session

    async def release_operator_session(
        self,
        line_user_id: str,
        operator_id: int,
        db: AsyncSession,
    ) -> Optional[ChatSession]:
        """Close this operator's ACTIVE session when toggling back to BOT.

        Keeps session state consistent with ``chat_mode`` — a lingering ACTIVE
        session would misreport the conversation as operator-handled and block a
        future customer handoff (the one-open-session index). No-op when there
        is no active session, or when another operator owns it (their handoff is
        left untouched rather than erroring the toggle).
        """
        session = await self.get_active_session(line_user_id, db)
        if not session or session.status != SessionStatus.ACTIVE:
            return None
        if session.operator_id != operator_id:
            return None
        return await self.close_session(
            line_user_id, ClosedBy.OPERATOR, db, operator_id=operator_id
        )

    @audit_action("transfer_session", "chat_session")
    async def transfer_session(
        self,
        line_user_id: str,
        from_operator_id: int,
        to_operator_id: int,
        reason: Optional[str],
        db: AsyncSession
    ):
        """Transfer session to another operator."""
        session = await self.get_active_session(line_user_id, db)
        if not session or session.status != SessionStatus.ACTIVE:
            raise ValueError(TRANSFER_ERR_NO_ACTIVE_SESSION)

        if session.operator_id != from_operator_id:
            raise ValueError(TRANSFER_ERR_NOT_CURRENT_OPERATOR)

        if from_operator_id == to_operator_id:
            raise ValueError(TRANSFER_ERR_TRANSFER_TO_SELF)

        # Verify target operator exists and has access_live_chat permission
        # (NEW-3: role check is DB-configurable via the permission matrix;
        # DEFAULT_POLICY = {SUPER_ADMIN, ADMIN, AGENT} preserves today's
        # behavior). Same key as the WS auth gate -- a transfer target must
        # be able to use live-chat, not just be a staff member.
        to_operator = await db.get(User, to_operator_id)
        if not to_operator or not can(to_operator.role, KEY_ACCESS_LIVE_CHAT):
            raise ValueError(TRANSFER_ERR_INVALID_TARGET)

        session.operator_id = to_operator_id
        session.transfer_count = (session.transfer_count or 0) + 1
        session.transfer_reason = reason
        session.last_activity_at = datetime.now(timezone.utc)

        logger.info(f"Session {session.id} transferred from operator {from_operator_id} to {to_operator_id}")
        return session

    async def get_active_session(self, line_user_id: str, db: AsyncSession, lock: bool = False, user_id: int = None):
        """Get active session for user"""
        from app.services.user_identity_service import child_filter

        stmt = (
            select(ChatSession)
            .where(child_filter(ChatSession, line_user_id, user_id))
            .where(ChatSession.status.in_([SessionStatus.WAITING, SessionStatus.ACTIVE]))
            .order_by(desc(ChatSession.started_at))
            .limit(1)
        )
        if lock:
            stmt = stmt.with_for_update()

        result = await db.execute(stmt)
        return result.scalar_one_or_none()
