"""Server-side refresh-session and WebSocket-ticket logic (P1.1a FR1/FR6).

Free-function module (no class) mirroring `app.core.audit.create_audit_log`'s
style: every function takes `db: AsyncSession` explicitly and only flushes —
callers own the transaction and call `db.commit()` themselves (AUDIT_WRITE
pattern: mutation + audit row committed together by the endpoint).

Only the SHA-256 hash of a refresh JWT's `jti` (or a raw WS ticket) is ever
persisted -- the raw value is never stored, logged, or included in audit
`details`.

Note on `secrets.compare_digest`: every session/ticket lookup below matches
on `token_hash` via an indexed SQL `WHERE` equality (executed by Postgres),
not a Python-level byte comparison of a raw secret -- so there is no
in-process short-circuit timing channel for `compare_digest` to close here
(unlike the CSRF header-vs-cookie comparison in `deps.py`, which IS a
same-process raw-string comparison and does use `compare_digest`).
"""
import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional
from uuid import uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import REFRESH_TOKEN_EXPIRE_DAYS, create_refresh_token
from app.models.auth_session import (
    STATUS_ACTIVE,
    STATUS_REVOKED,
    STATUS_ROTATED,
    AuthSession,
)
from app.models.ws_ticket import WsTicket

# Opportunistic-delete retention windows (PRD open question, ratified in the
# plan): a dedicated retention job belongs with the P1.6 scheduler-leadership
# work, not this PR. These bounded deletes piggyback on every ticket mint so
# the two tables never grow unbounded in the meantime.
_AUTH_SESSION_RETENTION_DAYS = 30
_WS_TICKET_RETENTION_DAYS = 1

# Public: the ws-ticket endpoint (auth.py) echoes this in its
# `{"expires_in": ...}` response field, so it must not drift from the TTL
# actually applied to the stored row below.
WS_TICKET_TTL_SECONDS = 60


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RotationOutcome(str, Enum):
    ROTATED = "rotated"
    REUSE_DETECTED = "reuse_detected"
    INVALID = "invalid"


@dataclass(frozen=True)
class RotationResult:
    """Result of `rotate_refresh_session`. Only the fields relevant to the
    outcome are populated; callers branch on `outcome`."""

    outcome: RotationOutcome
    refresh_token: Optional[str] = None
    family_id: Optional[str] = None
    user_id: Optional[int] = None


async def create_session_family(db: AsyncSession, user_id: int) -> tuple[str, str]:
    """Create a new refresh-token session family and return (refresh_jwt, family_id).

    Called from login (and migrate-session) whenever COOKIE_AUTH_MODE is
    `dual` or `cookie`. Caller commits.
    """
    jti = str(uuid4())
    family_id = str(uuid4())
    now = _now()
    expires_at = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    refresh_jwt = create_refresh_token(subject=user_id, jti=jti, family=family_id)

    session = AuthSession(
        user_id=user_id,
        family_id=family_id,
        token_hash=_hash(jti),
        status=STATUS_ACTIVE,
        expires_at=expires_at,
    )
    db.add(session)
    await db.flush()

    return refresh_jwt, family_id


