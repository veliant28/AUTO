from pydantic import BaseModel
from typing import Optional, List, Dict

from app.schemas.loyalty_schemas import PromocodeResponse


class MonitorClientItem(BaseModel):
    """Строка таблицы монитора (онлайн или архив)."""
    client_id: str          # "u5" / "sabc"
    is_anonymous: bool
    name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    role: Optional[str]
    status: str             # "online" / "offline"
    first_seen: Optional[str]
    last_seen: Optional[str]
    ip: Optional[str]
    avatar_index: Optional[int]


class MonitorClientsResponse(BaseModel):
    items: List[MonitorClientItem]
    total: int
    page: int
    page_size: int


class MonitorKpiGroup(BaseModel):
    count: int
    clients: List[Dict]     # [{name, avatar_index, client_id}]


class MonitorKpiResponse(BaseModel):
    groups: Dict[str, MonitorKpiGroup]


class MonitorChartGroup(BaseModel):
    count: int
    clients: List[Optional[str]]  # имена; None — аноним


class MonitorChartHour(BaseModel):
    hour: int
    groups: Dict[str, MonitorChartGroup]


class MonitorChartResponse(BaseModel):
    date: str
    hours: List[MonitorChartHour]


class MonitorDelivery(BaseModel):
    delivery_type: Optional[str]
    delivery_city_label: Optional[str]
    delivery_warehouse_label: Optional[str]
    delivery_street_label: Optional[str]
    delivery_house: Optional[str]
    delivery_apartment: Optional[str]


class MonitorProfile(BaseModel):
    client_id: str
    is_anonymous: bool
    name: Optional[str]
    last_name: Optional[str]
    first_name: Optional[str]
    middle_name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    role: Optional[str]
    avatar_index: Optional[int]
    status: str
    first_seen: Optional[str]
    last_seen: Optional[str]
    ip: Optional[str]
    delivery: Optional[MonitorDelivery]
    success_index: Optional[int]
    total_orders: Optional[int]


class MonitorViewItem(BaseModel):
    part_id: int
    article: Optional[str]
    brand: Optional[str]
    part_name: Optional[str]
    sku: Optional[str]
    image_url: Optional[str]
    price: Optional[float]
    currency: Optional[str]
    supplier_name: Optional[str]
    viewed_at: str


class MonitorClientDetailResponse(BaseModel):
    client: MonitorProfile
    views: List[MonitorViewItem]


class MonitorCartItem(BaseModel):
    part_id: int
    article: Optional[str]
    brand: Optional[str]
    part_name: Optional[str]
    sku: Optional[str]
    image_url: Optional[str]
    quantity: int
    price: Optional[float]
    currency: Optional[str]
    supplier_name: Optional[str]


class MonitorCartResponse(BaseModel):
    items: List[MonitorCartItem]
    total: int


class MonitorIndexSlice(BaseModel):
    key: str
    value: float
    count: int


class MonitorIndexResponse(BaseModel):
    success_index: Optional[int]
    total_orders: Optional[int]
    slices: List[MonitorIndexSlice]


class MonitorOrderTtn(BaseModel):
    np_number: Optional[str]
    exists: bool = False
    is_deleted: bool = False


class MonitorOrderItem(BaseModel):
    order_number: str
    status: str
    total: float
    items_count: int
    created_at: str
    ttn: Optional[MonitorOrderTtn]


class MonitorOrderListResponse(BaseModel):
    items: List[MonitorOrderItem]
    total: int
    page: int
    page_size: int


class MonitorReturnItem(BaseModel):
    return_number: str
    order_number: Optional[str]
    status: str
    total_refund: float
    items_count: int
    created_at: str
    ttn_number: Optional[str]


class MonitorReturnListResponse(BaseModel):
    items: List[MonitorReturnItem]
    total: int
    page: int
    page_size: int


class MonitorIpItem(BaseModel):
    ip: str
    visits: int
    first_seen: str
    last_seen: str
    is_top: bool = False


class MonitorIpListResponse(BaseModel):
    items: List[MonitorIpItem]
    total: int
    page: int
    page_size: int


class MonitorVisitDay(BaseModel):
    date: str
    count: int


class MonitorVisitsResponse(BaseModel):
    days: List[MonitorVisitDay]


class MonitorLoyaltyResponse(BaseModel):
    """Промокоды, выданные клиенту (для модалки клиента)."""
    items: List[PromocodeResponse]
    total: int
    page: int
    page_size: int


class MonitorLoyaltyStatsMonth(BaseModel):
    month: str  # 'YYYY-MM'
    count: int


class MonitorLoyaltyStatsResponse(BaseModel):
    """Выдача промокодов по месяцам за 12 месяцев (всегда 12 записей)."""
    months: List[MonitorLoyaltyStatsMonth]
    total: int
