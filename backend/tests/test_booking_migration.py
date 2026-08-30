"""Structural tests for the booking migration — no database required.

The expensive failure mode here is not a broken SQL statement (Postgres would
say so loudly); it is a *name* drifting between the migration and the model.
Alembic compares indexes by name, so a mismatch makes `--autogenerate` propose
dropping a production index and recreating it. PR #183 was the cleanup after
exactly that. These tests compare the two sides directly.
"""
import importlib.util
import re
from pathlib import Path

import pytest

from app.models.booking import Booking


VERSIONS_DIR = Path(__file__).resolve().parents[1] / "alembic" / "versions"
MIGRATION_PATH = VERSIONS_DIR / "e6f7g8h9i0j1_add_booking_appointment_fields.py"


def _load_migration():
    """Load the revision by path.

    `alembic/versions/` is not an importable package, and `import alembic` would
    resolve to the installed library instead.
    """
    spec = importlib.util.spec_from_file_location("_booking_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


migration = _load_migration()

_REVISION_RE = re.compile(r'^revision(?::\s*str)?\s*=\s*["\']([^"\']+)["\']', re.M)
# The right-hand side is either None, a single quoted id, or a tuple of ids —
# this repo has three merge revisions that list several parents.
_DOWN_REVISION_RE = re.compile(r"^down_revision(?::[^=]+)?\s*=\s*(.+)$", re.M)
_QUOTED_RE = re.compile(r'["\']([^"\']+)["\']')


def _revision_graph():
    """Map every revision file to its set of parents.

    Merge revisions declare `down_revision` as a tuple, so a parser that only
    understands the single-string form silently loses parents and then reports
    them as extra heads.
    """
    graph = {}
    for path in VERSIONS_DIR.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        revision = _REVISION_RE.search(text)
        if not revision:
            continue
        down_match = _DOWN_REVISION_RE.search(text)
        parents = set(_QUOTED_RE.findall(down_match.group(1))) if down_match else set()
        graph[revision.group(1)] = parents
    return graph


def test_migration_chains_onto_the_previous_head():
    assert migration.revision == "e6f7g8h9i0j1"
    assert migration.down_revision == "d5e6f7g8h9i0"


def test_revision_history_has_exactly_one_head():
    """Two heads make `alembic upgrade head` fail with 'multiple heads'."""
    graph = _revision_graph()
    parents = {parent for parents in graph.values() for parent in parents}
    heads = sorted(set(graph) - parents)
    assert heads == ["s0t1u2v3w4x5"], f"expected a single head, found {heads}"


def test_down_revision_points_at_a_real_revision():
    graph = _revision_graph()
    assert migration.down_revision in graph


# --- migration vs. model agreement ---


def _model_index_names():
    return {index.name for index in Booking.__table__.indexes}


@pytest.mark.parametrize(
    "index_name", [migration.IX_SLOT, migration.IX_REMINDER_DUE]
)
def test_every_index_the_migration_creates_is_declared_on_the_model(index_name):
    """A name declared here but not there is the PR #183 failure mode."""
    assert index_name in _model_index_names()


def test_every_column_the_migration_adds_exists_on_the_model():
    model_columns = set(Booking.__table__.columns.keys())
    for name, _type in migration.NEW_COLUMNS:
        assert name in model_columns, f"{name} added by migration but not modelled"


def test_added_columns_are_nullable_on_the_model():
    """The table may already hold rows, so a NOT NULL add would fail on upgrade."""
    columns = Booking.__table__.columns
    for name, _type in migration.NEW_COLUMNS:
        assert columns[name].nullable is True, f"{name} must be nullable"


def test_reminder_sent_at_has_no_server_default_in_the_migration_spec():
    """A default would make every pre-existing booking look already-reminded."""
    spec = dict(migration.NEW_COLUMNS)
    assert "reminder_sent_at" in spec
    # The migration builds columns as sa.Column(name, type, nullable=True) only;
    # assert the model side too, since that is what autogenerate diffs against.
    assert Booking.__table__.columns["reminder_sent_at"].server_default is None


def test_downgrade_removes_everything_upgrade_adds():
    """Guard against an asymmetric downgrade leaving orphan columns behind."""
    source = MIGRATION_PATH.read_text(encoding="utf-8")
    downgrade_body = source.split("def downgrade()", 1)[1]

    # Columns are dropped by iterating NEW_COLUMNS in reverse, and both indexes
    # are dropped by their shared name constants.
    assert "reversed(NEW_COLUMNS)" in downgrade_body
    assert "drop_column" in downgrade_body
    assert "IX_REMINDER_DUE" in downgrade_body
    assert "IX_SLOT" in downgrade_body
