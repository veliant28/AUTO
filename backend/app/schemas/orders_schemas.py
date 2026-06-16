from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class OrderItemSchema(BaseModel):
    id: int
    part_id: int
    article: str
    part_name: str
    brand: Optional[str] = None
    quantity: int
    price: float
    sku: Optional[str] = None

    class Config:
        from_attributes = True

class OrderSchema(BaseModel):
    id: int
    status: str
    total: float
    full_name: str
    phone: Optional[str]
    address: Optional[str]
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    delivery_type: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None
    payment_method: Optional[str] = None
    created_at: datetime
    items: List[OrderItemSchema]

    class Config:
        from_attributes = True

class OrderListResponse(BaseModel):
    items: List[OrderSchema]
    total: int
    page: int
    page_size: int

class CheckoutSchema(BaseModel):
    last_name: str
    first_name: str
    middle_name: Optional[str] = None
    phone: str
    delivery_type: str
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None
    payment_method: str
    items: List[dict]  # [{part_id, quantity, price}]
