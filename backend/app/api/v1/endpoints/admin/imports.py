import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models import User
from app.models.imports import SupplierConfig, PriceImport
from app.schemas.import_schemas import (
    ExportParamsResponse, ExportRequestCreate, PriceImportItem, PriceImportListResponse,
)
from app.services.supplier_api import GPLAPIClient, UTRAPIClient
from app.services.crypto_util import decrypt_password
from app.services.import_processor import promote_all_to_catalog

router = APIRouter()


@router.get("/imports", response_model=PriceImportListResponse)
async def list_imports(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=1000),
    supplier: str = Query("", max_length=50),
    status: str = Query("", max_length=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Список импортов с фильтрацией по поставщику и статусу."""
    query = db.query(PriceImport)
    if supplier:
        query = query.filter(PriceImport.supplier == supplier)
    if status:
        if status == "promoted":
            query = query.filter(PriceImport.matched_items > 0)
        else:
            query = query.filter(PriceImport.status == status)

    total = query.count()
    items = (
        query.order_by(PriceImport.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PriceImportListResponse(
        items=[PriceImportItem.model_validate(pi) for pi in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/imports/export-params/{supplier}", response_model=ExportParamsResponse)
async def get_export_params(
    supplier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Получить параметры экспорта для поставщика (форматы, бренды, категории)."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config or not config.token:
        raise HTTPException(status_code=400, detail=f"No valid config/token for supplier: {supplier}")

    if supplier.upper() == "GPL":
        client = GPLAPIClient(config)
    elif supplier.upper() == "UTR":
        client = UTRAPIClient(config)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown supplier: {supplier}")

    result = client.get_export_params(config.token)
    return ExportParamsResponse(
        supplier=supplier,
        supported_formats=result.formats,
        brands=[{"id": b["id"], "name": b["name"]} for b in result.brands],
        categories=[{"id": c["id"], "name": c["name"]} for c in result.categories],
        models=result.models,
    )


@router.post("/imports/export-request", response_model=PriceImportItem)
async def request_export(
    body: ExportRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Запросить выгрузку прайс-листа от поставщика."""
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == body.supplier).first()
    if not config or not config.token:
        raise HTTPException(status_code=400, detail="Supplier not configured or no valid token")

    pimport = PriceImport(
        supplier=body.supplier,
        format=body.format,
        status="in_queue",
        filters={
            "visible_brands_ids": body.visible_brands_ids or [],
            "categories_ids": body.categories_ids or [],
            "models_ids": body.models_ids or [],
            "in_stock_only": body.in_stock_only,
        },
    )
    db.add(pimport)
    db.commit()
    db.refresh(pimport)

    from app.workers.tasks.import_tasks import process_price_import
    process_price_import.delay(pimport.id)

    return PriceImportItem.model_validate(pimport)


@router.get("/imports/{import_id}/download")
async def download_import(
    import_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Скачать файл импорта."""
    pimport = db.query(PriceImport).filter(PriceImport.id == import_id).first()
    if not pimport:
        raise HTTPException(status_code=404, detail="Import not found")
    if not pimport.file_path or not os.path.exists(pimport.file_path):
        raise HTTPException(status_code=404, detail="File not available")
    return FileResponse(
        pimport.file_path,
        filename=os.path.basename(pimport.file_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/imports/{import_id}/promote")
async def promote_import(
    import_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Запустить продвижение импорта в каталог."""
    pimport = db.query(PriceImport).filter(PriceImport.id == import_id).first()
    if not pimport:
        raise HTTPException(status_code=404, detail="Import not found")

    pimport.status = "processing"
    pimport.progress = 5
    db.commit()

    from app.workers.tasks.import_tasks import promote_import_task
    promote_import_task.delay(import_id)

    return {"ok": True, "task_started": True}


@router.delete("/imports/{import_id}")
async def delete_import(
    import_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Удалить импорт вместе с файлом."""
    pimport = db.query(PriceImport).filter(PriceImport.id == import_id).first()
    if not pimport:
        raise HTTPException(status_code=404, detail="Import not found")
    if pimport.file_path and os.path.exists(pimport.file_path):
        os.remove(pimport.file_path)
    db.delete(pimport)
    db.commit()
    return {"ok": True}
