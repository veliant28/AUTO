from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, text as sa_text
from typing import List, Optional
from app.core.db import get_db, get_tecdoc_db
from app.models import VehicleBrand, VehicleModel, VehicleModification, PartCategory, Part, PartApplicability, Supplier, SupplierOffer
from app.schemas.vehicle_schemas import BrandSchema, ModelSchema, ModSchema
from app.schemas.part_schemas import PartCategorySchema, PartSchema, PartListResponse
from app.services.sync_service import sync_service
from app.services.catalog_utils import best_offer, part_to_result

router = APIRouter()


@router.get("/makes", response_model=List[BrandSchema])
async def get_makes(db: Session = Depends(get_db)):
    """Получить список брендов автомобилей."""
    return db.query(VehicleBrand).all()


@router.get("/models/{brand_id}", response_model=List[ModelSchema])
async def get_models(brand_id: int, db: Session = Depends(get_db)):
    """Получить модели автомобилей по бренду."""
    return db.query(VehicleModel).filter(VehicleModel.brand_id == brand_id).all()


@router.get("/modifications/{model_id}", response_model=List[ModSchema])
async def get_modifications(model_id: int, db: Session = Depends(get_db)):
    """Получить модификации автомобиля по модели."""
    return db.query(VehicleModification).filter(VehicleModification.model_id == model_id).all()


@router.get("/sections/{mod_id}", response_model=List[PartCategorySchema])
async def get_sections(mod_id: int, db: Session = Depends(get_db)):
    """Получить секции (категории) запчастей для модификации."""
    sections = db.query(PartCategory).all()
    if not sections:
        await sync_service.sync_sections(db, mod_id=mod_id)
        sections = db.query(PartCategory).all()
    return sections


@router.get("/parts/{article}/applicability/makes")
async def get_part_applicability_makes(
    article: str,
    db: Session = Depends(get_db),
    tecdoc_db: Session = Depends(get_tecdoc_db),
):
    """Получить производителей, для которых подходит деталь."""
    search_articles = [article.lower()]
    part = db.query(Part).filter(Part.article == article, Part.is_active == True).first()

    for art in search_articles:
        rows = tecdoc_db.execute(
            sa_text("""SELECT DISTINCT man.id, man."description"
                       FROM article_li li
                       JOIN passanger_cars pc ON pc.id = li."linkageId"
                       JOIN models m ON m.id = pc.modelid
                       JOIN manufacturers man ON man.id = m.manufacturerid
                       WHERE LOWER(li."DataSupplierArticleNumber") = :art
                       ORDER BY man."description" ASC"""),
            {"art": art},
        ).fetchall()
        if rows:
            return [{"id": r[0], "name": r[1]} for r in rows]
    return []


@router.get("/parts/{article}/applicability/models")
async def get_part_applicability_models(
    article: str,
    make_id: int = Query(...),
    db: Session = Depends(get_db),
    tecdoc_db: Session = Depends(get_tecdoc_db),
):
    """Получить модели производителя, для которых подходит деталь."""
    search_articles = [article.lower()]
    part = db.query(Part).filter(Part.article == article, Part.is_active == True).first()

    for art in search_articles:
        rows = tecdoc_db.execute(
            sa_text("""SELECT DISTINCT m.id, m."description"
                       FROM article_li li
                       JOIN passanger_cars pc ON pc.id = li."linkageId"
                       JOIN models m ON m.id = pc.modelid
                       JOIN manufacturers man ON man.id = m.manufacturerid
                       WHERE LOWER(li."DataSupplierArticleNumber") = :art
                       AND man.id = :make_id
                       ORDER BY m."description" ASC"""),
            {"art": art, "make_id": make_id},
        ).fetchall()
        if rows:
            return [{"id": r[0], "name": r[1]} for r in rows]
    return []


