from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class TecDocSettingsSchema(BaseModel):
    api_url: str
    auth_user: str
    auth_pass: str
    has_password: bool = False
    db_host: str = ""
    db_name: str = ""
    db_user: str = ""
    db_has_pass: bool = False
    db_pass_length: int = 0


class TecDocSettingsUpdateSchema(BaseModel):
    api_url: Optional[str] = None
    auth_user: Optional[str] = None
    auth_pass: Optional[str] = None
    db_host: Optional[str] = None
    db_name: Optional[str] = None
    db_user: Optional[str] = None
    db_pass: Optional[str] = None


class TecDocTestResult(BaseModel):
    success: bool
    message: str
    latency_ms: Optional[int] = None


class TecDocDashboardSchema(BaseModel):
    used: int
    remaining: int
    limit: int = 3332
    exhausted: bool
    hourly: List["HourlyUsageItem"] = []


class HourlyUsageItem(BaseModel):
    hour: str
    count: int


class SupplierPriceItem(BaseModel):
    id: int
    sku: Optional[str] = None
    supplier: str
    article: str
    brand: Optional[str] = None
    name: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    stock_total: int = 0
    stock_regions: Optional[dict] = None
    tecdoc_article: Optional[str] = None
    tecdoc_brand_id: Optional[int] = None
    match_status: str
    attempts: int
    last_attempt_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SupplierPriceListResponse(BaseModel):
    items: List[SupplierPriceItem]
    total: int
    page: int
    page_size: int


class AdminOfferItem(BaseModel):
    supplier_name: str
    price: float
    currency: str
    quantity: int
    stock_regions: Optional[dict] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminProductItem(BaseModel):
    id: int
    article: str
    brand: Optional[str] = None
    name: str
    sku: Optional[str] = None
    offers: List[AdminOfferItem] = []
    min_price: Optional[float] = None
    total_stock: int = 0
    best_supplier: Optional[str] = None
    best_updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminProductListResponse(BaseModel):
    items: List[AdminProductItem]
    total: int
    page: int
    page_size: int


class BatchStartRequest(BaseModel):
    size: int = 25


class BatchStartSelectedRequest(BaseModel):
    ids: List[int]


class BatchStatusResponse(BaseModel):
    running: bool
    task_id: Optional[str] = None
    processed: int = 0
    total: int = 0
    size: int = 25
