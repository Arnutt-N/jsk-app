"""Tests for response_parser.build_message_from_object — all 8 message types."""
from types import SimpleNamespace

import pytest
from linebot.v3.messaging import (
    TextMessage,
    FlexMessage,
    ImageMessage,
    StickerMessage,
    LocationMessage,
    VideoMessage,
    AudioMessage,
    ImagemapMessage,
)

from app.models.reply_object import ObjectType
from app.services.response_parser import build_message_from_object


def _reply_obj(object_type, payload, alt_text=None, name="test_obj", object_id="test_1"):
    """Helper to create a mock ReplyObject."""
    return SimpleNamespace(
        object_id=object_id,
        name=name,
        object_type=object_type,
        payload=payload,
        alt_text=alt_text,
    )


# --- Happy path: all 8 types ---


def test_build_text_message():
    obj = _reply_obj(ObjectType.TEXT, {"text": "สวัสดี"})
    msg = build_message_from_object(obj)
    assert isinstance(msg, TextMessage)
    assert msg.text == "สวัสดี"


def test_build_flex_message():
    payload = {
        "type": "bubble",
        "body": {"type": "box", "layout": "vertical", "contents": []},
    }
    obj = _reply_obj(ObjectType.FLEX, payload, alt_text="Flex alt")
    msg = build_message_from_object(obj)
    assert isinstance(msg, FlexMessage)
    assert msg.alt_text == "Flex alt"


def test_build_image_message():
    payload = {"url": "https://example.com/img.png", "preview_url": "https://example.com/preview.png"}
    obj = _reply_obj(ObjectType.IMAGE, payload)
    msg = build_message_from_object(obj)
    assert isinstance(msg, ImageMessage)
    assert msg.original_content_url == "https://example.com/img.png"
    assert msg.preview_image_url == "https://example.com/preview.png"


def test_build_sticker_message():
    payload = {"package_id": "11537", "sticker_id": "52002734"}
    obj = _reply_obj(ObjectType.STICKER, payload)
    msg = build_message_from_object(obj)
    assert isinstance(msg, StickerMessage)
    assert msg.package_id == "11537"
    assert msg.sticker_id == "52002734"


def test_build_location_message():
    payload = {
        "title": "สำนักงาน",
        "address": "กรุงเทพฯ",
        "latitude": 13.7563,
        "longitude": 100.5018,
    }
    obj = _reply_obj(ObjectType.LOCATION, payload)
    msg = build_message_from_object(obj)
    assert isinstance(msg, LocationMessage)
    assert msg.title == "สำนักงาน"
    assert msg.latitude == pytest.approx(13.7563)


def test_build_video_message():
    payload = {
        "original_content_url": "https://example.com/video.mp4",
        "preview_image_url": "https://example.com/thumb.jpg",
    }
    obj = _reply_obj(ObjectType.VIDEO, payload)
    msg = build_message_from_object(obj)
    assert isinstance(msg, VideoMessage)
    assert msg.original_content_url == "https://example.com/video.mp4"
    assert msg.preview_image_url == "https://example.com/thumb.jpg"


def test_build_audio_message():
    payload = {"original_content_url": "https://example.com/audio.mp3", "duration": 5000}
    obj = _reply_obj(ObjectType.AUDIO, payload)
    msg = build_message_from_object(obj)
    assert isinstance(msg, AudioMessage)
    assert msg.original_content_url == "https://example.com/audio.mp3"
    assert msg.duration == 5000


def test_build_imagemap_message():
    payload = {
        "base_url": "https://example.com/imagemap",
        "base_size": {"width": 1040, "height": 1040},
        "actions": [{"type": "uri", "linkUri": "https://example.com", "area": {"x": 0, "y": 0, "width": 520, "height": 1040}}],
    }
    obj = _reply_obj(ObjectType.IMAGEMAP, payload, alt_text="ImageMap alt")
    msg = build_message_from_object(obj)
    assert isinstance(msg, ImagemapMessage)
    assert msg.base_url == "https://example.com/imagemap"
    assert msg.alt_text == "ImageMap alt"
    assert msg.base_size.width == 1040


# --- Edge cases ---


def test_video_fallback_to_url():
    """VIDEO payload ใช้ url เป็น fallback สำหรับทั้ง 2 fields"""
    payload = {"url": "https://example.com/video.mp4"}
    obj = _reply_obj(ObjectType.VIDEO, payload)
    msg = build_message_from_object(obj)
    assert isinstance(msg, VideoMessage)
    assert msg.original_content_url == "https://example.com/video.mp4"
    assert msg.preview_image_url == "https://example.com/video.mp4"


def test_audio_missing_duration_defaults_to_zero():
    """AUDIO payload ไม่มี duration → default เป็น 0"""
    payload = {"original_content_url": "https://example.com/audio.mp3"}
    obj = _reply_obj(ObjectType.AUDIO, payload)
    msg = build_message_from_object(obj)
    assert isinstance(msg, AudioMessage)
    assert msg.duration == 0


def test_audio_fallback_to_url():
    """AUDIO payload ใช้ url เป็น fallback"""
    payload = {"url": "https://example.com/audio.mp3", "duration": 3000}
    obj = _reply_obj(ObjectType.AUDIO, payload)
    msg = build_message_from_object(obj)
    assert isinstance(msg, AudioMessage)
    assert msg.original_content_url == "https://example.com/audio.mp3"


def test_imagemap_alt_text_fallback_to_name():
    """IMAGEMAP ไม่มี alt_text → ใช้ obj.name เป็น fallback"""
    payload = {
        "base_url": "https://example.com/imagemap",
        "base_size": {"width": 1040, "height": 520},
        "actions": [],
    }
    obj = _reply_obj(ObjectType.IMAGEMAP, payload, alt_text=None, name="My ImageMap")
    msg = build_message_from_object(obj)
    assert isinstance(msg, ImagemapMessage)
    assert msg.alt_text == "ImageMap: My ImageMap"


def test_imagemap_missing_base_size_defaults():
    """IMAGEMAP ไม่มี base_size → default เป็น 1040x1040"""
    payload = {
        "base_url": "https://example.com/imagemap",
        "actions": [],
    }
    obj = _reply_obj(ObjectType.IMAGEMAP, payload, alt_text="alt")
    msg = build_message_from_object(obj)
    assert isinstance(msg, ImagemapMessage)
    assert msg.base_size.width == 1040
    assert msg.base_size.height == 1040


def test_imagemap_fallback_to_url():
    """IMAGEMAP payload ใช้ url เป็น fallback สำหรับ base_url"""
    payload = {
        "url": "https://example.com/imagemap",
        "base_size": {"width": 1040, "height": 1040},
        "actions": [],
    }
    obj = _reply_obj(ObjectType.IMAGEMAP, payload, alt_text="alt")
    msg = build_message_from_object(obj)
    assert isinstance(msg, ImagemapMessage)
    assert msg.base_url == "https://example.com/imagemap"


def test_unsupported_type_returns_none():
    """Object type ที่ไม่รองรับ → return None"""
    obj = _reply_obj("future_type", {})
    msg = build_message_from_object(obj)
    assert msg is None


def test_image_fallback_preview_url():
    """IMAGE ไม่มี preview_url → ใช้ url แทน"""
    payload = {"url": "https://example.com/img.png"}
    obj = _reply_obj(ObjectType.IMAGE, payload)
    msg = build_message_from_object(obj)
    assert isinstance(msg, ImageMessage)
    assert msg.preview_image_url == "https://example.com/img.png"
