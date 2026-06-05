from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class OrderItemSchema(BaseModel):
    id: int
    part_id: int
    article: str
    part_name: str
    quantity: int
    price: float

    class Config:
        from_attributes = True

class OrderSchema(BaseModel):
    id: int
    status: str
    total: float
    full_name: str
    phone: Optional[str]
    address: Optional[str]
    created_at: datetime
    items: List[OrderItemSchema]

    class Config:
        from_attributes = True

class CheckoutSchema(BaseModel):
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    items: List[dict]  # [{part_id, quantity, price}]