async def rotate_refresh_session(
    db: AsyncSession, token_payload: dict
) -> RotationResult:
    """Atomically rotate a session-backed refresh token.

    `token_payload` is the decoded JWT claims of the presented refresh token
    (must carry `jti`/`sub`; caller is responsible for routing session-backed
    vs. legacy-stateless tokens here -- see auth.py Task 6 GOTCHA). Caller
    commits.
    """
    jti = token_payload.get("jti")
    if not jti:
        return RotationResult(outcome=RotationOutcome.INVALID)

    now = _now()
    token_hash = _hash(jti)

    claim_stmt = (
        update(AuthSession)
        .where(
            AuthSession.token_hash == token_hash,
            AuthSession.status == STATUS_ACTIVE,
            AuthSession.expires_at > now,
        )
        .values(status=STATUS_ROTATED, last_used_at=now)
        .returning(AuthSession.id, AuthSession.family_id, AuthSession.user_id)
    )
    claimed = (await db.execute(claim_stmt)).first()

    if claimed is not None:
        new_jti = str(uuid4())
        family_id = claimed.family_id
        user_id = claimed.user_id
        expires_at = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

        new_refresh_jwt = create_refresh_token(
            subject=user_id, jti=new_jti, family=family_id
        )

        successor = AuthSession(
            user_id=user_id,
            family_id=family_id,
            token_hash=_hash(new_jti),
            status=STATUS_ACTIVE,
            expires_at=expires_at,
        )
        db.add(successor)
        await db.flush()

        await db.execute(
            update(AuthSession)
            .where(AuthSession.id == claimed.id)
            .values(replaced_by_id=successor.id)
        )

        return RotationResult(
            outcome=RotationOutcome.ROTATED,
            refresh_token=new_refresh_jwt,
            family_id=family_id,
            user_id=user_id,
        )

    # No active row claimed. Look up by hash: found (rotated/revoked, or an
    # active-but-expired row) means this exact refresh token was already
    # consumed or has expired -- presenting it again is reuse. Not found at
    # all means the token/hash never existed (or the DB row was cleaned up).
    existing = (
        await db.execute(select(AuthSession).where(AuthSession.token_hash == token_hash))
    ).scalar_one_or_none()

    if existing is None:
        return RotationResult(outcome=RotationOutcome.INVALID)

    await db.execute(
        update(AuthSession)
        .where(
            AuthSession.family_id == existing.family_id,
            AuthSession.status == STATUS_ACTIVE,
        )
        .values(status=STATUS_REVOKED)
    )

    return RotationResult(
        outcome=RotationOutcome.REUSE_DETECTED,
        family_id=existing.family_id,
        user_id=existing.user_id,
    )


async def revoke_family(db: AsyncSession, family_id: str) -> int:
    """Revoke every `active` session row in a family (logout). Returns the
    number of rows revoked. Caller commits."""
    result = await db.execute(
        update(AuthSession)
        .where(AuthSession.family_id == family_id, AuthSession.status == STATUS_ACTIVE)
        .values(status=STATUS_REVOKED)
    )
    return result.rowcount or 0


async def mint_ws_ticket(db: AsyncSession, user_id: int) -> str:
    """Mint a single-use, 60s-TTL WebSocket auth ticket. Returns the raw
    value once -- only its hash is persisted. Caller commits.

    Piggybacks an opportunistic bounded cleanup of expired ws_tickets/
    auth_sessions rows (see module docstring retention note)."""
    raw = secrets.token_urlsafe(32)
    now = _now()

    ticket = WsTicket(
        user_id=user_id,
        token_hash=_hash(raw),
        expires_at=now + timedelta(seconds=WS_TICKET_TTL_SECONDS),
    )
    db.add(ticket)
    await db.flush()

    await db.execute(
        delete(WsTicket).where(
            WsTicket.expires_at < now - timedelta(days=_WS_TICKET_RETENTION_DAYS)
        )
    )
    await db.execute(
        delete(AuthSession).where(
            AuthSession.expires_at < now - timedelta(days=_AUTH_SESSION_RETENTION_DAYS)
        )
    )

    return raw


async def claim_ws_ticket(db: AsyncSession, raw: str) -> Optional[int]:
    """Atomically claim a single-use WS ticket. Returns the owning user_id,
    or None if the ticket is unknown/expired/already used. Caller commits
    (single-use depends on this persisting)."""
    now = _now()
    token_hash = _hash(raw)

    stmt = (
        update(WsTicket)
        .where(
            WsTicket.token_hash == token_hash,
            WsTicket.used_at.is_(None),
            WsTicket.expires_at > now,
        )
        .values(used_at=now)
        .returning(WsTicket.user_id)
    )
    row = (await db.execute(stmt)).first()
    return row.user_id if row else None
