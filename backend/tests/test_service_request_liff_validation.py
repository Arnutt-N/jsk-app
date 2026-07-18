"""Server-side validation for the LIFF ServiceRequestCreate payload.

Regression guard for the empty-body gap: with LIFF_STRICT_MODE=false a bare
`POST {}` used to validate (every field was Optional) and write a junk row
(requester_name='None None', all content NULL). The schema now requires some
content — a topic (topic_category or legacy service_type) or a description.

The requester NAME is intentionally NOT required: drug-reporting tips are
submitted anonymously, so content-without-name is valid.
"""
import pytest
from pydantic import ValidationError

from app.schemas.service_request_liff import ServiceRequestCreate


def _valid_payload(**overrides):
    base = {
        "prefix": "นาย",
        "firstname": "สมชาย",
        "lastname": "ใจดี",
        "phone_number": "0812345678",
        "topic_category": "ร้องเรียน/ร้องทุกข์",
        "description": "รายละเอียดเรื่องร้องเรียน",
    }
    base.update(overrides)
    return base


def test_full_valid_payload_passes():
    obj = ServiceRequestCreate(**_valid_payload())
    assert obj.firstname == "สมชาย"


def test_legacy_name_and_service_type_pass():
    # Legacy path: `name` fallback + `service_type` instead of the split fields.
    obj = ServiceRequestCreate(
        name="สมหญิง จริงใจ",
        service_type="ขอคำปรึกษา",
        description="ปรึกษาเรื่องสัญญา",
    )
    assert obj.name == "สมหญิง จริงใจ"


def test_empty_body_rejected():
    with pytest.raises(ValidationError):
        ServiceRequestCreate()


def test_name_without_content_rejected():
    with pytest.raises(ValidationError):
        ServiceRequestCreate(firstname="สมชาย", lastname="ใจดี")


def test_anonymous_content_without_name_passes():
    # Anonymous drug-report tip: content but no requester name is valid.
    obj = ServiceRequestCreate(
        topic_category="แจ้งเบาะแสยาเสพติด",
        description="พบเห็นการค้ายาเสพติดในชุมชน",
    )
    assert obj.topic_category == "แจ้งเบาะแสยาเสพติด"


def test_missing_topic_and_description_rejected():
    # Name/phone but no content of any kind is junk.
    with pytest.raises(ValidationError):
        ServiceRequestCreate(firstname="สมชาย", lastname="ใจดี", phone_number="0812345678")


def test_description_alone_passes():
    # Content requirement is satisfied by a description alone.
    obj = ServiceRequestCreate(description="รายละเอียดปัญหา")
    assert obj.description == "รายละเอียดปัญหา"


def test_service_type_alone_passes():
    # Legacy `service_type` counts as content.
    obj = ServiceRequestCreate(service_type="ขอคำปรึกษา")
    assert obj.service_type == "ขอคำปรึกษา"


def test_whitespace_only_content_rejected():
    with pytest.raises(ValidationError):
        ServiceRequestCreate(firstname="สมชาย", lastname="ใจดี", description="   ")
