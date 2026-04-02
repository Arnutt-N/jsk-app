from __future__ import annotations

from urllib.parse import urlparse


LOCALHOST_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _normalize_postgres_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def _describe_url(url: str) -> str:
    parsed = urlparse(url)
    scheme = parsed.scheme or "<unknown>"
    host = parsed.hostname or "<unknown-host>"
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path.lstrip("/")
    if path:
        return f"{scheme}://{host}{port}/{path}"
    return f"{scheme}://{host}{port}"


def describe_postgres_url(url: str) -> str:
    return _describe_url(_normalize_postgres_url(url))


def describe_redis_url(url: str) -> str:
    return _describe_url(url)


def is_localhost_url(url: str) -> bool:
    parsed = urlparse(_normalize_postgres_url(url))
    host = (parsed.hostname or "").strip().lower()
    return host in LOCALHOST_HOSTS
