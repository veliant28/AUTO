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

class FavoriteAddSchema(BaseModel):
    part_id: int
