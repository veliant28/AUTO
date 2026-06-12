from pydantic import BaseModel
from typing import Optional, List

class PartCategorySchema(BaseModel):
    id: int
    name: str
    name_ua: Optional[str] = None
    name_en: Optional[str] = None
    tecdoc_id: Optional[int] = None
    parent_id: Optional[int] = None
    depth: int = 0

    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name: str
    name_ua: Optional[str] = None
    name_en: Optional[str] = None
    parent_id: Optional[int] = None

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    name_ua: Optional[str] = None
    name_en: Optional[str] = None
    parent_id: Optional[int] = None

class CategoryListResponse(BaseModel):
    items: List[PartCategorySchema]
    total: int
    page: int
    page_size: int

class PartSchema(BaseModel):
    id: int
    article: str
    name: str
    brand_id: int
    brand: Optional[str] = None
    tecdoc_id: Optional[int]
    category_id: Optional[int]
    price: Optional[float] = None
    quantity: Optional[int] = None
    supplier_name: Optional[str] = None
    currency: Optional[str] = 'UAH'
    image_url: Optional[str] = None

    class Config:
        from_attributes = True


class PartListResponse(BaseModel):
    items: List[PartSchema]
    total: int
    page: int
    page_size: int

class ArtInfoSchema(BaseModel):
    name: str
    brand: str
    tecdoc_id: Optional[int]
    description: Optional[str]
    attributes: List[dict] = []

class CrossSchema(BaseModel):
    article: str
    brand: str
    type: str

class ImageSchema(BaseModel):
    url: str
    type: str

class PartDetailSchema(BaseModel):
    info: ArtInfoSchema
    crosses: List[CrossSchema] = []
    images: List[ImageSchema] = []
