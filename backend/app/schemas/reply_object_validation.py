"""
Minimal, per-type payload validation for Reply Objects.

Scope (PR2): validate only the NEW types (`template`, `text_v2`) and the
optional `quickReply` modifier. The original 8 types keep free-form payloads
to avoid regressing existing reply objects. Flex stays free JSON by design.

Each helper raises ValueError on a bad shape; Pydantic turns that into a 422.
"""
from typing import Any, Dict

# LINE Template message sub-types (Messaging API)
TEMPLATE_SUBTYPES = ("buttons", "confirm", "carousel", "image_carousel")

# LINE limits
MAX_QUICK_REPLY_ITEMS = 13
MAX_BUTTONS_ACTIONS = 4
CONFIRM_ACTIONS = 2
MAX_CAROUSEL_COLUMNS = 10


def _require_non_empty_text(value: Any, where: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{where} requires a non-empty 'text'")


def _validate_quick_reply(payload: Dict[str, Any]) -> None:
    """quickReply is an optional modifier valid on any object type."""
    qr = payload.get("quickReply")
    if qr is None:
        return
    if not isinstance(qr, dict):
        raise ValueError("quickReply must be an object with an 'items' array")
    items = qr.get("items")
    if not isinstance(items, list) or len(items) == 0:
        raise ValueError("quickReply.items must be a non-empty array")
    if len(items) > MAX_QUICK_REPLY_ITEMS:
        raise ValueError(
            f"quickReply.items cannot exceed {MAX_QUICK_REPLY_ITEMS} items"
        )


def _validate_template(payload: Dict[str, Any]) -> None:
    tmpl = payload.get("template")
    if not isinstance(tmpl, dict):
        raise ValueError("template payload must contain a 'template' object")

    subtype = tmpl.get("type")
    if subtype not in TEMPLATE_SUBTYPES:
        raise ValueError(
            f"template.type must be one of {list(TEMPLATE_SUBTYPES)}"
        )

    if subtype in ("buttons", "confirm"):
        _require_non_empty_text(tmpl.get("text"), f"template.type '{subtype}'")
        actions = tmpl.get("actions")
        if not isinstance(actions, list) or len(actions) == 0:
            raise ValueError(
                f"template.type '{subtype}' requires a non-empty 'actions' array"
            )
        if subtype == "confirm" and len(actions) != CONFIRM_ACTIONS:
            raise ValueError("template.type 'confirm' requires exactly 2 actions")
        if subtype == "buttons" and len(actions) > MAX_BUTTONS_ACTIONS:
            raise ValueError("template.type 'buttons' allows at most 4 actions")
    else:  # carousel / image_carousel
        columns = tmpl.get("columns")
        if not isinstance(columns, list) or len(columns) == 0:
            raise ValueError(
                f"template.type '{subtype}' requires a non-empty 'columns' array"
            )
        if len(columns) > MAX_CAROUSEL_COLUMNS:
            raise ValueError(
                f"template.type '{subtype}' allows at most 10 columns"
            )


def _validate_text_v2(payload: Dict[str, Any]) -> None:
    _require_non_empty_text(payload.get("text"), "text_v2 payload")


def validate_payload_for_type(object_type: str, payload: Dict[str, Any]) -> None:
    """Validate a reply-object payload against its declared object_type.

    Only `template` and `text_v2` get shape checks; `quickReply` (optional) is
    validated for every type. Unknown/legacy types pass through untouched.
    """
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")

    _validate_quick_reply(payload)

    if object_type == "template":
        _validate_template(payload)
    elif object_type == "text_v2":
        _validate_text_v2(payload)
