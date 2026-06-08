from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text, or_
from typing import Optional
from app.core.db import get_db, get_tecdoc_db
from app.models import VehicleBrand, VehicleModel, VehicleModification, SupplierPrice
from app.schemas.vehicle_schemas import BrandSchema, ModelSchema, ModSchema

router = APIRouter()

CATALOG_PAGE_SIZE = 25


@router.get("/makes", response_model=list[BrandSchema])
async def get_makes(db: Session = Depends(get_db)):
    return db.query(VehicleBrand).order_by(VehicleBrand.name).all()


@router.get("/models/{brand_id}", response_model=list[ModelSchema])
async def get_models(brand_id: int, db: Session = Depends(get_db)):
    return db.query(VehicleModel).filter(VehicleModel.brand_id == brand_id).order_by(VehicleModel.name).all()


@router.get("/modifications/{model_id}", response_model=list[ModSchema])
async def get_modifications(model_id: int, db: Session = Depends(get_db)):
    return db.query(VehicleModification).filter(VehicleModification.model_id == model_id).order_by(VehicleModification.name).all()


@router.get("/sections/{mod_id}")
async def get_sections(
    mod_id: int,
    tecdoc_db: Session = Depends(get_tecdoc_db),
    parent_id: int = Query(0),
):
    t = sa_text("""
        SELECT id, description, parentid FROM passanger_car_trees
        WHERE passangercarid = :mod AND parentid = :parent
        ORDER BY id
    """)
    rows = tecdoc_db.execute(t, {"mod": mod_id, "parent": parent_id}).fetchall()
    return [{"id": r[0], "name": r[1] or f"Section {r[0]}", "parent_id": r[2]} for r in rows]


