"""Tests for P1.1a — Cookie Backend Foundation (PR 2A).

Maps to the FR8 matrix in
`.claude/PRPs/prds/p1.1a-cookie-backend-foundation.prd.md`:

  test_case1_*  -> FR8 #1  bearer mode: byte-compatible, no cookies, no
                            auth_sessions rows, stray cookie ignored
  test_case2_*  -> FR8 #2  dual mode: cookies + body tokens, cookie wins,
                            no silent fallback on an invalid cookie
  test_case3_*  -> FR8 #3  cookie mode: body omits tokens, bearer-only 401
  test_case4_*  -> FR8 #4  rotation issues new jti; reusing the old one 401s
                            and revokes the whole family
  test_case5_*  -> FR8 #5  legacy no-jti refresh via header: accepted in
                            dual (stateless), rejected in cookie mode
  test_case6_*  -> FR8 #6  CSRF double-submit enforcement
  test_case7_*  -> FR8 #7  logout clears cookies (attribute-matched),
                            revokes the family, idempotent
  test_case8_*  -> FR8 #8  migrate-session: happy path / cookie-only 401 /
                            bearer-mode 409 / rate limit 429 / audit row
  test_case9_*  -> FR8 #9  ws-ticket mint + single-use claim + Origin guard
  test_case10_* -> FR8 #10 CORS wildcard-origin guard + explicit lists

Settings-monkeypatch idiom from `test_liff_token.py`
(`monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", ...)`); direct-DB
assertions use a throwaway NullPool engine (same file) because the app's
pooled `AsyncSessionLocal` is bound to the ASGI/TestClient event loop, not
this test module's pytest-asyncio loop ("attached to a different loop").

Rate-limiter GOTCHA: `auth_rate_limiter` (auth.py) is a module-level
singleton whose bucket state persists across tests. Every test that
exercises rate limiting uses a fresh per-test user id as its bucket key so
it can never collide with another test's calls.

Cookie-jar GOTCHA (two layers): `test_client` (conftest.py) is session-scoped
and its underlying httpx client keeps a persistent cookie jar across every
test in the whole suite -- an autouse fixture below clears it before and
after each test in this file so Set-Cookie responses here never leak into
(or receive leakage from) any other test. WITHIN a single test, httpx also
merges Set-Cookie responses AND any per-request `cookies=` kwarg into that
SAME persistent jar (httpx warns this per-request usage is deprecated
precisely because the merge-vs-override behavior is ambiguous) -- so a cookie
from an earlier call in the same test silently rides along on a later call
that intentionally omits it. The `_clear(test_client)` helper is called
immediately before every request in this file whose exact cookie set matters,
so each such request carries ONLY the cookies explicitly passed to it (or
none), never residue from an earlier step in the same test.
"""
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie

import pytest
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from starlette.websockets import WebSocketDisconnect

from app.api.v1.endpoints import auth as auth_module
from app.core.config import Settings, settings
from app.core.cookie_auth import ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE
from app.core.security import get_password_hash
from app.models.audit_log import AuditLog
from app.models.auth_session import (
    STATUS_ACTIVE,
    STATUS_REVOKED,
    STATUS_ROTATED,
    AuthSession,
)
from app.models.user import User, UserRole
from app.models.ws_ticket import WsTicket
from app.services.auth_session_service import claim_ws_ticket

PASSWORD = "Str0ngPassw0rd!1"


@pytest.fixture(autouse=True)
def _clean_client_cookies(test_client):
    """See module docstring's cookie-jar GOTCHA."""
    test_client.cookies.clear()
    yield
    test_client.cookies.clear()


def _fresh_engine():
    return create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)


async def _create_admin_user(username: str) -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            user = User(
                username=username,
                hashed_password=get_password_hash(PASSWORD),
                display_name="Cookie Auth Test",
                role=UserRole.ADMIN,
                is_active=True,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            return user.id
    finally:
        await engine.dispose()


async def _delete_user_and_sessions(user_id: int) -> None:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            await session.execute(select(AuthSession).where(AuthSession.user_id == user_id))
            for model in (AuthSession, WsTicket, AuditLog):
                rows = (
                    await session.execute(select(model).where(model.user_id == user_id))
                    if model is not AuditLog
                    else await session.execute(select(model).where(model.admin_id == user_id))
                )
                for row in rows.scalars().all():
                    await session.delete(row)
            user = (
                await session.execute(select(User).where(User.id == user_id))
            ).scalar_one_or_none()
            if user is not None:
                await session.delete(user)
            await session.commit()
    finally:
        await engine.dispose()


async def _count_auth_sessions(user_id: int) -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(AuthSession).where(AuthSession.user_id == user_id)
            )
            return len(result.scalars().all())
    finally:
        await engine.dispose()


