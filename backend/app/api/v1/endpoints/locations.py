from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.geography import District, Province, SubDistrict

router = APIRouter()

# --- Schemas ---

class ProvinceOut(BaseModel):
    PROVINCE_ID: int = Field(..., description="Unique ID of the province")
    PROVINCE_THAI: str = Field(..., description="Thai name of the province", examples=["กรุงเทพมหานคร"])
    PROVINCE_ENGLISH: str = Field(..., description="English name of the province", examples=["Bangkok"])

class DistrictOut(BaseModel):
    DISTRICT_ID: int = Field(..., description="Unique ID of the district")
    PROVINCE_ID: int = Field(..., description="ID of the parent province")
    DISTRICT_THAI: str = Field(..., description="Thai name of the district", examples=["เขตพระนคร"])
    DISTRICT_ENGLISH: str = Field(..., description="English name of the district", examples=["Phra Nakhon"])

class SubDistrictOut(BaseModel):
    SUB_DISTRICT_ID: int = Field(..., description="Unique ID of the sub-district")
    DISTRICT_ID: int = Field(..., description="ID of the parent district")
    SUB_DISTRICT_THAI: str = Field(..., description="Thai name of the sub-district", examples=["พระบรมมหาราชวัง"])
    SUB_DISTRICT_ENGLISH: str = Field(..., description="English name of the sub-district", examples=["Phra Borom Maha Ratchawang"])

# --- Endpoints ---

@router.get(
    "/provinces",
    response_model=List[ProvinceOut],
    summary="Get All Provinces",
    description="Retrieve a list of all administrative provinces in Thailand, ordered by Thai name.",
    response_description="List of provinces with IDs and bi-lingual names."
)
async def get_provinces(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Province).order_by(Province.name_th))
    provinces = result.scalars().all()
    # Map to frontend format
    return [
        {
            "PROVINCE_ID": p.id,
            "PROVINCE_THAI": p.name_th,
            "PROVINCE_ENGLISH": p.name_en
        } for p in provinces
    ]

@router.get(
    "/provinces/{province_id}/districts",
    response_model=List[DistrictOut],
    summary="Get Districts by Province",
    description="Retrieve all districts (Amphoe) belonging to a specific province.",
    responses={404: {"description": "Province not found or no districts available"}}
)
async def get_districts(province_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(District)
        .where(District.province_id == province_id)
        .order_by(District.name_th)
    )
    districts = result.scalars().all()
    # Map to frontend format
    return [
        {
            "DISTRICT_ID": d.id,
            "PROVINCE_ID": d.province_id,
            "DISTRICT_THAI": d.name_th,
            "DISTRICT_ENGLISH": d.name_en
        } for d in districts
    ]

@router.get(
    "/districts/{district_id}/sub-districts",
    response_model=List[SubDistrictOut],
    summary="Get Sub-Districts by District",
    description="Retrieve all sub-districts (Tambon) belonging to a specific district.",
    responses={404: {"description": "District not found or no sub-districts available"}}
)
async def get_sub_districts(district_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SubDistrict)
        .where(SubDistrict.district_id == district_id)
        .order_by(SubDistrict.name_th)
    )
    sub_districts = result.scalars().all()
    # Map to frontend format
    return [
        {
            "SUB_DISTRICT_ID": s.id,
            "DISTRICT_ID": s.district_id,
            "SUB_DISTRICT_THAI": s.name_th,
            "SUB_DISTRICT_ENGLISH": s.name_en
        } for s in sub_districts
    ]
