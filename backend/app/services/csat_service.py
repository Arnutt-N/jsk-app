"""CSAT (Customer Satisfaction) survey service."""
import logging
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from linebot.v3.messaging import FlexMessage, FlexContainer

from app.models.csat_response import CsatResponse
from app.services.line_service import line_service

logger = logging.getLogger(__name__)

THANK_YOU_MESSAGES = {
    1: "ขอบคุณสำหรับความคิดเห็นค่ะ เราจะนำไปปรับปรุงการบริการให้ดียิ่งขึ้น",
    2: "ขอบคุณสำหรับความคิดเห็นค่ะ เราจะพยายามปรับปรุงให้ดีขึ้น",
    3: "ขอบคุณสำหรับความคิดเห็นค่ะ",
    4: "ขอบคุณมากค่ะ ยินดีให้บริการเสมอค่ะ",
    5: "ขอบคุณมากค่ะ ยินดีให้บริการเสมอค่ะ",
}


class CsatService:
    def _build_survey_flex(self, session_id: int) -> dict:
        """Build CSAT survey Flex Message contents."""
        star_buttons = []
        for i in range(1, 6):
            stars = "\u2b50" * i
            star_buttons.append({
                "type": "button",
                "style": "primary" if i >= 4 else "secondary",
                "height": "sm",
                "action": {
                    "type": "postback",
                    "label": stars,
                    "data": f"csat|{session_id}|{i}",
                    "displayText": f"ให้คะแนน {i} ดาว"
                }
            })

        return {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "ขอบคุณที่ใช้บริการค่ะ",
                        "weight": "bold",
                        "size": "lg",
                        "align": "center"
                    },
                    {
                        "type": "text",
                        "text": "กรุณาให้คะแนนความพึงพอใจ",
                        "size": "sm",
                        "color": "#666666",
                        "align": "center",
                        "margin": "md"
                    }
                ]
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "spacing": "sm",
                "contents": [
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "spacing": "sm",
                        "contents": star_buttons[:3]
                    },
                    {
                        "type": "box",
                        "layout": "horizontal",
                        "spacing": "sm",
                        "contents": star_buttons[3:]
                    }
                ]
            }
        }

    async def send_survey(self, line_user_id: str, session_id: int) -> None:
        """Send CSAT survey to LINE user after session closes."""
        try:
            flex_contents = self._build_survey_flex(session_id)
            flex_message = FlexMessage(
                alt_text="กรุณาให้คะแนนความพึงพอใจ",
                contents=FlexContainer.from_dict(flex_contents)
            )
            await line_service.push_messages(line_user_id, [flex_message])
            logger.info(f"CSAT survey sent to {line_user_id} for session {session_id}")
        except Exception as e:
            logger.error(f"Failed to send CSAT survey to {line_user_id}: {e}")

    async def record_response(
        self,
        session_id: int,
        line_user_id: str,
        score: int,
        feedback: Optional[str],
        db: AsyncSession,
        user_id: Optional[int] = None,
    ) -> CsatResponse:
        """Record CSAT response. Prevents duplicates."""
        existing = await db.scalar(
            select(CsatResponse).where(CsatResponse.session_id == session_id)
        )
        if existing:
            return existing

        response = CsatResponse(
            session_id=session_id,
            line_user_id=line_user_id,
            user_id=user_id,
            score=score,
            feedback=feedback,
        )
        db.add(response)
        await db.commit()
        await db.refresh(response)
        logger.info(f"CSAT response recorded: session={session_id}, score={score}")
        return response

    def get_thank_you_message(self, score: int) -> str:
        """Get localized thank-you message based on score."""
        return THANK_YOU_MESSAGES.get(score, "ขอบคุณสำหรับความคิดเห็นค่ะ")


csat_service = CsatService()
