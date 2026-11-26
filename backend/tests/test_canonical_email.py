"""N05: canonical email contract in queries and schema."""
from pathlib import Path

from sqlalchemy.dialects import postgresql

from app.core.email import email_matches
from app.models.user import User


def test_email_matches_uses_case_insensitive_trimmed_expression():
    expr = email_matches(User.email, " Admin@Example.COM ")
    sql = str(expr.compile(dialect=postgresql.dialect()))
    assert "lower(btrim(users.email))" in sql
    values = [str(value) for value in expr.compile(dialect=postgresql.dialect()).params.values()]
    assert "admin@example.com" in values


def test_model_and_migration_share_unique_index_name():
    migration = (
        Path(__file__).resolve().parents[1]
        / "alembic" / "versions" / "g1h2i3j4k5l6_canonical_email.py"
    ).read_text(encoding="utf-8")
    assert "uq_users_email_lower" in migration
    assert "email IS NOT NULL" in migration
    index = next(idx for idx in User.__table__.indexes if idx.name == "uq_users_email_lower")
    assert "lower(btrim(users.email))" in str(index.expressions[0].compile(dialect=postgresql.dialect()))
    assert "email IS NOT NULL" in str(index.dialect_options["postgresql"]["where"])
