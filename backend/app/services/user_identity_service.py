"""LINE user ID pseudonymization: identity resolution + crypto helpers.

Free functions taking ``db: AsyncSession`` (mirror ``create_audit_log`` style).
Caller owns the commit; this module only flushes.

Design: ``resolve_by_line_id`` does NOT create users. User creation (with LINE
profile fetch) stays in ``friend_service.get_or_create_user`` which calls this
module for resolution + surrogate population.
"""
import hashlib
import hmac
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.pseudonym_gate import record_fallback_hit
from app.models.user import User
from app.services.credential_service import credential_service

logger = logging.getLogger(__name__)

CURRENT_LINE_KEY_VERSION = 1

_DEV_HMAC_KEY = "dev_line_id_hmac_key_not_for_production"


def _get_hmac_key() -> str:
    key = settings.LINE_ID_HMAC_KEY
    if key:
        return key
    if not settings.is_production_like:
        return _DEV_HMAC_KEY
    raise RuntimeError("LINE_ID_HMAC_KEY must be set in production")


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


async def resolve_by_line_id(db: AsyncSession, raw: str) -> Optional[User]:
    """Find user by HMAC hash; fallback to legacy plaintext column (pre-backfill).

    Returns None if the user does not exist at all (caller should create).
    Lazily populates surrogate fields on legacy users found by plaintext.
    In pseudonym mode, the plaintext fallback is skipped (column is dropped).
    """
    h = line_id_hash(raw)
    result = await db.execute(select(User).where(User.line_user_id_hash == h))
    user = result.scalar_one_or_none()
    if user:
        return user

    if settings.LINE_ID_STORAGE_MODE == "pseudonym":
        return None

    result = await db.execute(select(User).where(User.line_user_id == raw))
    user = result.scalar_one_or_none()
    if user:
        logger.warning(
            "line_id_plaintext_fallback_hit raw=%s user_id=%s — populate_hash=%s",
            raw,
            user.id,
            user.line_user_id_hash is None,
        )
        await record_fallback_hit(raw, user.id)
        try:
            async with db.begin_nested():
                user.line_user_id_hash = h
                user.line_user_id_encrypted = _encrypt_line_id(raw)
                user.line_key_version = CURRENT_LINE_KEY_VERSION
                await db.flush()
        except IntegrityError:
            await db.expire(user)
            result = await db.execute(select(User).where(User.line_user_id_hash == h))
            user = result.scalar_one_or_none()
    return user


def child_filter(model, line_user_id: str, user_id: Optional[int] = None):
    """Return the appropriate WHERE clause for child-table queries based on mode.

    In pseudonym mode with a resolved user_id, filters by FK (integer index).
    Otherwise falls back to the line_user_id string column.
    """
    if settings.LINE_ID_STORAGE_MODE == "pseudonym" and user_id is not None:
        return model.user_id == user_id
    return model.line_user_id == line_user_id


def child_column(model):
    """Mode-aware column for partition_by/group_by/distinct on child tables."""
    if settings.LINE_ID_STORAGE_MODE == "pseudonym":
        return model.user_id
    return model.line_user_id


def child_join_condition(parent_model, child_model):
    """Mode-aware JOIN condition between two identity-carrying models.

    Handles ``User`` as the parent (child ``user_id`` FKs reference ``User.id``)
    as well as child-to-child joins (both sides carry a ``user_id`` FK).
    """
    if settings.LINE_ID_STORAGE_MODE == "pseudonym":
        parent_key = parent_model.id if parent_model is User else parent_model.user_id
        return parent_key == child_model.user_id
    return parent_model.line_user_id == child_model.line_user_id


def user_identity_filter():
    """Mode-aware 'is a LINE user' existence check on the User table."""
    if settings.LINE_ID_STORAGE_MODE == "pseudonym":
        return User.line_user_id_hash.isnot(None)
    return User.line_user_id.isnot(None)


async def resolve_many_by_line_id(
    db: AsyncSession, line_user_ids: list[str]
) -> dict[str, int]:
    """Batch-map line_user_id -> user.id. Hash IN lookup, plaintext fallback for misses.

    Records a gate fallback hit for each id resolved via the plaintext column.
    Does not create users or backfill surrogates (see resolve_by_line_id).
    """
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

    misses = [raw for raw in unique_ids if raw not in mapping]
    if misses and settings.LINE_ID_STORAGE_MODE != "pseudonym":
        result = await db.execute(select(User).where(User.line_user_id.in_(misses)))
        for user in result.scalars().all():
            if user.line_user_id in misses and user.line_user_id not in mapping:
                mapping[user.line_user_id] = user.id
                await record_fallback_hit(user.line_user_id, user.id)
    return mapping


async def decrypt_line_id_for_user(db: AsyncSession, user_id: int) -> Optional[str]:
    """Decrypt raw LINE ID from users.line_user_id_encrypted; fallback to plaintext column."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return None
    if user.line_user_id_encrypted:
        return _decrypt_line_id(user.line_user_id_encrypted)
    return user.line_user_id
