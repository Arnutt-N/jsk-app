"""Shared helpers for building LINE users under the PR C pseudonym contract.

The plaintext ``line_user_id`` column is gone from every model; a User row
carries the pseudonymization surrogate instead (HMAC hash + Fernet token +
key version), and child tables reference the user via the ``user_id`` FK.
Tests that need "a LINE user" build one through these helpers so the
surrogate population stays consistent with production
(``user_identity_service.populate_surrogate``).
"""
from app.services.credential_service import credential_service
from app.services.user_identity_service import CURRENT_LINE_KEY_VERSION, line_id_hash


def make_line_user_fields(raw_id: str) -> dict:
    """Kwargs for constructing a User carrying the pseudonym surrogate.

    Usage: ``User(**make_line_user_fields("Uabc"), display_name="...")`` or
    ``SimpleNamespace(id=1, **make_line_user_fields("Uabc"))``.
    """
    return {
        "line_user_id_hash": line_id_hash(raw_id),
        "line_user_id_encrypted": credential_service.encrypt_line_id(raw_id),
        "line_key_version": CURRENT_LINE_KEY_VERSION,
    }


async def create_line_user(db, raw_id: str, **overrides):
    """Insert a User with populated surrogate fields (flushes, caller commits)."""
    from app.models.user import User

    user = User(**make_line_user_fields(raw_id), **overrides)
    db.add(user)
    await db.flush()
    return user