async def _auth_session_statuses(user_id: int) -> list:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(AuthSession)
                .where(AuthSession.user_id == user_id)
                .order_by(AuthSession.id)
            )
            return [row.status for row in result.scalars().all()]
    finally:
        await engine.dispose()


async def _count_audit_rows(admin_id: int, action: str) -> int:
    engine = _fresh_engine()
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as session:
            result = await session.execute(
                select(AuditLog).where(AuditLog.admin_id == admin_id, AuditLog.action == action)
            )
            return len(result.scalars().all())
    finally:
        await engine.dispose()


def _parse_set_cookie_attrs(set_cookie_headers) -> dict:
    """Parse a list of raw Set-Cookie header strings into
    {cookie_name: {"path", "secure", "httponly", "samesite"}}."""
    attrs = {}
    for raw in set_cookie_headers:
        jar = SimpleCookie()
        jar.load(raw)
        for name, morsel in jar.items():
            attrs[name] = {
                "path": morsel["path"],
                "secure": bool(morsel["secure"]),
                "httponly": bool(morsel["httponly"]),
                "samesite": (morsel["samesite"] or "").lower(),
                "max_age": morsel["max-age"],
            }
    return attrs


def _clear(client) -> None:
    """Empty the TestClient's persistent cookie jar. See module docstring's
    cookie-jar GOTCHA -- call this immediately before any request whose
    exact cookie set must be deterministic."""
    client.cookies.clear()


def _login(test_client, username: str) -> "httpx.Response":  # noqa: F821 (typing only)
    _clear(test_client)
    return test_client.post(
        "/api/v1/auth/login", json={"username": username, "password": PASSWORD}
    )


# --- FR8 test 1: bearer mode byte-compatibility ------------------------------


@pytest.mark.asyncio
async def test_case1_bearer_mode_byte_compatible_no_cookies_no_sessions(
    test_client, monkeypatch
):
    monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "bearer")
    username = f"cookie-t1-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        res = _login(test_client, username)
        assert res.status_code == 200
        body = res.json()
        assert body["access_token"]
        assert body["refresh_token"]
        assert body["token_type"] == "bearer"
        assert body.get("csrf_token") is None
        assert res.headers.get_list("set-cookie") == []
        assert await _count_auth_sessions(user_id) == 0

        access_token = body["access_token"]
        refresh_token = body["refresh_token"]

        # A stray access_token cookie must be ignored entirely in bearer mode.
        _clear(test_client)
        res_me = test_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
            cookies={ACCESS_COOKIE: "not-a-real-token"},
        )
        assert res_me.status_code == 200
        assert res_me.json()["username"] == username
        assert res_me.json().get("csrf_token") is None

        _clear(test_client)
        res_refresh = test_client.post(
            "/api/v1/auth/refresh",
            headers={"Authorization": f"Bearer {refresh_token}"},
        )
        assert res_refresh.status_code == 200
        refresh_body = res_refresh.json()
        assert refresh_body["access_token"]
        assert refresh_body.get("refresh_token") is None
        assert refresh_body.get("csrf_token") is None
        assert res_refresh.headers.get_list("set-cookie") == []
        assert await _count_auth_sessions(user_id) == 0
    finally:
        await _delete_user_and_sessions(user_id)


# --- FR8 test 2: dual mode ----------------------------------------------------


