from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ─── Store-facing schemas ──────────────────────────────────────────────────────

class ReturnItemSchema(BaseModel):
    id: int
    part_id: int
    article: str
    part_name: str
    brand: Optional[str] = None
    quantity: int
    max_quantity: int = 0
    price: float
    total: float

    class Config:
        from_attributes = True


class ReturnRequestSchema(BaseModel):
    id: int
    return_number: str
    order_id: int
    order_number: str = ""
    status: str
    total_refund: float
    created_at: Optional[datetime] = None
    return_phone: Optional[str] = None
    return_last_name: Optional[str] = None
    return_first_name: Optional[str] = None
    return_middle_name: Optional[str] = None
    return_delivery_city: Optional[str] = None
    return_delivery_warehouse: Optional[str] = None
    ttn_number: Optional[str] = None
    items: List[ReturnItemSchema] = []

    class Config:
        from_attributes = True


class ReturnListResponse(BaseModel):
    items: List[ReturnRequestSchema]
    total: int
    page: int
    page_size: int


class ReturnCreateItem(BaseModel):
    part_id: int
    quantity: int


class ReturnCreate(BaseModel):
    items: List[ReturnCreateItem]


# ─── Admin-facing schemas ─────────────────────────────────────────────────────

class AdminReturnItemSchema(BaseModel):
    id: int
    part_id: int
    article: str
    part_name: str
    brand: Optional[str] = None
    sku: Optional[str] = None
    quantity: int
    max_quantity: int = 0
    price: float
    total: float

    class Config:
        from_attributes = True


class AdminReturnListItem(BaseModel):
    id: int
    return_number: str
    order_id: int
    order_number: str = ""
    user_id: int
    user_name: str = ""
    user_last_name: Optional[str] = None
    user_first_name: Optional[str] = None
    phone: Optional[str] = None
    status: str
    total_refund: float
    ttn_number: Optional[str] = None
    items_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminReturnListResponse(BaseModel):
    items: List[AdminReturnListItem]
    total: int
    page: int
    page_size: int


class AdminReturnDetailResponse(BaseModel):
    id: int
    return_number: str
    order_id: int
    order_number: str = ""
    user_id: int
    user_name: str = ""
    user_last_name: Optional[str] = None
    user_first_name: Optional[str] = None
    phone: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    delivery_type: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None
    sender_name: Optional[str] = None
    sender_city_label: Optional[str] = None
    sender_address_label: Optional[str] = None
    return_phone: Optional[str] = None
    return_last_name: Optional[str] = None
    return_first_name: Optional[str] = None
    return_middle_name: Optional[str] = None
    return_delivery_city: Optional[str] = None
    return_delivery_warehouse: Optional[str] = None
    status: str
    total_refund: float
    admin_notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    approved_by_user_id: Optional[int] = None
    approved_by_name: Optional[str] = None
    updated_by_name: Optional[str] = None
    updated_by_group: Optional[str] = None
    items: List[AdminReturnItemSchema] = []
    change_logs: List[ReturnChangeLogSchema] = []
    ttn_number: Optional[str] = None


class ReturnChangeLogSchema(BaseModel):
    id: int
    user_name: Optional[str] = None
    user_group: Optional[str] = None
    action: str
    details: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True


class AdminReturnItemUpdateSchema(BaseModel):
    id: int
    quantity: int


class AdminReturnUpdateSchema(BaseModel):
    admin_notes: Optional[str] = None
    items: Optional[List[AdminReturnItemUpdateSchema]] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone: Optional[str] = None
    delivery_type: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None


class AdminUpdateReturnStatusSchema(BaseModel):
    status: str
