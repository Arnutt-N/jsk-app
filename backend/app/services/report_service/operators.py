"""Operator report queries."""
from datetime import datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_session import ChatSession
from app.models.message import Message, MessageDirection
from app.models.user import User


class OperatorReportMixin:

    async def get_operator_report(
        self, start: datetime, end: datetime, db: AsyncSession
    ) -> dict:
        sessions_q = (
            select(
                ChatSession.operator_id,
                User.display_name,
                func.count(ChatSession.id).label("sessions_handled"),
                func.avg(
                    func.extract("epoch", ChatSession.first_response_at - ChatSession.started_at)
                ).label("avg_response_seconds"),
            )
            .join(User, ChatSession.operator_id == User.id)
            .where(
                ChatSession.operator_id.isnot(None),
                ChatSession.started_at >= start,
                ChatSession.started_at < end,
            )
            .group_by(ChatSession.operator_id, User.display_name)
            .order_by(text("sessions_handled DESC"))
        )
        rows = (await db.execute(sessions_q)).all()

        operator_ids = [row.operator_id for row in rows]
        msg_by_operator: dict[int, int] = {}
        if operator_ids:
            op_msg_q = (
                select(
                    ChatSession.operator_id,
                    func.count(Message.id).label("msg_count"),
                )
                .join(
                    Message,
                    (Message.line_user_id == ChatSession.line_user_id)
                    & (Message.created_at >= ChatSession.started_at)
                    & ((Message.created_at <= ChatSession.closed_at) | (ChatSession.closed_at.is_(None))),
                )
                .where(
                    ChatSession.operator_id.in_(operator_ids),
                    ChatSession.started_at >= start,
                    ChatSession.started_at < end,
                    Message.direction == MessageDirection.OUTGOING,
                    Message.sender_role == "ADMIN",
                )
                .group_by(ChatSession.operator_id)
            )
            op_msg_rows = (await db.execute(op_msg_q)).all()
            msg_by_operator = {oid: cnt for oid, cnt in op_msg_rows}

        operators = [
            {
                "operator_id": row.operator_id,
                "operator_name": row.display_name or f"Operator #{row.operator_id}",
                "sessions_handled": row.sessions_handled,
                "avg_response_seconds": round(float(row.avg_response_seconds or 0), 1),
                "messages_sent": msg_by_operator.get(row.operator_id, 0),
            }
            for row in rows
        ]

        return {"operators": operators}
