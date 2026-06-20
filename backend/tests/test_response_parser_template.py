"""Tests for template / text_v2 / quickReply support in build_message_from_object."""
from types import SimpleNamespace

from linebot.v3.messaging import TextMessage, TemplateMessage
from app.models.reply_object import ObjectType
from app.services.response_parser import build_message_from_object


def _obj(object_type, payload, *, name="t", alt_text=None, object_id="x"):
    return SimpleNamespace(
        object_type=object_type,
        payload=payload,
        name=name,
        alt_text=alt_text,
        object_id=object_id,
    )


def test_text_v2_builds_text_message():
    msg = build_message_from_object(_obj(ObjectType.TEXT_V2, {"text": "hi"}))
    assert isinstance(msg, TextMessage)
    assert msg.text == "hi"


def test_template_buttons_builds_template_message():
    payload = {
        "template": {
            "type": "buttons",
            "text": "pick",
            "actions": [{"type": "message", "label": "a", "text": "a"}],
        }
    }
    msg = build_message_from_object(_obj(ObjectType.TEMPLATE, payload, alt_text="menu"))
    assert isinstance(msg, TemplateMessage)
    assert msg.alt_text == "menu"
    assert msg.template.type == "buttons"
    assert len(msg.template.actions) == 1


def test_template_confirm_builds_template_message():
    payload = {
        "template": {
            "type": "confirm",
            "text": "ok?",
            "actions": [
                {"type": "message", "label": "y", "text": "y"},
                {"type": "message", "label": "n", "text": "n"},
            ],
        }
    }
    msg = build_message_from_object(_obj(ObjectType.TEMPLATE, payload))
    assert isinstance(msg, TemplateMessage)
    assert msg.template.type == "confirm"


def test_quick_reply_attached_to_text():
    payload = {
        "text": "hi",
        "quickReply": {
            "items": [{"type": "action", "action": {"type": "message", "label": "go", "text": "go"}}]
        },
    }
    msg = build_message_from_object(_obj(ObjectType.TEXT_V2, payload))
    assert msg is not None
    assert msg.quick_reply is not None
    assert len(msg.quick_reply.items) == 1


def test_quick_reply_attached_to_template():
    payload = {
        "template": {
            "type": "buttons",
            "text": "p",
            "actions": [{"type": "message", "label": "a", "text": "a"}],
        },
        "quickReply": {
            "items": [{"type": "action", "action": {"type": "message", "label": "q", "text": "q"}}]
        },
    }
    msg = build_message_from_object(_obj(ObjectType.TEMPLATE, payload))
    assert isinstance(msg, TemplateMessage)
    assert msg.quick_reply is not None


def test_no_quick_reply_leaves_attribute_none():
    msg = build_message_from_object(_obj(ObjectType.TEXT_V2, {"text": "plain"}))
    assert msg.quick_reply is None
