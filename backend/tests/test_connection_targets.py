from app.core.connection_targets import (
    describe_postgres_url,
    describe_redis_url,
    is_localhost_url,
)


def test_describe_postgres_url_hides_credentials():
    assert (
        describe_postgres_url("postgresql+asyncpg://user:secret@localhost:5432/skn_app_db")
        == "postgresql://localhost:5432/skn_app_db"
    )


def test_describe_redis_url_hides_credentials():
    assert (
        describe_redis_url("rediss://:secret@peaceful-rodent-71444.upstash.io:6379/0")
        == "rediss://peaceful-rodent-71444.upstash.io:6379/0"
    )


def test_is_localhost_url_detects_local_targets():
    assert is_localhost_url("postgresql+asyncpg://postgres:password@localhost:5432/skn_app_db")
    assert not is_localhost_url("postgresql+asyncpg://user:secret@db.example.com:5432/skn_app_db")
