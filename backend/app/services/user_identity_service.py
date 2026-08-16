"""LINE user ID pseudonymization: identity resolution + crypto helpers.

Free functions taking ``db: AsyncSession`` (mirror ``create_audit_log`` style).
Caller owns the commit; this module only flushes.

Contract phase (PR C): the plaintext ``line_user_id`` column is dropped from
all tables. Resolution is hash-only (no legacy fallback), decryption is
fail-loud, and child-table queries always go through the ``user_id`` FK.

Design: ``resolve_by_line_id`` does NOT create users. User creation (with LINE
profile fetch) stays in ``friend_service.get_or_create_user`` which calls this
module for resolution + surrogate population.
"""
import hashlib
import hmac
import logging
from typing import Optional

from sqlalchemy import false, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.services.credential_service import credential_service

logger = logging.getLogger(__name__)

CURRENT_LINE_KEY_VERSION = 1

_DEV_HMAC_KEY = "dev_line_id_hmac_key_not_for_production"


def _get_hmac_key() -> str:
    key = settings.LINE_ID_HMAC_KEY
    if key:
        return key
    if settings.is_production_like:
        raise RuntimeError("LINE_ID_HMAC_KEY must be set in production")
    if settings.is_remote_database:
        raise RuntimeError(
            "LINE_ID_HMAC_KEY must be set when DATABASE_URL points at a remote "
            "database — the development fallback key would write hashes the "
            "production process cannot resolve."
        )
    return _DEV_HMAC_KEY


def line_id_hash(raw: str) -> str:
    return hmac.new(
        _get_hmac_key().encode(),
        raw.encode(),
        hashlib.sha256,
    ).hexdigest()


def _encrypt_line_id(raw: str) -> str:
    return credential_service.encrypt_line_id(raw)


def _decrypt_line_id(token: str) -> str:
    return credential_service.decrypt_line_id(token)


def populate_surrogate(user: User, raw: str) -> None:
    """Set hash/encrypted/key_version on a User object (caller flushes/commits)."""
    user.line_user_id_hash = line_id_hash(raw)
    user.line_user_id_encrypted = _encrypt_line_id(raw)
    user.line_key_version = CURRENT_LINE_KEY_VERSION


def decrypt_user_line_id(user: User) -> str:
    """Sync fail-loud decrypt of an already-loaded User's raw LINE ID."""
    if not user.line_user_id_encrypted:
        raise RuntimeError(
            f"user {user.id} has no line_user_id_encrypted — "
            "pseudonym contract violated (backfill incomplete?)"
        )
    return _decrypt_line_id(user.line_user_id_encrypted)


async def resolve_by_line_id(db: AsyncSession, raw: str) -> Optional[User]:
    """Find user by HMAC hash. Returns None if unknown (caller should create)."""
    h = line_id_hash(raw)
    result = await db.execute(select(User).where(User.line_user_id_hash == h))
    return result.scalar_one_or_none()


def child_filter(model, line_user_id: str, user_id: Optional[int] = None):
    """WHERE clause for child-table queries via the user_id FK.

    An unresolved user (user_id=None) matches nothing — with the plaintext
    column gone there is no secondary path. Callers must resolve first.
    The ``line_user_id`` argument is kept for caller compatibility (protocol
    boundary value) and is not consulted.
    """
    if user_id is not None:
        return model.user_id == user_id
    return false()


def child_column(model):
    """Identity column for partition_by/group_by/distinct on child tables."""
    return model.user_id


def child_join_condition(parent_model, child_model):
    """JOIN condition between two identity-carrying models via user_id.

    Handles ``User`` as the parent (child ``user_id`` FKs reference ``User.id``)
    as well as child-to-child joins (both sides carry a ``user_id`` FK).
    """
    parent_key = parent_model.id if parent_model is User else parent_model.user_id
    return parent_key == child_model.user_id


def user_identity_filter():
    """'Is a LINE user' existence check on the User table."""
    return User.line_user_id_hash.isnot(None)


async def resolve_many_by_line_id(
    db: AsyncSession, line_user_ids: list[str]
) -> dict[str, int]:
    """Batch-map line_user_id -> user.id via hash IN lookup. Does not create users."""
    if not line_user_ids:
        return {}
    unique_ids = list(dict.fromkeys(line_user_ids))
    mapping: dict[str, int] = {}

    hash_to_raw = {line_id_hash(raw): raw for raw in unique_ids}
    result = await db.execute(
        select(User).where(User.line_user_id_hash.in_(list(hash_to_raw.keys())))
    )
    for user in result.scalars().all():
        raw = hash_to_raw.get(user.line_user_id_hash)
        if raw is not None:
            mapping[raw] = user.id
    return mapping


async def decrypt_line_id_for_user(db: AsyncSession, user_id: int) -> Optional[str]:
    """Decrypt raw LINE ID from users.line_user_id_encrypted (fail-loud if empty).

    Returns None only when the user row itself does not exist.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return None
    return decrypt_user_line_id(user)


async def decrypt_line_ids_for_users(
    db: AsyncSession, user_ids: list[int]
) -> dict[int, str]:
    """Batch-map user.id -> raw LINE ID for response payloads (fail-loud)."""
    if not user_ids:
        return {}
    unique_ids = list(dict.fromkeys(user_ids))
    result = await db.execute(
        select(User.id, User.line_user_id_encrypted).where(User.id.in_(unique_ids))
    )
    mapping: dict[int, str] = {}
    for uid, token in result.all():
        if not token:
            raise RuntimeError(
                f"user {uid} has no line_user_id_encrypted — "
                "pseudonym contract violated (backfill incomplete?)"
            )
        mapping[uid] = _decrypt_line_id(token)
    return mapping
