from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional, Dict, Any
from app.core.db import get_db
from app.models import VehicleBrand, VehicleModel, VehicleModification, PartCategory, Part, PartApplicability, SupplierOffer, Supplier
from app.schemas.vehicle_schemas import BrandSchema, ModelSchema, ModSchema
from app.schemas.part_schemas import PartCategorySchema, PartSchema, PartDetailSchema
from app.services.sync_service import sync_service
from app.services.tecdoc_client import tecdoc_client

router = APIRouter()


def _best_offer(offers: List[SupplierOffer]) -> Optional[Dict[str, Any]]:
    """Pick the best offer: in-stock, freshest first."""
    in_stock = [o for o in offers if o.quantity > 0]
    candidates = in_stock or offers
    if not candidates:
        return None
    best = max(candidates, key=lambda o: (o.updated_at or o.id, o.id))
    return {
        "price": float(best.price),
        "quantity": best.quantity or 0,
        "supplier_name": best.supplier.name if best.supplier else None,
        "currency": best.currency or "UAH",
    }


@router.get("/makes", response_model=List[BrandSchema])
async def get_makes(db: Session = Depends(get_db)):
    return db.query(VehicleBrand).all()


@router.get("/models/{brand_id}", response_model=List[ModelSchema])
async def get_models(brand_id: int, db: Session = Depends(get_db)):
    return db.query(VehicleModel).filter(VehicleModel.brand_id == brand_id).all()


@router.get("/modifications/{model_id}", response_model=List[ModSchema])
async def get_modifications(model_id: int, db: Session = Depends(get_db)):
    return db.query(VehicleModification).filter(VehicleModification.model_id == model_id).all()


@router.get("/sections/{mod_id}", response_model=List[PartCategorySchema])
async def get_sections(mod_id: int, db: Session = Depends(get_db)):
    sections = db.query(PartCategory).all()
    if not sections:
        await sync_service.sync_sections(db, mod_id=mod_id)
        sections = db.query(PartCategory).all()
    return sections


@router.get("/parts/{mod_id}/{sec_id}", response_model=List[PartSchema])
async def get_parts(
    mod_id: int,
    sec_id: int,
    db: Session = Depends(get_db),
    in_stock_only: bool = Query(False),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    supplier_id: Optional[int] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("asc"),
):
    local_mod = db.query(VehicleModification).filter(VehicleModification.tecdoc_id == mod_id).first()
    if not local_mod:
        raise HTTPException(status_code=404, detail="Modification not found")

    query = db.query(Part).join(PartApplicability).filter(
        PartApplicability.mod_id == local_mod.id
    )

    if in_stock_only:
        query = query.join(SupplierOffer).filter(SupplierOffer.quantity > 0)
    if min_price is not None:
        query = query.join(SupplierOffer).filter(SupplierOffer.price >= min_price)
    if max_price is not None:
        query = query.join(SupplierOffer).filter(SupplierOffer.price <= max_price)
    if supplier_id is not None:
        query = query.join(SupplierOffer).filter(SupplierOffer.supplier_id == supplier_id)

    if sort_by == "price":
        query = query.join(SupplierOffer)
        order_col = SupplierOffer.price
        query = query.order_by(order_col.asc() if sort_order == "asc" else order_col.desc())
    elif sort_by == "name":
        order_col = Part.name
        query = query.order_by(order_col.asc() if sort_order == "asc" else order_col.desc())

    query = query.distinct()

    parts = query.all()

    if not parts:
        await sync_service.sync_parts_for_section(db, mod_id=mod_id, sec_id=sec_id)
        parts = query.all()

    result = []
    for part in parts:
        offers = db.query(SupplierOffer).options(
            joinedload(SupplierOffer.supplier)
        ).filter(SupplierOffer.part_id == part.id).all()
        best = _best_offer(offers)

        result.append({
            "id": part.id,
            "article": part.article,
            "name": part.name,
            "brand_id": part.brand_id,
            "tecdoc_id": part.tecdoc_id,
            "category_id": part.category_id,
            "brand": part.brand,
            "price": best["price"] if best else None,
            "quantity": best["quantity"] if best else None,
            "supplier_name": best["supplier_name"] if best else None,
            "currency": best["currency"] if best else "UAH",
        })

    return result


@router.get("/search", response_model=List[PartSchema])
async def search_parts(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
):
    results = db.query(Part).filter(
        or_(
            Part.article.ilike(f"%{q}%"),
            Part.name.ilike(f"%{q}%"),
        )
    ).limit(limit).all()

    enriched = []
    for part in results:
        offers = db.query(SupplierOffer).options(
            joinedload(SupplierOffer.supplier)
        ).filter(SupplierOffer.part_id == part.id).all()
        best = _best_offer(offers)

        enriched.append({
            "id": part.id,
            "article": part.article,
            "name": part.name,
            "brand_id": part.brand_id,
            "tecdoc_id": part.tecdoc_id,
            "category_id": part.category_id,
            "brand": part.brand,
            "price": best["price"] if best else None,
            "quantity": best["quantity"] if best else None,
            "supplier_name": best["supplier_name"] if best else None,
            "currency": best["currency"] if best else "UAH",
        })
    return enriched


@router.get("/search/autocomplete")
async def autocomplete(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    limit: int = Query(5, ge=1, le=10),
):
    results = db.query(Part).filter(
        or_(
            Part.article.ilike(f"{q}%"),
            Part.name.ilike(f"%{q}%"),
        )
    ).limit(limit).all()

    return [
        {"id": p.id, "label": f"{p.article} — {p.name} [{p.brand or ''}]", "article": p.article}
        for p in results
    ]


@router.get("/parts/{article}/applicability")
async def get_part_applicability(
    article: str,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
):
    parts = db.query(Part).filter(Part.article == article).all()
    if not parts:
        raise HTTPException(404, "Part not found")

    part_ids = [p.id for p in parts]
    total = db.query(PartApplicability).filter(
        PartApplicability.part_id.in_(part_ids)
    ).count()

    apps = db.query(PartApplicability).filter(
        PartApplicability.part_id.in_(part_ids)
    ).offset((page - 1) * limit).limit(limit).all()

    vehicles = []
    for app in apps:
        mod = db.query(VehicleModification).filter(VehicleModification.id == app.mod_id).first()
        if mod:
            model = db.query(VehicleModel).filter(VehicleModel.id == mod.model_id).first()
            brand = db.query(VehicleBrand).filter(VehicleBrand.id == model.brand_id).first() if model else None
            vehicles.append({
                "mod_id": mod.id,
                "mod_name": mod.name,
                "model_name": model.name if model else "",
                "brand_name": brand.name if brand else "",
            })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "vehicles": vehicles,
    }


@router.get("/parts/{article}/details", response_model=PartDetailSchema)
async def get_part_details(article: str, db: Session = Depends(get_db)):
    parts = db.query(Part).filter(Part.article == article).all()
    if not parts:
        raise HTTPException(status_code=404, detail="Part not found in local database")

    # Use the first part's brand_id for TecDoc lookup
    part = parts[0]
    info_data = await tecdoc_client.request("getArtInfo", {"number": article, "brand": part.brand_id})
    cross_data = await tecdoc_client.request("getCross", {"number": article, "brand": part.brand_id})
    image_data = await tecdoc_client.request("getImages", {"number": article, "brand": part.brand_id})

    return {
        "info": info_data,
        "crosses": cross_data,
        "images": image_data,
    }


@router.post("/sync/vehicles")
async def trigger_vehicle_sync(db: Session = Depends(get_db)):
    result = await sync_service.full_vehicle_sync(db)
    return {"message": "Sync completed", "details": result}