@pytest.mark.asyncio
async def test_case2_dual_mode_cookies_and_body_tokens_cookie_wins(test_client, monkeypatch):
    monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "dual")
    username = f"cookie-t2-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        res = _login(test_client, username)
        assert res.status_code == 200
        body = res.json()
        assert body["access_token"]
        assert body["refresh_token"]
        assert body["csrf_token"]

        set_cookie_headers = res.headers.get_list("set-cookie")
        attrs = _parse_set_cookie_attrs(set_cookie_headers)
        assert set(attrs) == {ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE}
        for name, a in attrs.items():
            assert a["httponly"] is True
            assert a["samesite"] == "strict"
        assert attrs[ACCESS_COOKIE]["path"] == "/api/v1"
        assert attrs[REFRESH_COOKIE]["path"] == "/api/v1/auth"
        assert attrs[CSRF_COOKIE]["path"] == "/api/v1"

        cookies = dict(res.cookies)

        # cookie-authed GET works
        _clear(test_client)
        res_me_cookie = test_client.get("/api/v1/auth/me", cookies=cookies)
        assert res_me_cookie.status_code == 200

        # Bearer-authed GET also still works (no cookie riding along)
        _clear(test_client)
        res_me_bearer = test_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {body['access_token']}"},
        )
        assert res_me_bearer.status_code == 200

        # Cookie wins when both present: garbage Bearer + valid cookie -> 200
        _clear(test_client)
        res_both = test_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
            cookies=cookies,
        )
        assert res_both.status_code == 200

        # Presence-based, not validity-based: invalid cookie + valid Bearer
        # still 401s -- no silent fallback to the header.
        _clear(test_client)
        res_bad_cookie = test_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {body['access_token']}"},
            cookies={ACCESS_COOKIE: "garbage-cookie-value"},
        )
        assert res_bad_cookie.status_code == 401
    finally:
        await _delete_user_and_sessions(user_id)


# --- FR8 test 3: cookie mode ---------------------------------------------------


@pytest.mark.asyncio
async def test_case3_cookie_mode_omits_body_tokens_bearer_only_rejected(
    test_client, monkeypatch
):
    monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "cookie")
    # Neither cookie nor header present resolves to "no token" the same way
    # DEV_AUTH_BYPASS's mock-admin escape hatch checks for -- disable it here
    # so this assertion exercises the real 401, not the dev bypass (this
    # repo's test env has DEV_AUTH_BYPASS=true for other tests' convenience).
    monkeypatch.setattr(settings, "DEV_AUTH_BYPASS", False)
    username = f"cookie-t3-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        res = _login(test_client, username)
        assert res.status_code == 200
        body = res.json()
        assert body["access_token"] == ""
        assert body["refresh_token"] == ""
        assert body["csrf_token"]

        cookies = dict(res.cookies)
        _clear(test_client)
        res_me = test_client.get("/api/v1/auth/me", cookies=cookies)
        assert res_me.status_code == 200

        _clear(test_client)
        res_bearer_only = test_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert res_bearer_only.status_code == 401
    finally:
        await _delete_user_and_sessions(user_id)


# --- FR8 test 4: rotation + reuse detection ------------------------------------


@pytest.mark.asyncio
async def test_case4_rotation_issues_new_jti_reuse_401s_and_revokes_family(
    test_client, monkeypatch
):
    monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "cookie")
    username = f"cookie-t4-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        res = _login(test_client, username)
        assert res.status_code == 200
        old_cookies = dict(res.cookies)
        assert await _count_auth_sessions(user_id) == 1

        _clear(test_client)
        res_refresh1 = test_client.post("/api/v1/auth/refresh", cookies=old_cookies)
        assert res_refresh1.status_code == 200
        new_cookies = dict(res_refresh1.cookies)
        assert new_cookies[REFRESH_COOKIE] != old_cookies[REFRESH_COOKIE]

        statuses = await _auth_session_statuses(user_id)
        assert statuses.count(STATUS_ACTIVE) == 1
        assert statuses.count(STATUS_ROTATED) == 1

        # Reuse of the OLD (already-rotated) refresh cookie -> 401 + the
        # whole family is revoked.
        _clear(test_client)
        res_reuse = test_client.post("/api/v1/auth/refresh", cookies=old_cookies)
        assert res_reuse.status_code == 401

        statuses_after_reuse = await _auth_session_statuses(user_id)
        assert STATUS_ACTIVE not in statuses_after_reuse
        assert all(s in (STATUS_ROTATED, STATUS_REVOKED) for s in statuses_after_reuse)
        assert await _count_audit_rows(user_id, "refresh_reuse_detected") == 1

        # The successor token from the successful rotation is unusable too.
        _clear(test_client)
        res_after_revoke = test_client.post("/api/v1/auth/refresh", cookies=new_cookies)
        assert res_after_revoke.status_code == 401
    finally:
        await _delete_user_and_sessions(user_id)


