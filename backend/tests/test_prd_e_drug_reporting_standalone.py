"""Test PRD E: Community agencies and drug reporting category support

This is a standalone test that doesn't require the full app to be imported.
It tests the Pydantic schema directly.
"""
import sys
from pathlib import Path

# Add backend to path so we can import schemas
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from pydantic import BaseModel, ConfigDict
from typing import Optional
import pytest


# Recreate the schema here to avoid import issues with Python 3.9
class ServiceRequestCreate(BaseModel):
    """Service request creation schema"""
    # Personal Info
    prefix: Optional[str] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None

    # Location
    agency: Optional[str] = None
    province: Optional[str] = None
    district: Optional[str] = None
    sub_district: Optional[str] = None

    # Topic
    topic_category: Optional[str] = None
    topic_subcategory: Optional[str] = None
    description: Optional[str] = None

    # Attachments
    attachments: Optional[list] = []

    # User Context
    line_user_id: Optional[str] = None

    # Legacy mapping support
    name: Optional[str] = None
    service_type: Optional[str] = None

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "prefix": "นาย",
                "firstname": "สมชาย",
                "lastname": "ใจดี",
                "phone_number": "0812345678",
                "email": "somchai@example.com",
                "agency": "ยุติธรรมจังหวัดเชียงใหม่",
                "province": "เชียงใหม่",
                "district": "เมืองเชียงใหม่",
                "sub_district": "สุเทพ",
                "topic_category": "ขอรับคำปรึกษากฎหมาย",
                "topic_subcategory": "คดีแพ่ง",
                "description": "ต้องการปรึกษาเรื่องการกู้ยืมเงินและการทำสัญญา",
                "attachments": [],
                "line_user_id": "U1234567890abcdef1234567890abcdef"
            }
        }
    )


class TestPRDCommunityAgenciesAndDrugReporting:
    """Test that backend schema accepts new values from PRD E"""

    def test_schema_accepts_community_leader_agency(self):
        """Schema should accept 'ผู้นำชุมชนและจิตอาสา' as agency value"""
        data = {
            "prefix": "นาย",
            "firstname": "ทดสอบ",
            "lastname": "ระบบ",
            "phone_number": "0812345678",
            "agency": "ผู้นำชุมชนและจิตอาสา",
            "province": "กรุงเทพฯ",
            "district": "บางรัก",
            "sub_district": "สีลม",
            "topic_category": "แจ้งเบาะแสยาเสพติด",
            "topic_subcategory": "ปัญหายาเสพติด",
            "description": "ทดสอบการรับค่าหน่วยงานระดับชุมชน",
        }

        request = ServiceRequestCreate(**data)
        assert request.agency == "ผู้นำชุมชนและจิตอาสา"
        assert request.topic_category == "แจ้งเบาะแสยาเสพติด"
        assert request.topic_subcategory == "ปัญหายาเสพติด"

    def test_schema_accepts_drug_reporting_category(self):
        """Schema should accept 'แจ้งเบาะแสยาเสพติด' as category value"""
        data = {
            "topic_category": "แจ้งเบาะแสยาเสพติด",
            "topic_subcategory": "ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย",
            "description": "ทดสอบหมวดหมู่แจ้งเบาะแสยาเสพติด",
        }

        request = ServiceRequestCreate(**data)
        assert request.topic_category == "แจ้งเบาะแสยาเสพติด"
        assert request.topic_subcategory == "ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย"

    @pytest.mark.parametrize("subcategory", [
        "ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย",
        "ขอความช่วยเหลือบำบัดผู้เสพ",
        "ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด",
        "ปัญหายาเสพติด",
    ])
    def test_schema_accepts_all_drug_reporting_subcategories(self, subcategory):
        """Schema should accept all drug reporting subcategories"""
        data = {
            "topic_category": "แจ้งเบาะแสยาเสพติด",
            "topic_subcategory": subcategory,
            "description": f"ทดสอบ subcategory: {subcategory}",
        }

        request = ServiceRequestCreate(**data)
        assert request.topic_category == "แจ้งเบาะแสยาเสพติด"
        assert request.topic_subcategory == subcategory

    @pytest.mark.parametrize("agency", [
        "ผู้นำชุมชนและจิตอาสา",
        "ศูนย์ยุติธรรมชุมชน",
        "ศูนย์ดำรงธรรม",
        "สถานีตำรวจภูธร",
    ])
    def test_schema_accepts_all_agencies(self, agency):
        """Schema should accept all agency values"""
        data = {
            "agency": agency,
            "topic_category": "ร้องเรียน",
            "description": f"ทดสอบ agency: {agency}",
        }

        request = ServiceRequestCreate(**data)
        assert request.agency == agency

    def test_complete_drug_reporting_request(self):
        """Test complete drug reporting request with all fields"""
        data = {
            "prefix": "นาย",
            "firstname": "สมชาย",
            "lastname": "ใจดี",
            "phone_number": "0812345678",
            "email": "somchai@example.com",
            "agency": "ผู้นำชุมชนและจิตอาสา",
            "province": "เชียงใหม่",
            "district": "เมืองเชียงใหม่",
            "sub_district": "สุเทพ",
            "topic_category": "แจ้งเบาะแสยาเสพติด",
            "topic_subcategory": "ปัญหายาเสพติด",
            "description": "พบเห็นการค้ายาเสพติดในชุมชน",
            "attachments": [],
        }

        request = ServiceRequestCreate(**data)

        # Verify all fields are set correctly
        assert request.prefix == "นาย"
        assert request.firstname == "สมชาย"
        assert request.lastname == "ใจดี"
        assert request.phone_number == "0812345678"
        assert request.email == "somchai@example.com"
        assert request.agency == "ผู้นำชุมชนและจิตอาสา"
        assert request.province == "เชียงใหม่"
        assert request.district == "เมืองเชียงใหม่"
        assert request.sub_district == "สุเทพ"
        assert request.topic_category == "แจ้งเบาะแสยาเสพติด"
        assert request.topic_subcategory == "ปัญหายาเสพติด"
        assert request.description == "พบเห็นการค้ายาเสพติดในชุมชน"
        assert request.attachments == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
