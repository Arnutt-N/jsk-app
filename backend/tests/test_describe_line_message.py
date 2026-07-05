"""Unit tests for describe_line_message().

Maps LINE SDK send-message objects to (message_type, content, payload)
rows so the admin live-chat shows the real bot reply instead of the old
"Sent N messages for intent 'X'" summary string.
"""
from linebot.v3.messaging import (
    AudioMessage,
    FlexContainer,
    FlexMessage,
    ImageMessage,
    LocationMessage,
    StickerMessage,
    TextMessage,
    VideoMessage,
)

from app.services.line_service import describe_line_message


def test_text_message_maps_to_text():
    m_type, content, payload = describe_line_message(TextMessage(text="สวัสดี"))
    assert m_type == "text"
    assert content == "สวัสดี"
    assert payload is None


def test_image_message_stores_urls_in_payload():
    msg = ImageMessage(
        original_content_url="https://cdn.example/full.jpg",
        preview_image_url="https://cdn.example/prev.jpg",
    )
    m_type, content, payload = describe_line_message(msg)
    assert m_type == "image"
    assert payload == {
        "url": "https://cdn.example/full.jpg",
        "preview_url": "https://cdn.example/prev.jpg",
    }


def test_video_message_stores_urls_in_payload():
    msg = VideoMessage(
        original_content_url="https://cdn.example/v.mp4",
        preview_image_url="https://cdn.example/p.jpg",
    )
    m_type, content, payload = describe_line_message(msg)
    assert m_type == "video"
    assert payload["url"] == "https://cdn.example/v.mp4"


def test_audio_message_stores_url_and_duration():
    msg = AudioMessage(original_content_url="https://cdn.example/a.m4a", duration=3000)
    m_type, content, payload = describe_line_message(msg)
    assert m_type == "audio"
    assert payload == {"url": "https://cdn.example/a.m4a", "duration": 3000}


def test_sticker_message_stores_string_ids():
    m_type, content, payload = describe_line_message(
        StickerMessage(package_id="446", sticker_id="1988")
    )
    assert m_type == "sticker"
    assert payload == {"package_id": "446", "sticker_id": "1988"}


def test_location_message_keeps_title_and_coords():
    msg = LocationMessage(
        title="สำนักงาน", address="ถ.ตัวอย่าง", latitude=13.75, longitude=100.5
    )
    m_type, content, payload = describe_line_message(msg)
    assert m_type == "location"
    assert "สำนักงาน" in content
    assert payload["lat"] == 13.75
    assert payload["lng"] == 100.5


def test_flex_message_uses_alt_text_as_content():
    container = FlexContainer.from_dict(
        {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [{"type": "text", "text": "hi"}],
            },
        }
    )
    m_type, content, payload = describe_line_message(
        FlexMessage(alt_text="เมนูบริการ", contents=container)
    )
    assert m_type == "flex"
    assert content == "เมนูบริการ"


def test_unknown_object_falls_back_to_text_with_nonempty_content():
    class Weird:
        pass

    m_type, content, payload = describe_line_message(Weird())
    assert m_type == "text"
    assert content
    assert payload is None
