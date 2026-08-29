"""Logging helpers for PII redaction.

All log statements that touch LINE user IDs or phone numbers MUST use
these helpers so plaintext PII never appears in logs.
"""


def mask_line_id(line_user_id: str) -> str:
    """Return a truncated/masked form of a LINE user ID safe for logging.

    Shows first 6 chars + '…' so operators can still correlate entries
    without exposing the full identifier.
    """
    if not line_user_id:
        return "<empty>"
    if len(line_user_id) <= 6:
        return line_user_id[:3] + "…"
    return line_user_id[:6] + "…"


def mask_phone(phone: str) -> str:
    """Redact a phone number for safe logging (e.g. '0812345678' -> '081***5678')."""
    if not phone:
        return "<empty>"
    digits = phone.strip()
    if len(digits) < 6:
        return digits[:2] + "***"
    return digits[:3] + "***" + digits[-4:]