@router.get("/parts/{article}/applicability")
async def get_part_applicability(
    article: str,
    db: Session = Depends(get_db),
    tecdoc_db: Session = Depends(get_tecdoc_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    make_id: Optional[int] = Query(None),
    model_id: Optional[int] = Query(None),
):
    """Получить список автомобилей, для которых подходит деталь."""
    search_articles = [article.lower()]
    vehicles = []
    total = 0

    for art in search_articles:
        where = 'WHERE LOWER(li."DataSupplierArticleNumber") = :art'
        params: dict = {"art": art}

        if make_id:
            where += ' AND man.id = :make_id'
            params["make_id"] = make_id
        if model_id:
            where += ' AND m.id = :model_id'
            params["model_id"] = model_id

        ct = sa_text(f"""
            SELECT COUNT(DISTINCT li."linkageId")
            FROM article_li li
            JOIN passanger_cars pc ON pc.id = li."linkageId"
            JOIN models m ON m.id = pc.modelid
            JOIN manufacturers man ON man.id = m.manufacturerid
            {where}
        """)
        total = tecdoc_db.execute(ct, params).scalar() or 0
        if total == 0:
            continue

        offset = (page - 1) * limit
        t = sa_text(f"""
            SELECT DISTINCT li."linkageId",
                   man."description" as brand,
                   m."description" as model,
                   pc."description" as mod_name,
                   pc."constructioninterval" as years
            FROM article_li li
            JOIN passanger_cars pc ON pc.id = li."linkageId"
            JOIN models m ON m.id = pc.modelid
            JOIN manufacturers man ON man.id = m.manufacturerid
            {where}
            ORDER BY man."description" ASC, m."description" ASC
            LIMIT :limit OFFSET :offset
        """)
        rows = tecdoc_db.execute(t, {**params, "limit": limit, "offset": offset}).fetchall()

        vehicles = [{
            "mod_id": r[0],
            "brand_name": r[1],
            "model_name": r[2],
            "mod_name": r[3],
            "years": r[4] or "",
        } for r in rows]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "vehicles": vehicles,
    }


@router.get("/parts/{article}/details")
async def get_part_details(
    article: str,
    db: Session = Depends(get_db),
    tecdoc_db: Session = Depends(get_tecdoc_db),
):
    """Получить детальную информацию о запчасти по артикулу или SKU."""
    parts = db.query(Part).filter(
        Part.is_active == True,
        or_(Part.article == article, Part.sku == article)
    ).all()
    part_data = None
    price_data = None
    if parts:
        part = parts[0]
        offers = db.query(SupplierOffer).options(
            joinedload(SupplierOffer.supplier)
        ).filter(SupplierOffer.part_id == part.id).all()
        best = best_offer(offers)
        part_data = {
            "id": part.id,
            "article": part.article,
            "name": part.name,
            "brand": part.brand,
            "brand_id": part.brand_id,
            "tecdoc_id": part.tecdoc_id,
            "sku": part.sku,
            "image_url": part.image_url,
        }
        if best:
            price_data = {
                "price": best["price"],
                "original_price": best["original_price"],
                "quantity": best["quantity"],
                "supplier_name": best["supplier_name"],
                "currency": best["currency"],
            }

    info_data = None
    images = []
    crosses = []
    oems = []
    app_count = 0

    # Use the part's article for TecDoc search (supports both article and SKU in URL)
    tecdoc_search = part.article if parts else article

    if tecdoc_search:
        try:
            info_row = tecdoc_db.execute(
                sa_text("""SELECT "InformationText", "InformationType"
                           FROM article_inf
                           WHERE LOWER("DataSupplierArticleNumber") = LOWER(:art) LIMIT 1"""),
                {"art": tecdoc_search},
            ).fetchone()

            attr_rows = tecdoc_db.execute(
                sa_text("""SELECT "displaytitle", "displayvalue"
                           FROM article_attributes
                           WHERE LOWER("datasupplierarticlenumber") = LOWER(:art) LIMIT 30"""),
                {"art": tecdoc_search},
            ).fetchall()
            attributes = [{"name": r[0] or "", "value": r[1] or ""} for r in attr_rows]

            if info_row:
                info_data = {
                    "description": info_row[0] or "",
                    "type": info_row[1] or "",
                    "attributes": attributes,
                }
            elif attributes:
                info_data = {
                    "description": "",
                    "type": "",
                    "attributes": attributes,
                }

            images = [
                {"name": r[0], "description": r[1] or ""} for r in tecdoc_db.execute(
                    sa_text("""SELECT "PictureName", "Description"
                               FROM article_images
                               WHERE LOWER("DataSupplierArticleNumber") = LOWER(:art) LIMIT 10"""),
                    {"art": tecdoc_search},
                ).fetchall()
            ]

            crosses = [
                {"article": r[0], "brand_name": r[1]} for r in tecdoc_db.execute(
                    sa_text("""SELECT DISTINCT ac."PartsDataSupplierArticleNumber", man."description"
                               FROM article_cross ac
                               LEFT JOIN manufacturers man ON man.id = ac."manufacturerId"
                               WHERE LOWER(ac."PartsDataSupplierArticleNumber") = LOWER(:art) LIMIT 20"""),
                    {"art": tecdoc_search},
                ).fetchall()
            ]

            oems = [
                {"number": r[0], "brand_name": r[1]} for r in tecdoc_db.execute(
                    sa_text("""SELECT DISTINCT ae."OENbr", man."description"
                               FROM article_oe ae
                               LEFT JOIN manufacturers man ON man.id = ae."manufacturerId"
                               WHERE LOWER(ae."datasupplierarticlenumber") = LOWER(:art)
                               AND ae."OENbr" IS NOT NULL AND ae."OENbr" != ''
                               LIMIT 20"""),
                    {"art": tecdoc_search},
                ).fetchall()
            ]

            app_count = tecdoc_db.execute(
                sa_text("""SELECT COUNT(*) FROM article_li WHERE LOWER("DataSupplierArticleNumber") = LOWER(:art)"""),
                {"art": tecdoc_search},
            ).scalar() or 0
        except Exception:
            # TecDoc table not available — return part data without enrichment
            pass

    return {
        "part": part_data,
        "price": price_data,
        "info": info_data,
        "images": images,
        "crosses": crosses,
        "oem": oems,
        "applicability_count": app_count,
    }


