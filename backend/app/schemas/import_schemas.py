from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime


class SupplierConfigResponse(BaseModel):
    id: int
    supplier: str
    login: str
    api_url: Optional[str] = None
    is_active: bool
    token_status: str = "none"
    token_expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SupplierConfigUpdate(BaseModel):
    login: Optional[str] = None
    password: Optional[str] = None


class SupplierAuthResponse(BaseModel):
    success: bool
    token_expires_at: Optional[datetime] = None
    seconds_remaining: Optional[int] = None
    message: Optional[str] = None


class TokenStatusResponse(BaseModel):
    supplier: str
    token_status: str
    token_expires_at: Optional[datetime] = None
    seconds_remaining: Optional[int] = None


class SupplierBrandItem(BaseModel):
    id: Any
    name: str


class SupplierCategoryItem(BaseModel):
    id: Any
    name: str


class ExportParamsResponse(BaseModel):
    supplier: str
    supported_formats: List[str]
    brands: List[SupplierBrandItem]
    categories: List[SupplierCategoryItem]
    models: List[str]


class ExportRequestCreate(BaseModel):
    supplier: str
    format: str = "xlsx"
    visible_brands_ids: Optional[List[int]] = None
    categories_ids: Optional[List[str]] = None
    models_ids: Optional[List[str]] = None
    in_stock_only: bool = True


class PriceImportItem(BaseModel):
    id: int
    supplier: str
    format: str
    status: str
    progress: int
    total_items: int
    matched_items: int
    file_size: Optional[int] = None
    filters: Optional[dict] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PriceImportListResponse(BaseModel):
    items: List[PriceImportItem]
    total: int
    page: int
    page_size: int


class ImportScheduleItem(BaseModel):
    id: int
    supplier: str
    enabled: bool
    run_at_time: str
    last_run_at: Optional[datetime] = None
    next_run_utc: Optional[datetime] = None
    last_import_id: Optional[int] = None
    last_import_progress: Optional[int] = None
    last_import_status: Optional[str] = None
    schedule_status: str = "waiting"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ImportScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    run_at_time: Optional[str] = None