@pytest.mark.asyncio
async def test_case4_expired_active_refresh_is_invalid_not_reuse(
    test_client, monkeypatch
):
    """F1: a refresh cookie whose server-side row is `active` but past its
    TTL is an ordinary expiry, NOT reuse -- the refresh must 401 with outcome
    INVALID, write NO `refresh_reuse_detected` audit row, and NOT revoke the
    family (no false positive on the alert-on-any reuse metric).

    The refresh JWT itself still carries a valid (future) `exp`, so the
    request reaches `rotate_refresh_session`; only the DB row's `expires_at`
    is back-dated to simulate the TTL having elapsed (see review F1). The
    real-world trigger is the tiny divergence between the DB `expires_at`
    (written first) and the JWT `exp` (written a moment later) -- both equal
    `now + REFRESH_TOKEN_EXPIRE_DAYS`, so the DB row expires slightly before
    the JWT, opening a window where this code path runs for a benign expiry.
    """
    monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "cookie")
    username = f"cookie-t4exp-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        res = _login(test_client, username)
        assert res.status_code == 200
        old_cookies = dict(res.cookies)
        assert await _count_auth_sessions(user_id) == 1

        # Back-date the single active session row past its TTL. The JWT in
        # the cookie is still valid (exp ~now+7d), so the refresh handler's
        # verify_token() passes and the request reaches rotate_refresh_session,
        # where the atomic claim (expires_at > now) now misses.
        engine = _fresh_engine()
        Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        try:
            async with Session() as session:
                past = datetime.now(timezone.utc) - timedelta(minutes=5)
                await session.execute(
                    update(AuthSession)
                    .where(
                        AuthSession.user_id == user_id,
                        AuthSession.status == STATUS_ACTIVE,
                    )
                    .values(expires_at=past)
                )
                await session.commit()
        finally:
            await engine.dispose()

        _clear(test_client)
        res_expired = test_client.post("/api/v1/auth/refresh", cookies=old_cookies)
        assert res_expired.status_code == 401

        # No false reuse alert, and the family was NOT revoked (the expired
        # row stays `active`; nothing was flipped to `revoked`).
        assert await _count_audit_rows(user_id, "refresh_reuse_detected") == 0
        statuses_after = await _auth_session_statuses(user_id)
        assert STATUS_REVOKED not in statuses_after
        assert statuses_after.count(STATUS_ACTIVE) == 1
    finally:
        await _delete_user_and_sessions(user_id)



# --- FR8 test 5: legacy no-jti refresh via header -----------------------------


@pytest.mark.asyncio
async def test_case5_legacy_header_refresh_dual_accepted_cookie_rejected(
    test_client, monkeypatch
):
    username = f"cookie-t5-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "bearer")
        res_login = _login(test_client, username)
        assert res_login.status_code == 200
        legacy_refresh_token = res_login.json()["refresh_token"]

        monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "dual")
        res_dual = test_client.post(
            "/api/v1/auth/refresh",
            headers={"Authorization": f"Bearer {legacy_refresh_token}"},
        )
        assert res_dual.status_code == 200
        assert res_dual.json()["access_token"]
        assert await _count_auth_sessions(user_id) == 0

        monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "cookie")
        res_cookie = test_client.post(
            "/api/v1/auth/refresh",
            headers={"Authorization": f"Bearer {legacy_refresh_token}"},
        )
        assert res_cookie.status_code == 401
    finally:
        await _delete_user_and_sessions(user_id)


# --- FR8 test 6: CSRF double-submit -------------------------------------------


