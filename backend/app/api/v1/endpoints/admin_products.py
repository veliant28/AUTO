from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models import User, SupplierPrice
from app.schemas.tecdoc_schemas import SupplierPriceItem, SupplierPriceListResponse
from app.schemas.admin_schemas import AdminUserResponse
from typing import Optional

router = APIRouter()


@router.get("/products", response_model=SupplierPriceListResponse)
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    supplier: str = Query("", max_length=50),
    status: str = Query("", max_length=50),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    query = db.query(SupplierPrice)
    if supplier:
        query = query.filter(SupplierPrice.supplier == supplier)
    if status == "active":
        query = query.filter(SupplierPrice.stock_total > 0)
    elif status == "inactive":
        query = query.filter(SupplierPrice.stock_total <= 0)
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


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    product = db.query(SupplierPrice).filter(SupplierPrice.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return {"ok": True}


@router.post("/products/generate-skus")
async def generate_skus(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    from app.services.sku_generator import bulk_generate_skus
    count = bulk_generate_skus(db)
    return {"generated": count}
