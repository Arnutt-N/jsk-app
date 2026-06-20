"""Phase 1 — RichMenuAreaAction validator + alias schema format validation.

Pure-Pydantic unit tests (no DB / no LINE). Verifies the richmenuswitch
silent-failure bug is closed and the model_validator returns self (so valid
inputs are NOT rejected).
"""
import pytest
from pydantic import ValidationError

from app.schemas.rich_menu import RichMenuAreaAction, RichMenuAliasCreate


def test_richmenuswitch_without_alias_id_rejected():
    with pytest.raises(ValidationError):
        RichMenuAreaAction(type="richmenuswitch")


def test_richmenuswitch_with_alias_id_ok():
    a = RichMenuAreaAction(type="richmenuswitch", richMenuAliasId="richmenu-alias-b")
    assert a.richMenuAliasId == "richmenu-alias-b"


def test_richmenuswitch_data_is_optional():
    # data must NOT be required for richmenuswitch (LINE spec)
    a = RichMenuAreaAction(type="richmenuswitch", richMenuAliasId="alias-a")
    assert a.data is None


def test_uri_action_still_valid():
    # regression guard: model_validator must return self, else valid inputs break
    a = RichMenuAreaAction(type="uri", uri="https://example.com", label="x")
    assert a.type == "uri"


def test_message_action_still_valid():
    a = RichMenuAreaAction(type="message", text="hello")
    assert a.type == "message"


def test_invalid_action_type_rejected():
    with pytest.raises(ValidationError):
        RichMenuAreaAction(type="bogus")


def test_alias_id_valid_format():
    a = RichMenuAliasCreate(alias_id="richmenu-alias_A1", rich_menu_id=1)
    assert a.rich_menu_id == 1


def test_alias_id_bad_format_rejected():
    with pytest.raises(ValidationError):
        RichMenuAliasCreate(alias_id="bad id!", rich_menu_id=1)