@pytest.mark.asyncio
async def test_case6_csrf_double_submit_enforcement(test_client, monkeypatch):
    monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "dual")
    username = f"cookie-t6-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        res_login = _login(test_client, username)
        assert res_login.status_code == 200
        cookies = dict(res_login.cookies)
        csrf_value = cookies[CSRF_COOKIE]
        access_token = res_login.json()["access_token"]

        # cookie-authed POST without header -> 403
        _clear(test_client)
        res_no_header = test_client.post("/api/v1/auth/ws-ticket", cookies=cookies)
        assert res_no_header.status_code == 403

        # wrong value -> 403
        _clear(test_client)
        res_wrong = test_client.post(
            "/api/v1/auth/ws-ticket",
            cookies=cookies,
            headers={"x-csrf-token": "wrong-value"},
        )
        assert res_wrong.status_code == 403

        # header present but csrf cookie itself absent -> 403
        cookies_no_csrf = {k: v for k, v in cookies.items() if k != CSRF_COOKIE}
        _clear(test_client)
        res_no_csrf_cookie = test_client.post(
            "/api/v1/auth/ws-ticket",
            cookies=cookies_no_csrf,
            headers={"x-csrf-token": csrf_value},
        )
        assert res_no_csrf_cookie.status_code == 403

        # correct value -> 2xx
        _clear(test_client)
        res_ok = test_client.post(
            "/api/v1/auth/ws-ticket",
            cookies=cookies,
            headers={"x-csrf-token": csrf_value},
        )
        assert res_ok.status_code == 200

        # Bearer-authed POST without header -> 2xx (exempt: not cookie-sourced,
        # and no cookie must ride along from the jar to force cookie-sourcing)
        _clear(test_client)
        res_bearer_ok = test_client.post(
            "/api/v1/auth/ws-ticket",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert res_bearer_ok.status_code == 200

        # login/refresh are exempt entirely (no get_current_user dependency)
        res_login2 = _login(test_client, username)
        assert res_login2.status_code == 200
    finally:
        await _delete_user_and_sessions(user_id)


# --- FR8 test 7: logout --------------------------------------------------------


@pytest.mark.asyncio
async def test_case7_logout_clears_cookies_revokes_family_idempotent(test_client, monkeypatch):
    monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "dual")
    username = f"cookie-t7-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        res_login = _login(test_client, username)
        login_attrs = _parse_set_cookie_attrs(res_login.headers.get_list("set-cookie"))
        cookies = dict(res_login.cookies)
        assert await _count_auth_sessions(user_id) == 1

        _clear(test_client)
        res_logout = test_client.post("/api/v1/auth/logout", cookies=cookies)
        assert res_logout.status_code == 204

        logout_attrs = _parse_set_cookie_attrs(res_logout.headers.get_list("set-cookie"))
        assert set(logout_attrs) == set(login_attrs) == {ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE}
        for name in login_attrs:
            assert logout_attrs[name]["path"] == login_attrs[name]["path"]
            assert logout_attrs[name]["secure"] == login_attrs[name]["secure"]
            assert logout_attrs[name]["httponly"] == login_attrs[name]["httponly"]
            assert logout_attrs[name]["samesite"] == login_attrs[name]["samesite"]
            assert logout_attrs[name]["max_age"] == "0"

        statuses = await _auth_session_statuses(user_id)
        assert STATUS_ACTIVE not in statuses
        assert await _count_audit_rows(user_id, "logout") == 1

        # Idempotent: a second call with no cookies at all still 204s.
        res_logout2 = test_client.post("/api/v1/auth/logout")
        assert res_logout2.status_code == 204
    finally:
        await _delete_user_and_sessions(user_id)


# --- FR8 test 8: migrate-session ----------------------------------------------


