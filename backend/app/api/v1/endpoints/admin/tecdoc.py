from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text as sa_text
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
    """Получить настройки подключения к TecDoc."""
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
    """Обновить настройки подключения к TecDoc."""
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
    """Проверить подключение к TecDoc."""
    gateway = get_gateway(db)
    result = await gateway.test_connection()
    return result


# ─── Dashboard ─────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=TecDocDashboardSchema)
async def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Получить статистику использования лимитов TecDoc."""
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
    brand: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Список товаров из каталога (Part) с фильтрацией."""
    from app.models.parts import Part
    from app.models.suppliers import SupplierOffer
    from app.models.tecdoc import SupplierPrice
    from sqlalchemy import func

    # Base: Parts that have GPL offers
    query = db.query(Part).join(SupplierOffer, SupplierOffer.part_id == Part.id)
    query = query.join(SupplierPrice, func.lower(SupplierPrice.article) == func.lower(Part.article))
    query = query.filter(SupplierPrice.supplier == "GPL")

    # Left join for match_status from the corresponding SupplierPrice
    query = query.add_columns(
        SupplierPrice.match_status,
        SupplierPrice.brand.label("sp_brand"),
        SupplierPrice.attempts,
        SupplierPrice.last_attempt_at,
    )

    if status:
        query = query.filter(SupplierPrice.match_status == status)
    if search:
        like = f"%{search}%"
        query = query.filter(Part.article.ilike(like) | Part.name.ilike(like))
    if brand:
        query = query.filter(Part.brand.ilike(f"%{brand}%"))

    total = query.count()
    rows = query.order_by(Part.id).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for row in rows:
        part = row[0] if hasattr(row, '__iter__') and not isinstance(row, Part) else row
        if hasattr(row, '__iter__') and not isinstance(row, Part):
            match_status = row[1] if len(row) > 1 else "pending"
            sp_brand = row[2] if len(row) > 2 else part.brand
            attempts = row[3] if len(row) > 3 else 0
            last_attempt = row[4] if len(row) > 4 else None
        else:
            match_status = "pending"
            sp_brand = part.brand
            attempts = 0
            last_attempt = None
        # Get offer price/stock for display
        offer = part.offers[0] if part.offers else None
        items.append(SupplierPriceItem(
            id=part.id,
            supplier="GPL",
            article=part.article,
            name=part.name,
            brand=part.brand or sp_brand,
            price=offer.price if offer else 0,
            currency=offer.currency if offer else "UAH",
            stock_total=offer.quantity if offer else 0,
            stock_regions=offer.stock_regions if offer else None,
            sku=part.sku,
            match_status=match_status,
            attempts=attempts or 0,
            last_attempt_at=last_attempt,
            tecdoc_brand_id=part.brand_id,
            tecdoc_article=None,
        ))
    return SupplierPriceListResponse(
        items=items,
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
    """Получить статус текущего пакетного сопоставления."""
    return batch_manager.status()


@router.post("/batch/size")
async def set_batch_size(
    data: BatchStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Установить размер пакета для сопоставления."""
    return {"size": data.size}


@router.post("/batch/start")
async def start_batch(
    data: BatchStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Запустить пакетное сопоставление всех артикулов."""
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
    """Запустить пакетное сопоставление для выбранных артикулов."""
    gateway = get_gateway(db)
    if gateway.remaining() <= 0:
        raise HTTPException(429, "TecDoc hourly limit reached")
    return batch_manager.start(article_ids=data.ids)


@router.post("/batch/stop")
async def stop_batch(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Остановить текущее пакетное сопоставление."""
    return batch_manager.stop()


@router.get("/brands")
async def list_brand_names(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Получить список уникальных брендов поставщиков."""
    rows = db.query(SupplierPrice.brand).filter(SupplierPrice.brand.isnot(None), SupplierPrice.brand != "").distinct().order_by(SupplierPrice.brand).all()
    return [{"value": r[0], "label": r[0]} for r in rows]


# ─── Manual Search ─────────────────────────────────────────────────────────

from pydantic import BaseModel
from app.core.db import get_tecdoc_db

class ManualSearchRequest(BaseModel):
    article: str

class ManualBindRequest(BaseModel):
    supplier_price_id: int
    tecdoc_article: str
    tecdoc_brand_id: int
    supplier_name: str


@router.post("/manual/search")
async def manual_search(
    data: ManualSearchRequest,
    tecdoc_db: Session = Depends(get_tecdoc_db),
    current_user: User = Depends(require_role("admin")),
):
    """Ручной поиск артикула в базе TecDoc."""
    t = sa_text("""
        SELECT s.description as name, a."DataSupplierArticleNumber" as article_number, a."supplierId" as supplier_id
        FROM articles a
        JOIN suppliers s ON s.id = a."supplierId"
        WHERE LOWER(a."DataSupplierArticleNumber") LIKE :q
        ORDER BY a."DataSupplierArticleNumber"
        LIMIT 50
    """)
    rows = tecdoc_db.execute(t, {"q": f"%{data.article.lower()}%"}).fetchall()
    return [{"brand": r[0], "article": r[1], "brand_id": r[2], "normalized": r[1]} for r in rows]


@router.post("/manual/details")
async def manual_details(
    data: ManualSearchRequest,
    tecdoc_db: Session = Depends(get_tecdoc_db),
    current_user: User = Depends(require_role("admin")),
):
    """Получить детальную информацию об артикуле (кроссы, OEM, изображения, применимость)."""
    art = data.article.lower()

    info = tecdoc_db.execute(
        sa_text("""SELECT s.description as name, a."InformationText" as info_text FROM article_inf a
                   JOIN suppliers s ON s.id = a."supplierId"
                   WHERE LOWER(a."DataSupplierArticleNumber") = :art LIMIT 1"""),
        {"art": art},
    ).fetchone()

    crosses = tecdoc_db.execute(
        sa_text("""SELECT "PartsDataSupplierArticleNumber", "SupplierId", "OENbr", "manufacturerId" FROM article_cross
                   WHERE LOWER("PartsDataSupplierArticleNumber") = :art OR LOWER("OENbr") = :art LIMIT 20"""),
        {"art": art},
    ).fetchall()

    oems = tecdoc_db.execute(
        sa_text("""SELECT "OENbr", "manufacturerId" FROM article_oe
                   WHERE LOWER("OENbr") = :art LIMIT 20"""),
        {"art": art},
    ).fetchall()

    images = tecdoc_db.execute(
        sa_text("""SELECT "PictureName" FROM article_images
                   WHERE LOWER("DataSupplierArticleNumber") = :art LIMIT 10"""),
        {"art": art},
    ).fetchall()

    vehicles = tecdoc_db.execute(
        sa_text("""SELECT DISTINCT man."description" as brand, m."description" as model, pc."description" as mod_name,
                          pc."constructioninterval" as years
                   FROM article_li li
                   JOIN passanger_cars pc ON pc.id = li."linkageId"
                   JOIN models m ON m.id = pc.modelid
                   JOIN manufacturers man ON man.id = m.manufacturerid
                   WHERE LOWER(li."DataSupplierArticleNumber") = :art
                   ORDER BY man."description", m."description"
                   LIMIT 30"""),
        {"art": art},
    ).fetchall()

    return {
        "info": {"supplier_name": info[0] if info else "", "text": info[1] if info else ""},
        "crosses": [{"article": r[0], "supplier_id": r[1], "oem": r[2], "manufacturer_id": r[3]} for r in crosses],
        "oem": [{"number": r[0], "manufacturer_id": r[1]} for r in oems],
        "images": [{"name": r[0]} for r in images],
        "vehicles": [{"brand": r[0], "model": r[1], "mod": r[2], "years": r[3] or ""} for r in vehicles],
    }


@router.post("/manual/bind")
async def manual_bind(
    data: ManualBindRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Вручную привязать артикул поставщика к артикулу TecDoc."""
    sp = db.query(SupplierPrice).filter(SupplierPrice.id == data.supplier_price_id).first()
    if not sp:
        raise HTTPException(404, "Product not found")

    sp.article = data.tecdoc_article
    sp.tecdoc_brand_id = data.tecdoc_brand_id
    sp.match_status = "matched_app"
    db.commit()

    # Try Celery task for enrichment
    try:
        from app.workers.tasks.tecdoc_tasks import process_tecdoc_batch
        process_tecdoc_batch.delay(article_ids=[sp.id], batch_size=1)
        return {"ok": True, "task_dispatched": True}
    except Exception:
        return {"ok": True, "task_dispatched": False}


@router.post("/manual/search-remote")
async def manual_search_remote(
    data: ManualSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Поиск артикула через удалённое API TecDoc."""
    gateway = get_gateway(db)
    try:
        result = await gateway.search(data.article)
        items = []
        if result and isinstance(result, list):
            for r in result[:50]:
                items.append({
                    "brand": r.get("brand_name") or r.get("brand") or str(r.get("brand_id", "")),
                    "article": r.get("number") or r.get("article") or "",
                    "brand_id": r.get("brand") or r.get("brand_id") or 0,
                })
        return items
    except Exception as e:
        raise HTTPException(503, f"Remote search failed: {str(e)}")
