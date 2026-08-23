from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List

from app.api.deps import get_db, get_current_admin, require_permission
from app.core.permissions import KEY_MANAGE_AUTO_REPLIES
from app.models.intent import IntentCategory, IntentKeyword, IntentResponse, MatchType, ReplyType
from app.models.user import User
from app.schemas.intent import (
    IntentCategoryCreate, IntentCategoryUpdate, IntentCategoryResponse, IntentCategoryDetailResponse,
    IntentKeywordCreate, IntentKeywordUpdate, IntentKeywordResponse,
    IntentResponseCreate, IntentResponseUpdate, IntentResponseResponse
)

router = APIRouter()


# --- Categories ---
@router.get("/categories", response_model=List[IntentCategoryResponse])
async def list_categories(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin)
):
    """List all intent categories with row counts."""
    stmt = select(IntentCategory).order_by(IntentCategory.name).offset(skip).limit(limit)
    result = await db.execute(stmt)
    categories = result.scalars().all()

    if not categories:
        return []

    cat_ids = [cat.id for cat in categories]

    # Aggregate counts for ALL categories in one query each instead of
    # 3 round-trips per category (N=100 => ~301 queries before).
    kw_count_rows = (await db.execute(
        select(IntentKeyword.category_id, func.count(IntentKeyword.id))
        .where(IntentKeyword.category_id.in_(cat_ids))
        .group_by(IntentKeyword.category_id)
    )).all()
    kw_count_map = {row[0]: int(row[1]) for row in kw_count_rows}

    # active = is_active == True — ตรงเกณฑ์ serviceable ใน webhook.py:249.
    resp_count_rows = (await db.execute(
        select(
            IntentResponse.category_id,
            func.count(IntentResponse.id),
            func.count(IntentResponse.id).filter(IntentResponse.is_active == True),
        )
        .where(IntentResponse.category_id.in_(cat_ids))
        .group_by(IntentResponse.category_id)
    )).all()
    resp_total_map = {row[0]: int(row[1]) for row in resp_count_rows}
    resp_active_map = {row[0]: int(row[2]) for row in resp_count_rows}

    # First 5 keyword previews for every category via one windowed query.
    kw_rownum = (
        func.row_number()
        .over(partition_by=IntentKeyword.category_id, order_by=IntentKeyword.id)
        .label("rn")
    )
    kw_window = (
        select(
            IntentKeyword.category_id.label("cid"),
            IntentKeyword.keyword.label("kw"),
            kw_rownum,
        )
        .where(IntentKeyword.category_id.in_(cat_ids))
        .subquery()
    )
    preview_rows = (await db.execute(
        select(kw_window.c.cid, kw_window.c.kw).where(kw_window.c.rn <= 5)
    )).all()
    preview_map: dict[int, List[str]] = {}
    for cid, kw in preview_rows:
        preview_map.setdefault(cid, []).append(kw)

    out = []
    for cat in categories:
        resp = IntentCategoryResponse.model_validate(cat)
        resp.keyword_count = kw_count_map.get(cat.id, 0)
        resp.response_count = resp_total_map.get(cat.id, 0)
        resp.active_response_count = resp_active_map.get(cat.id, 0)
        resp.keywords_preview = preview_map.get(cat.id, [])
        out.append(resp)

    return out

@router.post("/categories", response_model=IntentCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(data: IntentCategoryCreate, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    # Check uniqueness
    existing = await db.execute(select(IntentCategory).filter(IntentCategory.name == data.name))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Category name already exists")
    
    cat = IntentCategory(**data.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat

@router.get("/categories/{cat_id}", response_model=IntentCategoryDetailResponse)
async def get_category(cat_id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(get_current_admin)):
    stmt = select(IntentCategory).options(
        selectinload(IntentCategory.keywords),
        selectinload(IntentCategory.responses)
    ).filter(IntentCategory.id == cat_id)
    result = await db.execute(stmt)
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat

@router.put("/categories/{cat_id}", response_model=IntentCategoryResponse)
async def update_category(cat_id: int, data: IntentCategoryUpdate, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    result = await db.execute(select(IntentCategory).filter(IntentCategory.id == cat_id))
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    payload = data.model_dump(exclude_unset=True)

    # Guard (#122 follow-up): ห้ามเปิดใช้งานหมวดที่ยังไม่มี active response.
    # เกณฑ์ serviceable ตรงกับ webhook.py:249 (is_active AND >=1 active response).
    if payload.get("is_active") is True:
        active_count = await db.scalar(
            select(func.count(IntentResponse.id)).where(
                IntentResponse.category_id == cat_id,
                IntentResponse.is_active == True,
            )
        )
        if not active_count:
            raise HTTPException(
                status_code=400,
                detail="ไม่สามารถเปิดใช้งานหมวดนี้ได้ เพราะยังไม่มีการตอบกลับที่เปิดใช้งาน (active response) — กรุณาเพิ่มอย่างน้อย 1 รายการก่อน",
            )

    for field, value in payload.items():
        setattr(cat, field, value)

    await db.commit()
    await db.refresh(cat)
    return cat

@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(cat_id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    result = await db.execute(select(IntentCategory).filter(IntentCategory.id == cat_id))
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    
    await db.delete(cat)
    await db.commit()
    return None

# --- Keywords ---
@router.post("/keywords", response_model=IntentKeywordResponse, status_code=status.HTTP_201_CREATED)
async def create_keyword(data: IntentKeywordCreate, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    keyword = IntentKeyword(**data.model_dump())
    db.add(keyword)
    await db.commit()
    await db.refresh(keyword)
    return keyword

@router.put("/keywords/{k_id}", response_model=IntentKeywordResponse)
async def update_keyword(k_id: int, data: IntentKeywordUpdate, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    result = await db.execute(select(IntentKeyword).filter(IntentKeyword.id == k_id))
    kw = result.scalars().first()
    if not kw:
        raise HTTPException(status_code=404, detail="Keyword not found")
    
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(kw, field, value)
    
    await db.commit()
    await db.refresh(kw)
    return kw

@router.delete("/keywords/{k_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_keyword(k_id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    result = await db.execute(select(IntentKeyword).filter(IntentKeyword.id == k_id))
    kw = result.scalars().first()
    if not kw:
        raise HTTPException(status_code=404, detail="Keyword not found")
    
    await db.delete(kw)
    await db.commit()
    return None

# --- Responses ---
@router.post("/responses", response_model=IntentResponseResponse, status_code=status.HTTP_201_CREATED)
async def create_intent_response(data: IntentResponseCreate, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    res = IntentResponse(**data.model_dump())
    db.add(res)
    await db.commit()
    await db.refresh(res)
    return res

@router.put("/responses/{r_id}", response_model=IntentResponseResponse)
async def update_intent_response(r_id: int, data: IntentResponseUpdate, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    result = await db.execute(select(IntentResponse).filter(IntentResponse.id == r_id))
    res = result.scalars().first()
    if not res:
        raise HTTPException(status_code=404, detail="Response not found")
    
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(res, field, value)
    
    await db.commit()
    await db.refresh(res)
    return res

@router.delete("/responses/{r_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_intent_response(r_id: int, db: AsyncSession = Depends(get_db), current_admin: User = Depends(require_permission(KEY_MANAGE_AUTO_REPLIES))):
    result = await db.execute(select(IntentResponse).filter(IntentResponse.id == r_id))
    res = result.scalars().first()
    if not res:
        raise HTTPException(status_code=404, detail="Response not found")
    
    await db.delete(res)
    await db.commit()
    return None
