"""Bcrypt 72-byte password policy (R3-M11). Pure unit tests, no DB."""

import pytest
from pydantic import ValidationError

from app.api.v1.endpoints.admin_users import UserCreateRequest
from app.core.security import assert_bcrypt_compatible
from app.schemas.auth import LoginRequest


def test_72_ascii_bytes_ok():
    assert assert_bcrypt_compatible("a" * 72) == "a" * 72


def test_73_ascii_bytes_raise():
    with pytest.raises(ValueError, match="72 bytes"):
        assert_bcrypt_compatible("a" * 73)


def test_18_emoji_72_bytes_ok():
    assert assert_bcrypt_compatible("😀" * 18) == "😀" * 18


def test_19_emoji_raise():
    with pytest.raises(ValueError, match="72 bytes"):
        assert_bcrypt_compatible("😀" * 19)


def test_user_create_rejects_73_char_password():
    with pytest.raises(ValidationError):
        UserCreateRequest(
            username="u1",
            password="a" * 73,
            display_name="D",
        )


def test_login_rejects_73_char_password():
    with pytest.raises(ValidationError):
        LoginRequest(username="u1", password="a" * 73)