@pytest.mark.asyncio
async def test_case8_migrate_session_matrix(test_client, monkeypatch):
    username = f"cookie-t8-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "bearer")
        res_login = _login(test_client, username)
        access_token = res_login.json()["access_token"]

        # bearer mode -> 409
        res_bearer_mode = test_client.post(
            "/api/v1/auth/migrate-session",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert res_bearer_mode.status_code == 409

        monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "dual")

        # cookie-only attempt (no Authorization header) -> 401: this
        # endpoint's dependency is Bearer-only by construction.
        res_login_dual = _login(test_client, username)
        cookies = dict(res_login_dual.cookies)
        res_cookie_attempt = test_client.post("/api/v1/auth/migrate-session", cookies=cookies)
        assert res_cookie_attempt.status_code == 401

        auth_module.auth_rate_limiter.reset(f"migrate:{user_id}")

        # happy path
        res_ok = test_client.post(
            "/api/v1/auth/migrate-session",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert res_ok.status_code == 200
        ok_body = res_ok.json()
        assert ok_body["access_token"]
        assert ok_body["refresh_token"]
        assert ok_body["csrf_token"]
        assert len(res_ok.headers.get_list("set-cookie")) == 3
        assert await _count_audit_rows(user_id, "migrate_session") >= 1

        # rate limit: 1 call already made above; 4 more are allowed, the 6th
        # overall call in the window trips 429.
        last_status = None
        for _ in range(5):
            r = test_client.post(
                "/api/v1/auth/migrate-session",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            last_status = r.status_code
        assert last_status == 429
    finally:
        auth_module.auth_rate_limiter.reset(f"migrate:{user_id}")
        await _delete_user_and_sessions(user_id)


# --- FR8 test 9: ws-ticket + Origin --------------------------------------------


@pytest.mark.asyncio
async def test_case9_ws_ticket_single_use_expiry_and_origin_guard(test_client, monkeypatch):
    monkeypatch.setattr(settings, "COOKIE_AUTH_MODE", "dual")
    username = f"cookie-t9-{uuid.uuid4().hex[:10]}"
    user_id = await _create_admin_user(username)
    try:
        res_login = _login(test_client, username)
        access_token = res_login.json()["access_token"]

        # Clear the jar so this Bearer-authed mint isn't silently
        # cookie-sourced instead (dual mode: a leftover access_token cookie
        # from login would take priority and trip the CSRF check).
        _clear(test_client)
        res_ticket = test_client.post(
            "/api/v1/auth/ws-ticket",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert res_ticket.status_code == 200
        ticket_body = res_ticket.json()
        assert ticket_body["ticket"]
        assert ticket_body["expires_in"] == 60
        assert await _count_audit_rows(user_id, "ws_ticket_mint") == 1

        engine = _fresh_engine()
        Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        try:
            async with Session() as session:
                claimed_user_id = await claim_ws_ticket(session, ticket_body["ticket"])
                await session.commit()
            assert claimed_user_id == user_id

            # Second claim of the same ticket fails (single-use).
            async with Session() as session:
                second_claim = await claim_ws_ticket(session, ticket_body["ticket"])
                await session.commit()
            assert second_claim is None

            # Expired ticket is rejected.
            expired_raw = "expired-raw-ticket-value-0000000000"
            async with Session() as session:
                session.add(
                    WsTicket(
                        user_id=user_id,
                        token_hash=hashlib.sha256(expired_raw.encode()).hexdigest(),
                        expires_at=datetime.now(timezone.utc) - timedelta(seconds=5),
                    )
                )
                await session.commit()

            async with Session() as session:
                expired_claim = await claim_ws_ticket(session, expired_raw)
                await session.commit()
            assert expired_claim is None
        finally:
            await engine.dispose()

        # Origin outside BACKEND_CORS_ORIGINS (conftest sets
        # ["http://localhost:3000"]) is rejected before accept.
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with test_client.websocket_connect(
                "/api/v1/ws/live-chat",
                headers={"origin": "https://evil.example.com"},
            ):
                pass
        assert exc_info.value.code == 1008

        # An allowed Origin still connects normally.
        with test_client.websocket_connect(
            "/api/v1/ws/live-chat",
            headers={"origin": "http://localhost:3000"},
        ) as ws:
            ws.send_json({"type": "ping"})
            data = ws.receive_json()
            assert data["type"] in ("error", "pong")
    finally:
        await _delete_user_and_sessions(user_id)


# --- FR8 test 10: CORS wildcard-origin guard -----------------------------------


_BASE_SETTINGS = {
    "DATABASE_URL": "postgresql+asyncpg://postgres:password@localhost:5432/skn_app_db",
    "SECRET_KEY": "test-secret-key",
}


def test_case10_wildcard_cors_origin_fails_settings_parsing() -> None:
    """FR5 deviation (documented in main.py + PR body): pydantic's
    List[AnyHttpUrl] already rejects "*" as an origin, so the "reject
    wildcard origins" requirement is satisfied by the type system rather
    than a runtime guard."""
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **_BASE_SETTINGS, BACKEND_CORS_ORIGINS='["*"]')


def test_case10_cors_middleware_uses_explicit_methods_and_headers() -> None:
    from app.main import app

    cors_middleware = next(
        m for m in app.user_middleware if m.cls.__name__ == "CORSMiddleware"
    )
    kwargs = cors_middleware.kwargs
    assert kwargs["allow_methods"] != ["*"]
    assert kwargs["allow_headers"] != ["*"]
    assert "x-csrf-token" in kwargs["allow_headers"]
    assert "authorization" in kwargs["allow_headers"]
