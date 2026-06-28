"""fix matchtype enum: add uppercase STARTS_WITH

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-06-29 00:00:00.000000

Background
----------
``Column(Enum(MatchType))`` persists the enum *member NAMES* (uppercase) — the
same behaviour confirmed for ``objecttype`` / ``replytype``. The ``matchtype``
enum was created with ``'EXACT','CONTAINS','REGEX'`` (9aef5616e35e), but the
later migration ``p6q7r8s9t0u1`` mistakenly added the lowercase *value*
``'starts_with'`` instead of the member name ``'STARTS_WITH'``.

As a result the ORM (which writes ``'STARTS_WITH'``) fails to insert/update any
IntentKeyword / AutoReply row using ``MatchType.STARTS_WITH`` with::

    invalid input value for enum matchtype: "STARTS_WITH"

This migration adds the correct uppercase ``'STARTS_WITH'`` so the ORM round-trip
works. The orphan lowercase ``'starts_with'`` is left in place (PostgreSQL cannot
drop an enum value in place); it is harmless because the ORM never writes it.
No data backfill is needed: no row could ever have been stored as STARTS_WITH,
and existing EXACT/CONTAINS/REGEX rows are unaffected.

Revision-id note
----------------
The original PR #111 draft used revision id ``t0u1v2w3x4y5``, which collides with
``t0u1v2w3x4y5_richmenu_alias_peruser`` (already on main and applied to PROD on
2026-06-21). This revision was re-issued with a fresh id ``u1v2w3x4y5z6`` and
re-chained onto the current head (the richmenu migration ``t0u1v2w3x4y5``) so the
alembic graph stays linear with a single head.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'u1v2w3x4y5z6'
down_revision: Union[str, None] = 't0u1v2w3x4y5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Mirror the working pattern used for objecttype in s9t0u1v2w3x4.
    op.execute("ALTER TYPE matchtype ADD VALUE IF NOT EXISTS 'STARTS_WITH'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values in place — no-op.
    pass
