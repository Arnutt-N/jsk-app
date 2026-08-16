"""
Unit tests for live_chat_service.py:
- claim_session logic
- close_session logic
- get_active_session logic
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from types import SimpleNamespace
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.services.live_chat_service import LiveChatService
from app.models.chat_session import SessionStatus, ClosedBy
from app.models.user import UserRole
from app.services.credential_service import credential_service

from tests.identity_helpers import make_line_user_fields


@pytest.fixture
def live_chat_service():
    return LiveChatService()


class TestClaimSession:
    """Test claim_session method"""

    @pytest.mark.asyncio
    async def test_claim_waiting_session(self, live_chat_service):
        """Should claim WAITING session and set to ACTIVE"""
        # Create mock session
        mock_session = MagicMock()
        mock_session.id = 10
        mock_session.status = SessionStatus.WAITING
        mock_session.operator_id = None
        mock_session.claimed_at = None

        # Mock DB
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.rowcount = 1
        mock_db.execute.return_value = mock_result
        mock_db.get.return_value = mock_session

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get, \
             patch('app.services.live_chat_service.sla_service') as mock_sla:
            mock_sla.check_queue_wait_on_claim = AsyncMock()
            mock_get.return_value = mock_session
            result = await live_chat_service.claim_session("Utest", 1, mock_db)

            assert result == mock_session
            mock_db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_claim_nonexistent_session(self, live_chat_service):
        """Should return None if no session exists"""
        mock_db = AsyncMock()

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = None
            result = await live_chat_service.claim_session("Utest", 1, mock_db)

            assert result is None
            mock_db.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_claim_already_active_session(self, live_chat_service):
        """Should raise conflict for already ACTIVE session"""
        # Create mock session that is already ACTIVE
        mock_session = MagicMock()
        mock_session.status = SessionStatus.ACTIVE
        mock_session.operator_id = 5
        mock_session.claimed_at = datetime.now(timezone.utc)

        mock_db = AsyncMock()

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_session
            with pytest.raises(HTTPException) as exc:
                await live_chat_service.claim_session("Utest", 1, mock_db)
            assert exc.value.status_code == 409


class TestInitiateHandoff:
    """Test handoff session creation guards"""

    @pytest.mark.asyncio
    async def test_initiate_handoff_reuses_existing_open_session(self, live_chat_service):
        mock_user = MagicMock()
        mock_user.id = 1
        mock_user.line_user_id_encrypted = credential_service.encrypt_line_id("Utest")
        mock_user.chat_mode = "BOT"
        mock_session = MagicMock()
        mock_db = AsyncMock()

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get, \
             patch('app.services.live_chat_service.business_hours_service.is_within_business_hours', new_callable=AsyncMock) as mock_hours, \
             patch('app.services.live_chat_service.line_service.reply_text', new_callable=AsyncMock) as mock_reply:
            mock_get.return_value = mock_session

            result = await live_chat_service.initiate_handoff(
                mock_user,
                "reply-token",
                mock_db,
            )

        assert result == mock_session
        assert mock_user.chat_mode == "HUMAN"
        mock_db.commit.assert_awaited_once()
        mock_hours.assert_not_awaited()
        mock_reply.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_initiate_handoff_race_adopts_winner_session(self, live_chat_service):
        """Losing the open-session unique-index race must not poison the caller's
        transaction: the savepoint rolls back, the winner's session is adopted,
        and no duplicate greeting is sent."""
        mock_user = MagicMock()
        mock_user.id = 1
        mock_user.line_user_id_encrypted = credential_service.encrypt_line_id("Utest")
        mock_user.chat_mode = "BOT"
        winner_session = MagicMock()

        mock_db = AsyncMock()
        # Real AsyncSession.begin_nested() is a sync call returning an async CM
        mock_db.begin_nested = MagicMock()
        mock_db.flush.side_effect = IntegrityError("stmt", {}, Exception("duplicate"))

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get, \
             patch('app.services.live_chat_service.business_hours_service.is_within_business_hours', new_callable=AsyncMock) as mock_hours, \
             patch('app.services.live_chat_service.line_service.reply_text', new_callable=AsyncMock) as mock_reply:
            mock_hours.return_value = True
            # First call: pre-check sees no open session; second call: re-fetch
            # after the IntegrityError finds the concurrent winner's session.
            mock_get.side_effect = [None, winner_session]

            result = await live_chat_service.initiate_handoff(
                mock_user,
                "reply-token",
                mock_db,
            )

        assert result == winner_session
        assert mock_user.chat_mode == "HUMAN"
        mock_db.commit.assert_awaited_once()
        mock_reply.assert_not_awaited()


class TestCloseSession:
    """Test close_session method"""

    @pytest.mark.asyncio
    async def test_close_active_session(self, live_chat_service):
        """Should close session and set CLOSED status"""
        mock_session = MagicMock()
        mock_session.status = SessionStatus.ACTIVE
        mock_session.operator_id = 1
        mock_session.closed_at = None
        mock_session.closed_by = None

        mock_user = MagicMock()
        mock_user.chat_mode = "HUMAN"

        mock_db = AsyncMock()

        # Mock execute for user query
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db.execute.return_value = mock_result

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get, \
             patch('app.services.live_chat_service.sla_service') as mock_sla:
            mock_sla.check_resolution_on_close = AsyncMock()
            mock_get.return_value = mock_session
            with patch('app.services.csat_service.csat_service') as mock_csat:
                mock_csat.send_survey = AsyncMock()
                result = await live_chat_service.close_session(
                    "Utest", ClosedBy.OPERATOR, mock_db, operator_id=1
                )

            assert result == mock_session
            assert mock_session.status == SessionStatus.CLOSED
            assert mock_session.closed_at is not None
            assert mock_session.closed_by == ClosedBy.OPERATOR

    @pytest.mark.asyncio
    async def test_close_nonexistent_session(self, live_chat_service):
        """Should handle case where no active session exists"""
        mock_user = MagicMock()
        mock_user.chat_mode = "HUMAN"

        mock_db = AsyncMock()

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get, \
             patch('app.services.live_chat_service.sla_service') as mock_sla:
            mock_sla.check_resolution_on_close = AsyncMock()
            mock_get.return_value = None
            result = await live_chat_service.close_session("Utest", ClosedBy.OPERATOR, mock_db, operator_id=1)

            assert result is None
            mock_db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_close_session_rejects_non_owner(self, live_chat_service):
        """Should reject attempts from non-owning operators"""
        mock_session = MagicMock()
        mock_session.status = SessionStatus.ACTIVE
        mock_session.operator_id = 2

        mock_db = AsyncMock()

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_session
            with pytest.raises(HTTPException) as exc:
                await live_chat_service.close_session("Utest", ClosedBy.OPERATOR, mock_db, operator_id=1)
            assert exc.value.status_code == 403


class TestTransferSession:
    """Test transfer_session method"""

    @pytest.mark.asyncio
    async def test_transfer_session_updates_owner(self, live_chat_service):
        mock_session = MagicMock()
        mock_session.id = 99
        mock_session.status = SessionStatus.ACTIVE
        mock_session.operator_id = 1
        mock_session.transfer_count = 2
        mock_session.transfer_reason = None

        mock_target = MagicMock()
        mock_target.role = UserRole.ADMIN

        mock_db = AsyncMock()
        mock_db.get.return_value = mock_target

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_session
            result = await live_chat_service.transfer_session(
                "Utest",
                from_operator_id=1,
                to_operator_id=7,
                reason="handoff",
                db=mock_db,
            )

        assert result == mock_session
        assert mock_session.operator_id == 7
        assert mock_session.transfer_count == 3
        assert mock_session.transfer_reason == "handoff"
        assert mock_session.last_activity_at is not None

    @pytest.mark.asyncio
    async def test_transfer_session_rejects_non_owner(self, live_chat_service):
        mock_session = MagicMock()
        mock_session.id = 99
        mock_session.status = SessionStatus.ACTIVE
        mock_session.operator_id = 2

        mock_db = AsyncMock()

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_session
            with pytest.raises(ValueError) as exc:
                await live_chat_service.transfer_session(
                    "Utest",
                    from_operator_id=1,
                    to_operator_id=7,
                    reason=None,
                    db=mock_db,
                )

        assert "Only the current operator" in str(exc.value)

    # -------------------------------------------------------------------
    # NEW-3: transfer target gate respects KEY_ACCESS_LIVE_CHAT
    # (DB-configurable). DEFAULT_POLICY = {SUPER_ADMIN, ADMIN, AGENT}.
    # -------------------------------------------------------------------

    @pytest.mark.asyncio
    async def test_transfer_session_rejects_director_target_under_default(self, live_chat_service):
        """DIRECTOR target rejected under DEFAULT_POLICY (not in access_live_chat)."""
        from app.core.permissions import invalidate_cache

        invalidate_cache()  # ensure DEFAULT_POLICY applies
        mock_session = MagicMock()
        mock_session.id = 99
        mock_session.status = SessionStatus.ACTIVE
        mock_session.operator_id = 1
        mock_session.transfer_count = 0
        mock_session.transfer_reason = None

        mock_target = MagicMock()
        mock_target.role = UserRole.DIRECTOR  # not in DEFAULT_POLICY

        mock_db = AsyncMock()
        mock_db.get.return_value = mock_target

        try:
            with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get:
                mock_get.return_value = mock_session
                with pytest.raises(ValueError) as exc:
                    await live_chat_service.transfer_session(
                        "Utest",
                        from_operator_id=1,
                        to_operator_id=7,
                        reason="handoff",
                        db=mock_db,
                    )
            # TRANSFER_ERR_INVALID_TARGET raised by the can() check
            from app.services.live_chat_service import TRANSFER_ERR_INVALID_TARGET
            assert str(exc.value) == TRANSFER_ERR_INVALID_TARGET
        finally:
            invalidate_cache()

    @pytest.mark.asyncio
    async def test_transfer_session_accepts_director_target_when_db_grants(self, live_chat_service):
        """After a DB grant, DIRECTOR target passes the transfer gate."""
        from app.core import permissions as perms_module
        from app.core.permissions import KEY_ACCESS_LIVE_CHAT, invalidate_cache

        try:
            invalidate_cache()
            perms_module._policy_cache = {
                **perms_module.DEFAULT_POLICY,
                KEY_ACCESS_LIVE_CHAT: frozenset({
                    UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AGENT, UserRole.DIRECTOR,
                }),
            }

            mock_session = MagicMock()
            mock_session.id = 99
            mock_session.status = SessionStatus.ACTIVE
            mock_session.operator_id = 1
            mock_session.transfer_count = 0
            mock_session.transfer_reason = None

            mock_target = MagicMock()
            mock_target.role = UserRole.DIRECTOR  # now granted via DB

            mock_db = AsyncMock()
            mock_db.get.return_value = mock_target

            with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get:
                mock_get.return_value = mock_session
                result = await live_chat_service.transfer_session(
                    "Utest",
                    from_operator_id=1,
                    to_operator_id=7,
                    reason="handoff to supervisor",
                    db=mock_db,
                )

            assert result == mock_session
            assert mock_session.operator_id == 7
        finally:
            invalidate_cache()  # restore DEFAULT_POLICY for later tests


class TestSendMessageOwnership:
    """Test outbound message ownership checks"""

    @pytest.mark.asyncio
    async def test_send_message_rejects_non_owner(self, live_chat_service):
        mock_session = MagicMock()
        mock_session.status = SessionStatus.ACTIVE
        mock_session.operator_id = 2

        mock_db = AsyncMock()

        with patch.object(live_chat_service, 'get_active_session', new_callable=AsyncMock) as mock_get, \
             patch('app.services.live_chat_service.line_service.push_messages', new_callable=AsyncMock) as mock_push, \
             patch('app.services.live_chat_service.line_service.save_message', new_callable=AsyncMock) as mock_save:
            mock_get.return_value = mock_session
            with pytest.raises(HTTPException) as exc:
                await live_chat_service.send_message("Utest", "hello", 1, mock_db)
            assert exc.value.status_code == 403
            mock_push.assert_not_awaited()
            mock_save.assert_not_awaited()


class TestGetActiveSession:
    """Test get_active_session method"""

    @pytest.mark.asyncio
    async def test_returns_waiting_session(self, live_chat_service):
        """Should return WAITING session"""
        mock_session = MagicMock()
        mock_session.status = SessionStatus.WAITING

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_session
        mock_db.execute.return_value = mock_result

        result = await live_chat_service.get_active_session("Utest", mock_db)

        assert result == mock_session

    @pytest.mark.asyncio
    async def test_returns_active_session(self, live_chat_service):
        """Should return ACTIVE session"""
        mock_session = MagicMock()
        mock_session.status = SessionStatus.ACTIVE

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_session
        mock_db.execute.return_value = mock_result

        result = await live_chat_service.get_active_session("Utest", mock_db)

        assert result == mock_session

    @pytest.mark.asyncio
    async def test_returns_none_when_no_session(self, live_chat_service):
        """Should return None when no active session"""
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        result = await live_chat_service.get_active_session("Utest", mock_db)

        assert result is None


class TestSearchMessages:
    """Test search_messages method"""

    @pytest.mark.asyncio
    async def test_search_messages_returns_formatted_items(self, live_chat_service):
        mock_message = MagicMock()
        mock_message.id = 101
        mock_message.user_id = 5
        mock_message.content = "hello world"
        mock_message.direction = MagicMock(value="INCOMING")
        mock_message.sender_role = None
        mock_message.created_at = datetime.now(timezone.utc)

        mock_db = AsyncMock()
        search_result = MagicMock()
        search_result.all.return_value = [(mock_message, "Tester")]
        decrypt_result = MagicMock()
        decrypt_result.all.return_value = [
            (5, credential_service.encrypt_line_id("Uabc"))
        ]
        mock_db.execute.side_effect = [search_result, decrypt_result]

        items = await live_chat_service.search_messages("hello", mock_db)
        assert len(items) == 1
        assert items[0]["id"] == 101
        assert items[0]["line_user_id"] == "Uabc"
        assert items[0]["display_name"] == "Tester"


class TestUnreadCount:
    """Test unread count helper"""

    @pytest.mark.asyncio
    async def test_unread_count_uses_read_marker(self, live_chat_service):
        mock_db = AsyncMock()
        mock_db.scalar.return_value = 3

        with patch('app.services.live_chat_service.redis_client.get', new_callable=AsyncMock) as mock_get, \
             patch('app.services.live_chat_service.unread.resolve_by_line_id', new_callable=AsyncMock) as mock_resolve:
            mock_get.return_value = datetime.now(timezone.utc).isoformat()
            mock_resolve.return_value = None
            count = await live_chat_service.get_unread_count("Utest", 1, mock_db)
            assert count == 3
            mock_db.scalar.assert_called_once()

    @pytest.mark.asyncio
    async def test_unread_count_without_read_marker(self, live_chat_service):
        mock_db = AsyncMock()
        mock_db.scalar.return_value = 5

        with patch('app.services.live_chat_service.redis_client.get', new_callable=AsyncMock) as mock_get, \
             patch('app.services.live_chat_service.unread.resolve_by_line_id', new_callable=AsyncMock) as mock_resolve:
            mock_get.return_value = None
            mock_resolve.return_value = None
            count = await live_chat_service.get_unread_count("Utest", 1, mock_db)
            assert count == 5

    @pytest.mark.asyncio
    async def test_get_unread_counts_batches_queries(self, live_chat_service):
        mock_db = AsyncMock()

        # 1st execute: resolve_many_by_line_id maps raw LINE IDs -> user.id
        resolve_result = MagicMock()
        resolve_result.scalars.return_value.all.return_value = [
            SimpleNamespace(id=11, **make_line_user_fields("Uno-marker")),
            SimpleNamespace(id=12, **make_line_user_fields("Uwith-marker")),
            SimpleNamespace(id=13, **make_line_user_fields("Ubad-marker")),
        ]
        # 2nd execute: unread counts grouped by user_id (no read markers)
        no_marker_result = MagicMock()
        no_marker_result.all.return_value = [(11, 4), (13, 1)]
        # 3rd execute: unread counts grouped by user_id (with read markers)
        with_marker_result = MagicMock()
        with_marker_result.all.return_value = [(12, 2)]
        mock_db.execute.side_effect = [
            resolve_result,
            no_marker_result,
            with_marker_result,
        ]

        with patch('app.services.live_chat_service.redis_client.mget', new_callable=AsyncMock) as mock_mget:
            mock_mget.return_value = [
                None,
                datetime.now(timezone.utc).isoformat(),
                "invalid-timestamp",
            ]
            counts = await live_chat_service.get_unread_counts(
                ["Uno-marker", "Uwith-marker", "Ubad-marker"],
                1,
                mock_db,
            )

        assert counts == {
            "Uno-marker": 4,
            "Uwith-marker": 2,
            "Ubad-marker": 1,
        }
        assert mock_db.execute.call_count == 3
