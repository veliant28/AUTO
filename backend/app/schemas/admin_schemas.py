from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.schemas.tecdoc_schemas import AdminOfferItem

class OrdersByDateItem(BaseModel):
    date: str
    count: int
    revenue: float
    margin: float = 0

class PartsByCategoryItem(BaseModel):
    category: str
    count: int

class WeekdayDistribution(BaseModel):
    weekday: str  # "Пн", "Вт", etc
    count: int

class PaymentMethodDistribution(BaseModel):
    method: str
    count: int

class DashboardResponse(BaseModel):
    total_users: int
    total_orders: int
    total_revenue: float
    total_margin: float = 0
    total_parts: int
    orders_by_date: List[OrdersByDateItem]
    orders_by_status: dict
    parts_by_category: List[PartsByCategoryItem]
    orders_today: int = 0
    new_users_today: int = 0
    average_check: float = 0
    oldest_pending_seconds: int = 0
    pending_orders_count: int = 0
    orders_by_weekday: List[WeekdayDistribution] = []
    payment_methods: List[PaymentMethodDistribution] = []

class AdminOrderItem(BaseModel):
    id: int
    order_number: str = ""
    user_id: int
    status: str
    total: float
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime
    items_count: int

    class Config:
        from_attributes = True

class AdminAdminOrderListResponse(BaseModel):
    items: List[AdminOrderItem]
    total: int
    page: int
    page_size: int

class AdminUserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    role: str
    is_active: bool
    phone: Optional[str] = None
    created_at: Optional[str] = None
    orders_delivered: int = 0
    orders_cancelled: int = 0
    returns_completed: int = 0
    success_index: int = 0

    class Config:
        from_attributes = True

class AdminUserListResponse(BaseModel):
    items: List[AdminUserResponse]
    total: int
    page: int
    page_size: int

class UpdateOrderStatusSchema(BaseModel):
    status: str

class AdminOrderItemSchema(BaseModel):
    id: int
    part_id: int
    article: str
    part_name: str
    brand: Optional[str] = None
    quantity: int
    price: float
    sku: Optional[str] = None
    image_url: Optional[str] = None
    offers: List[AdminOfferItem] = []
    supplier_name: Optional[str] = None

    class Config:
        from_attributes = True

class AdminOrderDetailResponse(BaseModel):
    id: int
    order_number: str = ""
    user_id: int
    status: str
    total: float
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    delivery_type: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None
    delivery_city_ref: Optional[str] = None
    delivery_settlement_ref: Optional[str] = None
    delivery_city_label: Optional[str] = None
    delivery_warehouse_ref: Optional[str] = None
    delivery_warehouse_label: Optional[str] = None
    delivery_street_ref: Optional[str] = None
    delivery_street_label: Optional[str] = None
    delivery_house: Optional[str] = None
    delivery_apartment: Optional[str] = None
    promocode_code: Optional[str] = None
    discount_amount: Optional[float] = None
    original_total: Optional[float] = None
    total: Optional[float] = None
    promocode_code: Optional[str] = None
    discount_amount: float = 0
    original_total: Optional[float] = None
    payment_method: Optional[str] = None
    created_at: datetime
    updated_by_name: Optional[str] = None
    updated_by_group: Optional[str] = None
    updated_at: Optional[datetime] = None
    items: List[AdminOrderItemSchema]
    user_success_index: int = 0
    user_total_orders: int = 0

    class Config:
        from_attributes = True

class AdminOrderAddItemSchema(BaseModel):
    part_id: int
    quantity: int = 1


class AdminOrderUpdateItem(BaseModel):
    id: int
    quantity: int

class AdminOrderUpdateSchema(BaseModel):
    items: Optional[List[AdminOrderUpdateItem]] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    phone: Optional[str] = None
    delivery_type: Optional[str] = None
    delivery_city: Optional[str] = None
    delivery_warehouse: Optional[str] = None
    delivery_city_ref: Optional[str] = None
    delivery_settlement_ref: Optional[str] = None
    delivery_city_label: Optional[str] = None
    delivery_warehouse_ref: Optional[str] = None
    delivery_warehouse_label: Optional[str] = None
    delivery_street_ref: Optional[str] = None
    delivery_street_label: Optional[str] = None
    delivery_house: Optional[str] = None
    delivery_apartment: Optional[str] = None
    promocode_code: Optional[str] = None
    discount_amount: Optional[float] = None
    original_total: Optional[float] = None
    total: Optional[float] = None

class OrderChangeLogResponse(BaseModel):
    id: int
    user_name: Optional[str] = None
    user_group: Optional[str] = None
    action: str
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UnifiedEventResponse(BaseModel):
    """Unified event for order history timeline — covers both order changes and waybill events."""
    id: int
    type: str  # "order" or "waybill"
    event_type: str
    user_name: Optional[str] = None
    user_group: Optional[str] = None
    details: Optional[str] = None
    np_number: Optional[str] = None  # TTN number for waybill events
    created_at: datetime

# Role schemas
class PermissionResponse(BaseModel):
    id: int
    codename: str
    description: Optional[str] = None
    group_name: Optional[str] = None

class RoleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_system: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    permissions: List[PermissionResponse] = []

class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permission_ids: List[int] = []

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[List[int]] = None


class BrandListItem(BaseModel):
    id: int
    name: str
    total: int
    matched: int
    unmatched: int
    with_applicability: int = 0

    class Config:
        from_attributes = True


class BrandListResponse(BaseModel):
    items: List[BrandListItem]
    total: int
    page: int
    page_size: int
