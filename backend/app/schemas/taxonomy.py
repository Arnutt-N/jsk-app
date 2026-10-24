from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, RootModel


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sort_order: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class TopicCreate(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=200)
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True


class TopicUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sort_order: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class TopicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    name: str
    sort_order: int
    is_active: bool


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sort_order: int
    is_active: bool
    topics: List[TopicRead] = Field(default_factory=list)


class AdminTaxonomyRead(BaseModel):
    categories: List[CategoryRead] = Field(default_factory=list)


class TaxonomyMapResponse(RootModel[Dict[str, List[str]]]):
    pass
