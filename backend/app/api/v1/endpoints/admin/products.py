from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models import User, Part, SupplierOffer, Supplier
from app.models.pricing import PriceRule
from app.schemas.tecdoc_schemas import AdminProductItem, AdminProductListResponse

router = APIRouter()


def _load_margins(db: Session) -> dict[int | None, float | None]:
    rules = db.query(PriceRule).filter(PriceRule.is_active == True).all()
    margins: dict[int | None, float | None] = {}
    general = None
    for r in rules:
        if r.type == "general":
            general = float(r.margin_percent) if r.margin_percent else None
        elif r.type == "category" and r.category_id and r.margin_percent and r.margin_percent > 0:
            margins[r.category_id] = float(r.margin_percent)
    for cat_id in list(margins.keys()):
        if margins[cat_id] is None:
            margins[cat_id] = general
    margins[None] = general
    return margins


@router.get("/products", response_model=AdminProductListResponse)
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=1000),
    supplier: str = Query("", max_length=50),
    status: str = Query("", max_length=50),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Список товаров с фильтрацией и расчётом маржи."""
    query = db.query(Part)

    # Apply filters
    if status == "active":
        query = query.filter(Part.offers.any(SupplierOffer.quantity > 0))
    elif status == "inactive":
        query = query.filter(~Part.offers.any(SupplierOffer.quantity > 0))
    if supplier:
        subq = db.query(SupplierOffer.part_id).join(Supplier).filter(Supplier.name == supplier)
        query = query.filter(Part.id.in_(subq))
    if search:
        like = f"%{search}%"
        query = query.filter(
            Part.article.ilike(like) | Part.name.ilike(like)
        )

    total = query.count()

    items = (
        query
        .options(selectinload(Part.offers).selectinload(SupplierOffer.supplier))
        .order_by(Part.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    margins = _load_margins(db)
    result = []
    for part in items:
        offers_data = []
        total_stock = 0
        best_offer = None
        margin = margins.get(part.category_id) or margins.get(None)
        for offer in part.offers:
            qty = offer.quantity or 0
            total_stock += qty
            effective_price = float(offer.final_price) if offer.final_price is not None else float(offer.price)
            offers_data.append({
                "supplier_name": offer.supplier.name,
                "price": float(offer.price),
                "final_price": effective_price,
                "currency": offer.currency or "UAH",
                "quantity": qty,
                "stock_regions": offer.stock_regions,
                "updated_at": offer.updated_at,
            })
            if qty > 0 and (best_offer is None or
                            (offer.updated_at and best_offer.get("updated_at") and offer.updated_at > best_offer["updated_at"]) or
                            (best_offer.get("updated_at") is None and offer.updated_at is not None)):
                best_offer = {
                    "supplier_name": offer.supplier.name,
                    "price": float(offer.price),
                    "final_price": effective_price,
                    "currency": offer.currency or "UAH",
                    "quantity": qty,
                    "stock_regions": offer.stock_regions,
                    "updated_at": offer.updated_at,
                }

        final_min = min((o["final_price"] for o in offers_data if o.get("final_price") is not None), default=None)
        raw_min_price = min((o["price"] for o in offers_data if o["price"] is not None), default=None)

        result.append({
            "id": part.id,
            "article": part.article,
            "brand": part.brand,
            "name": part.name,
            "sku": part.sku,
            "offers": offers_data,
            "min_price": raw_min_price,
            "final_price": final_min,
            "margin_percent": float(margin) if (margin and final_min is not None and raw_min_price is not None and final_min != raw_min_price) else None,
            "total_stock": total_stock,
            "best_supplier": best_offer["supplier_name"] if best_offer else None,
            "best_updated_at": best_offer["updated_at"] if best_offer else None,
        })

    return AdminProductListResponse(
        items=[AdminProductItem(**r) for r in result],
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
    """Удалить товар вместе с предложениями."""
    part = db.query(Part).filter(Part.id == product_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Product not found")
    # Delete associated offers first
    db.query(SupplierOffer).filter(SupplierOffer.part_id == part.id).delete()
    db.delete(part)
    db.commit()
    return {"ok": True}


@router.post("/products/generate-skus")
async def generate_skus(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Сгенерировать SKU для товаров без артикула."""
    from app.services.sku_generator import bulk_generate_skus
    count = bulk_generate_skus(db)
    return {"generated": count}
