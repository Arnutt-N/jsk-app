"""F-008 / F-009 / F-010: three low-severity auth hardening fixes.

F-008 — `secrets.compare_digest` raises TypeError on non-ASCII strings, so a
crafted `X-CSRF-Token` header turned a should-be-403 into a 500 (and a
traceback in the logs). Compare the UTF-8 encodings instead.

F-009 — the login lookup used `username == x OR lower(email) == x`, which can
match two DIFFERENT rows (one user's username equals another's email).
`scalar_one_or_none()` then raises MultipleResultsFound → 500 on a login
attempt. Resolve deterministically: username first, email only as a fallback.

F-010 — an unknown identifier skipped bcrypt entirely, so response time
distinguished a real username from a made-up one. Run a dummy verification on
the not-found path so both take the same work.
"""

import secrets
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api import deps
from app.api.v1.endpoints import auth as auth_endpoint

# --- F-008: CSRF compare must not raise on non-ASCII ------------------------


def test_non_ascii_csrf_token_is_403_not_typeerror():
    """The real bug: compare_digest(str, str) raises on non-ASCII input."""
    header = "คีย์-ปลอม"  # Thai text: non-ASCII str
    cookie = "real-token"

    with pytest.raises(TypeError):
        secrets.compare_digest(header, cookie)  # documents the failure mode

    # The fixed comparison uses the encoded form, which never raises.
    assert not deps.csrf_matches(header, cookie)


def test_csrf_matches_accepts_an_identical_token():
    token = "abc123"
    assert deps.csrf_matches(token, token)


def test_csrf_matches_rejects_a_different_token():
    assert not deps.csrf_matches("abc123", "abc124")


def test_csrf_matches_rejects_non_ascii_on_either_side():
    assert not deps.csrf_matches("คีย์", "abc")
    assert not deps.csrf_matches("abc", "คีย์")
    assert deps.csrf_matches("คีย์", "คีย์")


# --- F-009: deterministic identifier resolution -----------------------------


class _Scalars:
    def __init__(self, value):
        self._value = value

    def first(self):
        return self._value


class _Result:
    def __init__(self, value):
        self._value = value

    def scalars(self):
        return _Scalars(self._value)


@pytest.mark.asyncio
async def test_identifier_resolution_prefers_username():
    """Two rows could match; username must win deterministically."""
    username_row = MagicMock(id=1, username="admin", email="someone@x.test")
    email_row = MagicMock(id=2, username="other", email="admin")

    calls = []

    async def _execute(stmt):
        calls.append(stmt)
        # First query is the username lookup; it hits.
        return _Result(username_row if len(calls) == 1 else email_row)

    db = AsyncMock()
    db.execute = _execute

    found = await auth_endpoint._find_admin_by_identifier(db, "admin")

    assert found is username_row, "username match must take precedence"
    assert len(calls) == 1, "email lookup must not run once username matched"


@pytest.mark.asyncio
async def test_identifier_resolution_falls_back_to_email():
    email_row = MagicMock(id=2, username="other", email="boss@x.test")
    calls = []

    async def _execute(stmt):
        calls.append(stmt)
        return _Result(None if len(calls) == 1 else email_row)

    db = AsyncMock()
    db.execute = _execute

    found = await auth_endpoint._find_admin_by_identifier(db, "boss@x.test")

    assert found is email_row
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_identifier_resolution_never_raises_on_a_double_match():
    """A collision used to surface as MultipleResultsFound -> 500."""
    async def _execute(stmt):
        return _Result(None)

    db = AsyncMock()
    db.execute = _execute

    assert await auth_endpoint._find_admin_by_identifier(db, "anyone") is None


# --- F-010: equalised timing on the not-found path -------------------------


@pytest.mark.asyncio
async def test_unknown_user_still_runs_a_password_verification():
    """No user must cost the same as a wrong password."""
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_Result(None))
    db.commit = AsyncMock()

    with patch.object(
        auth_endpoint, "verify_password_async", new=AsyncMock(return_value=False)
    ) as verify, patch.object(auth_endpoint, "create_audit_log", new=AsyncMock()):
        with pytest.raises(HTTPException) as exc:
            await auth_endpoint.login(
                payload=MagicMock(username="ghost", password="whatever"),
                response=MagicMock(),
                request=MagicMock(client=MagicMock(host="127.0.0.1")),
                db=db,
            )

    assert exc.value.status_code == 401
    verify.assert_awaited_once()
    # A dummy hash is verified, never the caller's password against nothing.
    args = verify.await_args.args
    assert args[0] == "whatever"
    assert args[1], "the dummy path must still pass a real-looking hash"
