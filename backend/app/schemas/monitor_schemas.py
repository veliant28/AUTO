from pydantic import BaseModel
from typing import Optional, List, Dict


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
    email: Optional[str]
    phone: Optional[str]
    role: Optional[str]
    avatar_index: Optional[int]
    status: str
    first_seen: Optional[str]
    last_seen: Optional[str]
    ip: Optional[str]
    delivery: Optional[MonitorDelivery]


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
