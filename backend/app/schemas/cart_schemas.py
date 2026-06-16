from pydantic import BaseModel
from typing import Optional, List

class CartItemSchema(BaseModel):
    id: int
    part_id: int
    article: str
    part_name: str
    quantity: int
    price: Optional[float]
    supplier_name: Optional[str]
    brand: Optional[str] = None
    image_url: Optional[str] = None
    sku: Optional[str] = None

    class Config:
        from_attributes = True

class CartAddSchema(BaseModel):
    part_id: int
    quantity: int = 1
    supplier_offer_id: Optional[int] = None

class CartUpdateSchema(BaseModel):
    quantity: int
