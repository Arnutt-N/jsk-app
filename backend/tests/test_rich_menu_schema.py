"""Phase 1 — RichMenuAreaAction validator + alias schema format validation.

Pure-Pydantic unit tests (no DB / no LINE). Verifies the richmenuswitch
silent-failure bug is closed and the model_validator returns self (so valid
inputs are NOT rejected).
"""
import pytest
from pydantic import ValidationError

from app.schemas.rich_menu import (
    RichMenuAreaAction,
    RichMenuAliasCreate,
    BulkLinkRequest,
    BulkUnlinkRequest,
)

# LINE userId format: "U" + 32 lowercase hex chars (33 total) — ^U[0-9a-f]{32}$
VALID_UID = "U" + "a1b2c3d4e5f60718293a4b5c6d7e8f90"
VALID_UID_2 = "U" + "0123456789abcdef0123456789abcdef"


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


# --- Phase 1 Task 1.2: bulk link/unlink request schemas ---

def test_bulk_link_request_valid():
    req = BulkLinkRequest(rich_menu_id=1, user_ids=[VALID_UID, VALID_UID_2])
    assert req.rich_menu_id == 1
    assert len(req.user_ids) == 2


def test_bulk_link_request_bad_user_id_rejected():
    with pytest.raises(ValidationError):
        BulkLinkRequest(rich_menu_id=1, user_ids=["not-a-line-id"])


def test_bulk_link_request_uppercase_hex_rejected():
    # pattern allows lowercase hex only
    with pytest.raises(ValidationError):
        BulkLinkRequest(rich_menu_id=1, user_ids=["U" + "A" * 32])


def test_bulk_link_request_empty_user_ids_rejected():
    # min_length=1 — empty list is meaningless for a bulk op
    with pytest.raises(ValidationError):
        BulkLinkRequest(rich_menu_id=1, user_ids=[])


def test_bulk_link_request_over_500_rejected():
    # Annotated[List[...], Field(max_length=500)] must actually enforce the cap
    with pytest.raises(ValidationError):
        BulkLinkRequest(rich_menu_id=1, user_ids=[VALID_UID] * 501)


def test_bulk_link_request_exactly_500_ok():
    req = BulkLinkRequest(rich_menu_id=1, user_ids=[VALID_UID] * 500)
    assert len(req.user_ids) == 500


def test_bulk_unlink_request_valid_without_rich_menu_id():
    # unlink takes no rich_menu_id (LINE bulk/unlink body = {"userIds": [...]})
    req = BulkUnlinkRequest(user_ids=[VALID_UID])
    assert req.user_ids == [VALID_UID]


def test_bulk_unlink_request_bad_user_id_rejected():
    with pytest.raises(ValidationError):
        BulkUnlinkRequest(user_ids=["bad"])


def test_bulk_unlink_request_empty_user_ids_rejected():
    with pytest.raises(ValidationError):
        BulkUnlinkRequest(user_ids=[])


def test_bulk_unlink_request_over_500_rejected():
    with pytest.raises(ValidationError):
        BulkUnlinkRequest(user_ids=[VALID_UID] * 501)