@router.get("/parts/{mod_id}/{sec_id}", response_model=PartListResponse)
async def get_parts(
    mod_id: int,
    sec_id: int,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    in_stock_only: bool = Query(False),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    supplier_id: Optional[int] = Query(None),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query("asc"),
):
    """Получить запчасти для модификации по секции."""
    if mod_id == 0:
        base_query = db.query(Part).filter(Part.category_id == sec_id, Part.is_active == True)
    else:
        local_mod = db.query(VehicleModification).filter(
            (VehicleModification.tecdoc_id == mod_id) | (VehicleModification.id == mod_id)
        ).first()
        if not local_mod:
            raise HTTPException(status_code=404, detail="Modification not found")
        base_query = db.query(Part).join(PartApplicability).filter(
            PartApplicability.mod_id == local_mod.id,
            Part.category_id == sec_id,
            Part.is_active == True,
        )

    need_offer_join = any([in_stock_only, min_price is not None, max_price is not None, supplier_id is not None, sort_by == "price"])
    if need_offer_join:
        base_query = base_query.join(SupplierOffer)
    if in_stock_only:
        base_query = base_query.filter(SupplierOffer.quantity > 0)
    if min_price is not None:
        base_query = base_query.filter(SupplierOffer.final_price >= min_price)
    if max_price is not None:
        base_query = base_query.filter(SupplierOffer.final_price <= max_price)
    if supplier_id is not None:
        base_query = base_query.filter(SupplierOffer.supplier_id == supplier_id)

    if sort_by == "price":
        order_col = SupplierOffer.final_price
        base_query = base_query.order_by(order_col.asc() if sort_order == "asc" else order_col.desc())
    elif sort_by == "name":
        order_col = Part.name
        base_query = base_query.order_by(order_col.asc() if sort_order == "asc" else order_col.desc())

    base_query = base_query.distinct()
    total = base_query.count()
    parts = base_query.offset((page - 1) * page_size).limit(page_size).all()

    if not parts and page == 1 and mod_id != 0:
        await sync_service.sync_parts_for_section(db, mod_id=mod_id, sec_id=sec_id)
        parts = base_query.offset((page - 1) * page_size).limit(page_size).all()
        if parts:
            total = base_query.count()

    result = [part_to_result(p, db) for p in parts]

    return {
        "items": result,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/search", response_model=List[PartSchema])
async def search_parts(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
):
    """Поиск запчастей по артикулу или названию."""
    results = db.query(Part).filter(
        Part.is_active == True,
        or_(
            Part.article.ilike(f"%{q}%"),
            Part.name.ilike(f"%{q}%"),
            Part.sku.ilike(f"%{q}%"),
        )
    ).limit(limit).all()

    enriched = []
    for part in results:
        offers = db.query(SupplierOffer).options(
            joinedload(SupplierOffer.supplier)
        ).filter(SupplierOffer.part_id == part.id).all()
        best = best_offer(offers)

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
            "sku": part.sku,
        })
    return enriched


@router.get("/search/autocomplete")
async def autocomplete(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    limit: int = Query(5, ge=1, le=10),
):
    """Автодополнение поискового запроса."""
    results = db.query(Part).filter(
        or_(
            Part.article.ilike(f"{q}%"),
            Part.name.ilike(f"%{q}%"),
            Part.sku.ilike(f"%{q}%"),
        )
    ).limit(limit).all()

    return [
        {"id": p.id, "label": f"{p.article} — {p.name} [{p.brand or ''}]", "article": p.article}
        for p in results
    ]


@router.post("/sync/vehicles")
async def trigger_vehicle_sync(db: Session = Depends(get_db)):
    """Запустить синхронизацию автомобилей из TecDoc."""
    result = await sync_service.full_vehicle_sync(db)
    return {"message": "Sync completed", "details": result}
