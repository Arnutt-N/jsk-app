"""AuthSession model — server-side refresh-token sessions (P1.1a FR1).

Backs the cookie-mode refresh-token rotation + reuse-detection design
recorded in `docs/remediation/preflight-evidence-and-designs.md` §5. A row is
created per refresh-token family; rotation marks the old row `rotated` and
inserts a successor in the same family. Reuse of a non-active token revokes
every `active` row in its family. `token_hash` stores only the SHA-256 hash
of the refresh JWT's `jti` claim — never the raw token. No IP/user-agent
columns by design (no PII creep, per PRD FR1).
"""
from sqlalchemy import Column, ForeignKey, Integer, String, DateTime
from datetime import datetime, timezone

from app.db.base import Base

# Module constants instead of a SQLEnum — mirrors the `status` string-column
# style used elsewhere in this codebase (e.g. chat_session status literals)
# rather than introducing a new Postgres enum type for an internal-only field.
STATUS_ACTIVE = "active"
STATUS_ROTATED = "rotated"
STATUS_REVOKED = "revoked"


class AuthSession(Base):
    """A refresh-token session row, one per issued (and per rotated) refresh JWT."""

    __tablename__ = "auth_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    family_id = Column(String(36), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    status = Column(String(16), nullable=False, default=STATUS_ACTIVE)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    # DB column is timestamptz (see audit_log.py's tz-aware comment for why:
    # asyncpg rejects naive-vs-aware bind mismatches on comparison queries).
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    replaced_by_id = Column(Integer, ForeignKey("auth_sessions.id"), nullable=True)

    def __repr__(self) -> str:
        return f"<AuthSession(id={self.id}, family_id={self.family_id}, status={self.status})>"
