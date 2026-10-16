import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.taxonomy_service import taxonomy_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", summary="Shared service taxonomy as a bare map")
async def get_taxonomy(db: AsyncSession = Depends(get_db)):
    return await taxonomy_service.get_taxonomy_map(db)