# Article-specific routes BEFORE general parts route
@router.get("/parts/{article}/applicability")
async def get_part_applicability(
    article: str,
    tecdoc_db: Session = Depends(get_tecdoc_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
):
    t = sa_text("""
        SELECT li."linkageId", pc."description", pc."fulldescription"
        FROM article_li li
        JOIN passanger_cars pc ON pc.id = li."linkageId"
        WHERE LOWER(li."DataSupplierArticleNumber") = :art
        ORDER BY pc."description"
        LIMIT :limit OFFSET :offset
    """)
    offset = (page - 1) * limit
    rows = tecdoc_db.execute(t, {"art": article.lower(), "limit": limit, "offset": offset}).fetchall()
    vehicles = [{"mod_id": r[0], "mod_name": r[1] or r[2] or ""} for r in rows]

    ct = sa_text("""SELECT COUNT(*) FROM article_li WHERE LOWER("DataSupplierArticleNumber") = :art""")
    total = tecdoc_db.execute(ct, {"art": article.lower()}).scalar() or 0
    return {"total": total, "page": page, "limit": limit, "vehicles": vehicles}


@router.get("/parts/{article}/details")
async def get_part_details(
    article: str,
    tecdoc_db: Session = Depends(get_tecdoc_db),
):
    info = tecdoc_db.execute(
        sa_text("""SELECT s.name as supplier_name, a.info_text
                   FROM autodb_article_infos a
                   JOIN autodb_suppliers s ON s.id = a.supplier_id
                   WHERE LOWER(a.article_number) = LOWER(:art) LIMIT 1"""),
        {"art": article},
    ).fetchone()

    crosses = tecdoc_db.execute(
        sa_text("""SELECT "PartsDataSupplierArticleNumber", "SupplierId" FROM article_cross
                   WHERE LOWER("PartsDataSupplierArticleNumber") = LOWER(:art) LIMIT 20"""),
        {"art": article},
    ).fetchall()

    oems = tecdoc_db.execute(
        sa_text("""SELECT "OENbr", "manufacturerId" FROM article_oe
                   WHERE LOWER("OENbr") = LOWER(:art) LIMIT 20"""),
        {"art": article},
    ).fetchall()

    images = tecdoc_db.execute(
        sa_text("""SELECT "PictureName", "DataSupplierArticleNumber" FROM article_images
                   WHERE LOWER("DataSupplierArticleNumber") = LOWER(:art) LIMIT 10"""),
        {"art": article},
    ).fetchall()

    app_count = tecdoc_db.execute(
        sa_text("""SELECT COUNT(*) FROM article_li WHERE LOWER("DataSupplierArticleNumber") = LOWER(:art)"""),
        {"art": article},
    ).scalar() or 0

    return {
        "info": {"name": info[1] if info else "", "supplier_name": info[0] if info else ""},
        "crosses": [{"article": r[0], "brand_id": r[1]} for r in crosses],
        "oem": [{"number": r[0], "manufacturer_id": r[1]} for r in oems],
        "images": [{"name": r[0], "article": r[1]} for r in images],
        "applicability_count": app_count,
    }


@router.get("/parts/{mod_id}/{sec_id}")
async def get_parts(
    mod_id: int,
    sec_id: int,
    tecdoc_db: Session = Depends(get_tecdoc_db),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
):
    t = sa_text("""
        SELECT a."supplierId", a."DataSupplierArticleNumber", a."Description", a."NormalizedDescription"
        FROM articles a
        WHERE EXISTS (
            SELECT 1 FROM article_li li
            WHERE LOWER(li."DataSupplierArticleNumber") = LOWER(a."DataSupplierArticleNumber")
            AND li."linkageId" = :mod
        )
        LIMIT :limit OFFSET :offset
    """)
    offset = (page - 1) * CATALOG_PAGE_SIZE
    articles = tecdoc_db.execute(t, {"mod": mod_id, "limit": CATALOG_PAGE_SIZE, "offset": offset}).fetchall()

    items = []
    for r in articles:
        brand_id = r[0]
        art = r[1]
        sp = db.query(SupplierPrice).filter(
            SupplierPrice.tecdoc_brand_id == brand_id,
            SupplierPrice.tecdoc_article == art,
        ).first()

        items.append({
            "article": art, "brand_id": brand_id, "name": r[2] or r[3] or "",
            "price": float(sp.price) if sp and sp.price else None,
            "currency": str(sp.currency) if sp and sp.currency else "UAH",
            "stock_total": sp.stock_total if sp else 0,
            "supplier": sp.supplier if sp else "",
            "match_status": sp.match_status if sp else "",
            "stock_regions": sp.stock_regions if sp else None,
        })

    ct = sa_text("""
        SELECT COUNT(*) FROM articles a
        WHERE EXISTS (
            SELECT 1 FROM article_li li
            WHERE LOWER(li."DataSupplierArticleNumber") = LOWER(a."DataSupplierArticleNumber")
            AND li."linkageId" = :mod
        )
    """)
    total = tecdoc_db.execute(ct, {"mod": mod_id}).scalar() or 0
    return {"items": items, "total": total, "page": page, "page_size": CATALOG_PAGE_SIZE}


@router.get("/search")
async def search_parts(
    q: str = Query(..., min_length=1),
    tecdoc_db: Session = Depends(get_tecdoc_db),
    db: Session = Depends(get_db),
    limit: int = Query(25, ge=1, le=100),
):
    t = sa_text("""
        SELECT s.name as supplier_name, a.article_number, a.supplier_id
        FROM autodb_articles a
        JOIN autodb_suppliers s ON s.id = a.supplier_id
        WHERE LOWER(a.article_number) LIKE :q
        ORDER BY a.article_number
        LIMIT :limit
    """)
    rows = tecdoc_db.execute(t, {"q": f"%{q.lower()}%", "limit": limit}).fetchall()

    items = []
    for r in rows:
        supplier_name, article, brand_id = r[0], r[1], r[2]
        sp = db.query(SupplierPrice).filter(
            SupplierPrice.tecdoc_brand_id == brand_id,
            SupplierPrice.tecdoc_article == article,
        ).first()

        items.append({
            "supplier_name": supplier_name, "article": article, "name": "",
            "price": float(sp.price) if sp and sp.price else None,
            "currency": str(sp.currency) if sp and sp.currency else "UAH",
            "stock_total": sp.stock_total if sp else 0,
            "supplier": sp.supplier if sp else "",
            "match_status": sp.match_status if sp else "",
            "stock_regions": sp.stock_regions if sp else None,
        })
    return items


@router.get("/search/autocomplete")
async def autocomplete(
    q: str = Query(..., min_length=2),
    tecdoc_db: Session = Depends(get_tecdoc_db),
    limit: int = Query(5, ge=1, le=10),
):
    t = sa_text("""
        SELECT a.article_number, s.name as supplier_name
        FROM autodb_articles a
        JOIN autodb_suppliers s ON s.id = a.supplier_id
        WHERE a.article_number ILIKE :prefix
        LIMIT :limit
    """)
    rows = tecdoc_db.execute(t, {"prefix": f"{q}%", "limit": limit}).fetchall()
    return [{"label": f"{r[0]} ({r[1] or ''})", "article": r[0]} for r in rows]
