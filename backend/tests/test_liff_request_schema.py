"""LIFF create-schema caps + typed attachments (R3-M10). Pure pydantic, no DB."""

import pytest
from pydantic import ValidationError

from app.schemas.service_request_liff import ServiceRequestCreate


def _attachment(i=0):
    return {"id": f"m{i}", "url": f"/api/v1/media/{i}", "name": f"f{i}.png"}


def test_firstname_over_cap_rejected():
    with pytest.raises(ValidationError):
        ServiceRequestCreate(topic_category="x", firstname="ก" * 101)


def test_four_attachments_rejected():
    with pytest.raises(ValidationError):
        ServiceRequestCreate(
            topic_category="x", attachments=[_attachment(i) for i in range(4)]
        )


def test_bad_attachment_shape_rejected():
    with pytest.raises(ValidationError):
        ServiceRequestCreate(topic_category="x", attachments=[{"nope": 1}])


def test_valid_minimal_payload_passes():
    obj = ServiceRequestCreate(
        topic_category="ขอรับคำปรึกษา", firstname="สมชาย", attachments=[_attachment()]
    )
    assert obj.firstname == "สมชาย"
    assert obj.attachments[0].id == "m0"
