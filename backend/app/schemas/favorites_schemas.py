from pydantic import BaseModel
from typing import Optional, List

class FavoriteItemSchema(BaseModel):
    id: int
    part_id: int
    article: str
    part_name: str
    brand_name: Optional[str] = None

    class Config:
        from_attributes = True

class FavoritePartResult(BaseModel):
    id: int
    article: str
    name: str
    brand_id: int
    brand: Optional[str] = None
    price: Optional[float] = None
    quantity: Optional[int] = None
    currency: Optional[str] = 'UAH'
    image_url: Optional[str] = None

class FavoriteListResponse(BaseModel):
    items: List[FavoritePartResult]
    total: int
    page: int
    page_size: int

class FavoriteAddSchema(BaseModel):
    part_id: int
