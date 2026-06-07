from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models import User, TecDocConfig, SupplierPrice
from app.schemas.tecdoc_schemas import (
    TecDocSettingsSchema, TecDocSettingsUpdateSchema, TecDocTestResult,
    TecDocDashboardSchema, HourlyUsageItem,
    SupplierPriceItem, SupplierPriceListResponse,
    BatchStartRequest, BatchStartSelectedRequest, BatchStatusResponse,
)
from app.services.rate_limiter import rate_limiter, TECDOC_HOURLY_LIMIT
from app.services.tecdoc_gateway import get_gateway
from app.services.tecdoc_batch import batch_manager

router = APIRouter()


# ─── Settings ──────────────────────────────────────────────────────────────

@router.get("/settings", response_model=TecDocSettingsSchema)
async def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    config = db.query(TecDocConfig).first()
    if not config:
        config = TecDocConfig()
        db.add(config)
        db.commit()
    return TecDocSettingsSchema(
        api_url=config.api_url,
        auth_user=config.auth_user,
        auth_pass=config.auth_pass,
        has_password=bool(config.auth_pass),
        db_host=config.db_host,
        db_name=config.db_name,
        db_user=config.db_user,
        db_has_pass=bool(config.db_pass),
        db_pass_length=len(config.db_pass or ""),
    )


@router.put("/settings")
async def update_settings(
    data: TecDocSettingsUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    config = db.query(TecDocConfig).first()
    if not config:
        config = TecDocConfig()
        db.add(config)
    if data.api_url is not None:
        config.api_url = data.api_url
    if data.auth_user is not None:
        config.auth_user = data.auth_user
    if data.auth_pass is not None:
        config.auth_pass = data.auth_pass
    if data.db_host is not None:
        config.db_host = data.db_host
    if data.db_name is not None:
        config.db_name = data.db_name
    if data.db_user is not None:
        config.db_user = data.db_user
    if data.db_pass is not None:
        config.db_pass = data.db_pass
    config.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/settings/test", response_model=TecDocTestResult)
async def test_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    gateway = get_gateway(db)
    result = await gateway.test_connection()
    return result


# ─── Dashboard ─────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=TecDocDashboardSchema)
async def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    used = rate_limiter.current_hour_usage(db)
    remaining = max(0, TECDOC_HOURLY_LIMIT - used)
    hourly = rate_limiter.hourly_stats(db, hours=24)
    return TecDocDashboardSchema(
        used=used,
        remaining=remaining,
        limit=TECDOC_HOURLY_LIMIT,
        exhausted=remaining <= 0,
        hourly=[HourlyUsageItem(**h) for h in hourly],
    )


# ─── Articles ──────────────────────────────────────────────────────────────

@router.get("/articles", response_model=SupplierPriceListResponse)
async def list_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status: str = Query("", max_length=50),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    query = db.query(SupplierPrice)
    if status:
        query = query.filter(SupplierPrice.match_status == status)
    if search:
        like = f"%{search}%"
        query = query.filter(
            SupplierPrice.article.ilike(like) | SupplierPrice.name.ilike(like)
        )
    total = query.count()
    items = query.order_by(SupplierPrice.id).offset((page - 1) * page_size).limit(page_size).all()
    return SupplierPriceListResponse(
        items=[SupplierPriceItem.model_validate(sp) for sp in items],
        total=total,
        page=page,
        page_size=page_size,
    )


# ─── Batch ─────────────────────────────────────────────────────────────────

@router.get("/batch/status", response_model=BatchStatusResponse)
async def batch_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    return batch_manager.status()


@router.post("/batch/size")
async def set_batch_size(
    data: BatchStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    return {"size": data.size}


@router.post("/batch/start")
async def start_batch(
    data: BatchStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    gateway = get_gateway(db)
    if gateway.remaining() <= 0:
        raise HTTPException(429, "TecDoc hourly limit reached")
    return batch_manager.start(batch_size=data.size or 25)


@router.post("/batch/start-selected")
async def start_selected_batch(
    data: BatchStartSelectedRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    gateway = get_gateway(db)
    if gateway.remaining() <= 0:
        raise HTTPException(429, "TecDoc hourly limit reached")
    return batch_manager.start(article_ids=data.ids)


@router.post("/batch/stop")
async def stop_batch(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    return batch_manager.stop()
