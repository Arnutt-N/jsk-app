"""merge request comments and performance heads

Revision ID: i9j0k1l2m3n4
Revises: 9b29d6152718, h8i9j0k1l2m3
Create Date: 2026-03-14 13:20:00.000000

"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "i9j0k1l2m3n4"
down_revision: Union[str, Sequence[str], None] = ("9b29d6152718", "h8i9j0k1l2m3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Merge parallel migration heads."""
    pass


def downgrade() -> None:
    """Split merged migration heads."""
    pass
