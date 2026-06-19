"""
Unit tests for per-type Reply Object payload validation (Phase 4 PR2).

Covers the new `template` / `text_v2` types and the optional `quickReply`
modifier, plus a regression guard that the original 8 types stay free-form.
"""
import pytest
from pydantic import ValidationError

from app.schemas.reply_object import ReplyObjectCreate
from app.schemas.reply_object_validation import validate_payload_for_type


# --- template: happy paths ------------------------------------------------

def test_template_buttons_ok():
    payload = {
        "template": {
            "type": "buttons",
            "text": "เลือกบริการ",
            "actions": [{"type": "message", "label": "A", "text": "A"}],
        }
    }
    validate_payload_for_type("template", payload)  # should not raise


def test_template_confirm_requires_exactly_two_actions():
    payload = {
        "template": {
            "type": "confirm",
            "text": "ยืนยันไหม",
            "actions": [
                {"type": "message", "label": "ใช่", "text": "yes"},
                {"type": "message", "label": "ไม่", "text": "no"},
            ],
        }
    }
    validate_payload_for_type("template", payload)


def test_template_carousel_ok():
    payload = {
        "template": {
            "type": "carousel",
            "columns": [
                {"text": "c1", "actions": [{"type": "message", "label": "x", "text": "x"}]},
            ],
        }
    }
    validate_payload_for_type("template", payload)


# --- template: failure paths ----------------------------------------------

def test_template_unknown_subtype_raises():
    with pytest.raises(ValueError):
        validate_payload_for_type("template", {"template": {"type": "bogus"}})


def test_template_missing_template_object_raises():
    with pytest.raises(ValueError):
        validate_payload_for_type("template", {"text": "no template here"})


def test_template_buttons_without_actions_raises():
    with pytest.raises(ValueError):
        validate_payload_for_type(
            "template", {"template": {"type": "buttons", "text": "hi", "actions": []}}
        )


def test_template_confirm_wrong_action_count_raises():
    with pytest.raises(ValueError):
        validate_payload_for_type(
            "template",
            {"template": {"type": "confirm", "text": "hi", "actions": [{"label": "a"}]}},
        )


def test_template_carousel_empty_columns_raises():
    with pytest.raises(ValueError):
        validate_payload_for_type(
            "template", {"template": {"type": "carousel", "columns": []}}
        )


def test_template_carousel_too_many_columns_raises():
    cols = [{"text": "c", "actions": []} for _ in range(11)]
    with pytest.raises(ValueError):
        validate_payload_for_type(
            "template", {"template": {"type": "carousel", "columns": cols}}
        )


# --- text_v2 ---------------------------------------------------------------

def test_text_v2_ok():
    validate_payload_for_type("text_v2", {"text": "hello"})


def test_text_v2_empty_text_raises():
    with pytest.raises(ValueError):
        validate_payload_for_type("text_v2", {"text": "   "})


# --- quickReply modifier (valid on any type) ------------------------------

def test_quick_reply_ok_on_text():
    payload = {
        "text": "hi",
        "quickReply": {"items": [{"type": "action", "action": {"type": "message", "label": "x", "text": "x"}}]},
    }
    validate_payload_for_type("text", payload)


def test_quick_reply_too_many_items_raises():
    items = [{"type": "action"} for _ in range(14)]
    with pytest.raises(ValueError):
        validate_payload_for_type("text_v2", {"text": "hi", "quickReply": {"items": items}})


def test_quick_reply_empty_items_raises():
    with pytest.raises(ValueError):
        validate_payload_for_type("text_v2", {"text": "hi", "quickReply": {"items": []}})


# --- regression: legacy types stay free-form ------------------------------

@pytest.mark.parametrize("obj_type,payload", [
    ("text", {"text": "anything"}),
    ("flex", {"type": "bubble", "body": {}}),
    ("image", {"url": "https://x", "preview_url": "https://x"}),
    ("sticker", {"package_id": "1", "sticker_id": "2"}),
    ("location", {"title": "t", "latitude": 1.0, "longitude": 2.0}),
])
def test_legacy_types_pass_through(obj_type, payload):
    validate_payload_for_type(obj_type, payload)  # no shape enforced


# --- schema-level: ValidationError (422 path) -----------------------------

def test_schema_rejects_bad_template():
    with pytest.raises(ValidationError):
        ReplyObjectCreate(
            object_id="tmpl_bad",
            name="bad",
            object_type="template",
            payload={"template": {"type": "unknown"}},
        )


def test_schema_accepts_good_text_v2():
    obj = ReplyObjectCreate(
        object_id="tv2_ok",
        name="ok",
        object_type="text_v2",
        payload={"text": "สวัสดี"},
    )
    assert obj.object_type.value == "text_v2"
