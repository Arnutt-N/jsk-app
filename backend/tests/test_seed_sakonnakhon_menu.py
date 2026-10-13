"""Menu-object seed tests (pure payload shapes; DB apply verified on dev)."""
from scripts.seed_sakonnakhon_menu import (
    MENU_ALT,
    MENU_SIZE,
    SOCIAL_TEXT,
    _sniff_magic,
    build_menu_payload,
    build_social_payload,
)


def test_menu_payload_six_zones_in_bounds():
    payload = build_menu_payload("https://example.com/menu.jpg")
    assert payload["base_url"] == "https://example.com/menu.jpg"
    assert payload["base_size"] == MENU_SIZE
    assert len(payload["actions"]) == 6
    texts = set()
    for action in payload["actions"]:
        assert action["type"] == "message"
        area = action["area"]
        assert 0 <= area["x"] < MENU_SIZE["width"]
        assert 0 <= area["y"] < MENU_SIZE["height"]
        assert area["x"] + area["width"] <= MENU_SIZE["width"]
        assert area["y"] + area["height"] <= MENU_SIZE["height"]
        texts.add(action["text"])
    assert texts == {
        "ลงทะเบียน", "ยื่นขอรับบริการ", "ให้บริการปรึกษากฎหมาย",
        "ศูนย์ยุติธรรมชุมชน", "Social Media", "ติดต่อหน่วยงาน",
    }


def test_social_payload_quick_reply():
    payload = build_social_payload()
    assert payload["text"] == SOCIAL_TEXT
    items = payload["quickReply"]["items"]
    assert len(items) == 3
    assert [i["action"]["label"] for i in items] == [
        "Website", "Facebook", "ยกเลิก",
    ]
    assert items[0]["action"]["uri"].startswith("https://")
    assert items[2]["action"]["type"] == "message"


def test_sniff_magic():
    assert _sniff_magic(b"\xff\xd8\xff rest") == "image/jpeg"
    assert _sniff_magic(b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert _sniff_magic(b"GIF89a") == ""
    assert MENU_ALT  # alt text present for the object row
