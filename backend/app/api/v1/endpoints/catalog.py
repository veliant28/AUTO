import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, text as sa_text
from typing import List, Optional, Dict, Any
from app.core.db import get_db, get_tecdoc_db
from app.models import VehicleBrand, VehicleModel, VehicleModification, PartCategory, Part, PartApplicability, SupplierOffer, Supplier
from app.schemas.vehicle_schemas import BrandSchema, ModelSchema, ModSchema
from app.schemas.part_schemas import PartCategorySchema, PartSchema, PartListResponse
from app.services.sync_service import sync_service
from app.services.tecdoc_client import tecdoc_client

router = APIRouter()


def _best_offer(offers: List[SupplierOffer]) -> Optional[Dict[str, Any]]:
    """Pick the best offer: in-stock, freshest first. Use final_price if available."""
    in_stock = [o for o in offers if o.quantity > 0]
    candidates = in_stock or offers
    if not candidates:
        return None
    best = max(candidates, key=lambda o: (o.updated_at or o.id, o.id))
    effective_price = float(best.final_price) if best.final_price is not None else float(best.price)
    return {
        "price": effective_price,
        "original_price": float(best.price),
        "quantity": best.quantity or 0,
        "supplier_name": best.supplier.name if best.supplier else None,
        "currency": best.currency or "UAH",
    }


def _part_to_result(part, db) -> dict:
    offers = db.query(SupplierOffer).options(
        joinedload(SupplierOffer.supplier)
    ).filter(SupplierOffer.part_id == part.id).all()
    best = _best_offer(offers)
    return {
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
        "image_url": None,
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


@router.get("/parts/{article}/applicability/makes")
async def get_part_applicability_makes(
    article: str,
    tecdoc_db: Session = Depends(get_tecdoc_db),
):
    art = article.lower()
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
    return [{"id": r[0], "name": r[1]} for r in rows]


@router.get("/parts/{article}/applicability/models")
async def get_part_applicability_models(
    article: str,
    make_id: int = Query(...),
    tecdoc_db: Session = Depends(get_tecdoc_db),
):
    art = article.lower()
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
    return [{"id": r[0], "name": r[1]} for r in rows]


@router.get("/parts/{article}/applicability")
async def get_part_applicability(
    article: str,
    tecdoc_db: Session = Depends(get_tecdoc_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    make_id: Optional[int] = Query(None),
    model_id: Optional[int] = Query(None),
):
    art = article.lower()

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
    # 1. Part + best offer from main DB
    parts = db.query(Part).filter(Part.article == article).all()
    part_data = None
    price_data = None
    if parts:
        part = parts[0]
        offers = db.query(SupplierOffer).options(
            joinedload(SupplierOffer.supplier)
        ).filter(SupplierOffer.part_id == part.id).all()
        best = _best_offer(offers)
        part_data = {
            "id": part.id,
            "article": part.article,
            "name": part.name,
            "brand": part.brand,
            "brand_id": part.brand_id,
            "tecdoc_id": part.tecdoc_id,
        }
        if best:
            price_data = {
                "price": best["price"],
                "original_price": best["original_price"],
                "quantity": best["quantity"],
                "supplier_name": best["supplier_name"],
                "currency": best["currency"],
            }

    # 2. Article info from tecdoc_db (original tables)
    info_row = tecdoc_db.execute(
        sa_text("""SELECT "InformationText", "InformationType"
                   FROM article_inf
                   WHERE LOWER("DataSupplierArticleNumber") = LOWER(:art) LIMIT 1"""),
        {"art": article},
    ).fetchone()

    # 3. Attributes
    attr_rows = tecdoc_db.execute(
        sa_text("""SELECT "displaytitle", "displayvalue"
                   FROM article_attributes
                   WHERE LOWER("datasupplierarticlenumber") = LOWER(:art) LIMIT 30"""),
        {"art": article},
    ).fetchall()
    attributes = [{"name": r[0] or "", "value": r[1] or ""} for r in attr_rows]

    info_data = None
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

    # 4. Images
    images = tecdoc_db.execute(
        sa_text("""SELECT "PictureName", "Description"
                   FROM article_images
                   WHERE LOWER("DataSupplierArticleNumber") = LOWER(:art) LIMIT 10"""),
        {"art": article},
    ).fetchall()

    # 5. Crosses
    crosses = tecdoc_db.execute(
        sa_text("""SELECT "PartsDataSupplierArticleNumber", "manufacturerId" FROM article_cross
                   WHERE LOWER("PartsDataSupplierArticleNumber") = LOWER(:art) LIMIT 20"""),
        {"art": article},
    ).fetchall()

    # 6. OEM
    oems = tecdoc_db.execute(
        sa_text("""SELECT "OENbr", "manufacturerId" FROM article_oe
                   WHERE LOWER("OENbr") = LOWER(:art)
                   AND "OENbr" IS NOT NULL AND "OENbr" != ''
                   LIMIT 20"""),
        {"art": article},
    ).fetchall()

    # 7. Applicability count
    app_count = tecdoc_db.execute(
        sa_text("""SELECT COUNT(*) FROM article_li WHERE LOWER("DataSupplierArticleNumber") = LOWER(:art)"""),
        {"art": article},
    ).scalar() or 0

    return {
        "part": part_data,
        "price": price_data,
        "info": info_data,
        "images": [{"name": r[0], "description": r[1] or ""} for r in images],
        "crosses": [{"article": r[0], "brand_id": r[1]} for r in crosses],
        "oem": [{"number": r[0], "manufacturer_id": r[1]} for r in oems],
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
    if mod_id == 0:
        base_query = db.query(Part).filter(Part.category_id == sec_id)
    else:
        local_mod = db.query(VehicleModification).filter(
            (VehicleModification.tecdoc_id == mod_id) | (VehicleModification.id == mod_id)
        ).first()
        if not local_mod:
            raise HTTPException(status_code=404, detail="Modification not found")
        base_query = db.query(Part).join(PartApplicability).filter(
            PartApplicability.mod_id == local_mod.id,
            Part.category_id == sec_id,
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

    result = [_part_to_result(p, db) for p in parts]

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


@router.post("/sync/vehicles")
async def trigger_vehicle_sync(db: Session = Depends(get_db)):
    result = await sync_service.full_vehicle_sync(db)
    return {"message": "Sync completed", "details": result}


# ─── Vehicle cascade (public, from TecDoc) ────────────────────────────────

_VEHICLE_TYPES = {
    'passenger': {'table': 'autodb_passenger_cars', 'has_engine': True},
    'commercial': {'table': 'commercial_vehicles', 'has_engine': False},
    'motorbike': {'table': 'motorbikes', 'has_engine': False},
}

_YEAR_FILTER_AUTO = ':year BETWEEN pc.start_year AND pc.end_year'
_YEAR_FILTER_BASIC = "CAST(SPLIT_PART(pc.constructioninterval, '-', 1) AS INTEGER) <= :year AND (CAST(SPLIT_PART(pc.constructioninterval, '-', 2) AS INTEGER) >= :year OR SPLIT_PART(pc.constructioninterval, '-', 2) = '' OR SPLIT_PART(pc.constructioninterval, '-', 2) IS NULL)"
_YEAR_FILTER_DOT = """
    CAST(NULLIF(SPLIT_PART(SPLIT_PART(pc.constructioninterval, ' - ', 1), '.', 2), '') AS INTEGER) <= :year
    AND (CAST(NULLIF(SPLIT_PART(SPLIT_PART(pc.constructioninterval, ' - ', 2), '.', 2), '') AS INTEGER) >= :year
         OR SPLIT_PART(pc.constructioninterval, ' - ', 2) = ''
         OR SPLIT_PART(pc.constructioninterval, ' - ', 2) IS NULL)
"""


def _attr_subquery(attr_type: str, alias: str) -> str:
    return f"""(SELECT attr.displayvalue FROM passanger_car_attributes attr
                WHERE attr.passangercarid = pc.id
                AND attr.attributetype = '{attr_type}'
                LIMIT 1) as {alias}"""


def _attr_exists(attr_type: str, param: str) -> str:
    return f"""EXISTS (SELECT 1 FROM passanger_car_attributes a
                WHERE a.passangercarid = pc.id
                AND a.attributetype = '{attr_type}'
                AND a.displayvalue = :{param})"""


@router.get("/vehicle/years")
async def vehicle_years(type: str = 'passenger', tecdoc_db: Session = Depends(get_tecdoc_db)):
    if type not in _VEHICLE_TYPES:
        return []
    table = _VEHICLE_TYPES[type]['table']
    if table == 'autodb_passenger_cars':
        rows = tecdoc_db.execute(sa_text(f"""
            SELECT DISTINCT y FROM (
                SELECT start_year as y FROM {table} WHERE start_year IS NOT NULL
                UNION
                SELECT end_year as y FROM {table} WHERE end_year IS NOT NULL
            ) sub ORDER BY y
        """)).fetchall()
    else:
        rows = tecdoc_db.execute(sa_text(f"""
            SELECT DISTINCT y FROM (
                SELECT (regexp_match(constructioninterval, '(\\d{{4}})'))[1]::int as y
                FROM {table} WHERE constructioninterval ~ '\\d{{4}}'
            ) sub WHERE y IS NOT NULL AND y >= 1900 AND y <= 2100 ORDER BY y
        """)).fetchall()
    return [{'year': r[0]} for r in rows]


@router.get("/vehicle/makes")
async def vehicle_makes(type: str = 'passenger', year: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    if type not in _VEHICLE_TYPES:
        return []
    table = _VEHICLE_TYPES[type]['table']
    yf = _YEAR_FILTER_AUTO if table == 'autodb_passenger_cars' else _YEAR_FILTER_DOT
    sql = sa_text(f"""
        SELECT DISTINCT man.id, man.description FROM {table} pc
        JOIN {"autodb_models" if table == "autodb_passenger_cars" else "models"} m ON m.id = pc.{'model_id' if table == "autodb_passenger_cars" else 'modelid'}
        JOIN {"autodb_manufacturers" if table == "autodb_passenger_cars" else "manufacturers"} man ON man.id = m.{'manufacturer_id' if table == "autodb_passenger_cars" else 'manufacturerid'}
        WHERE {yf} ORDER BY man.description
    """)
    rows = tecdoc_db.execute(sql, {'year': year}).fetchall()
    return [{'id': r[0], 'name': r[1]} for r in rows]


@router.get("/vehicle/models")
async def vehicle_models(type: str = 'passenger', year: int = Query(...), make_id: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    if type not in _VEHICLE_TYPES:
        return []
    table = _VEHICLE_TYPES[type]['table']
    yf = _YEAR_FILTER_AUTO if table == 'autodb_passenger_cars' else _YEAR_FILTER_DOT
    mod_table = 'autodb_models' if table == 'autodb_passenger_cars' else 'models'
    man_table = 'autodb_manufacturers' if table == 'autodb_passenger_cars' else 'manufacturers'
    model_fk = 'model_id' if table == 'autodb_passenger_cars' else 'modelid'
    man_fk = 'manufacturer_id' if table == 'autodb_passenger_cars' else 'manufacturerid'
    sql = sa_text(f"""
        SELECT DISTINCT m.id, m.description FROM {table} pc
        JOIN {mod_table} m ON m.id = pc.{model_fk}
        JOIN {man_table} man ON man.id = m.{man_fk}
        WHERE man.id = :make_id AND {yf} ORDER BY m.description
    """)
    rows = tecdoc_db.execute(sql, {'make_id': make_id, 'year': year}).fetchall()
    return [{'id': r[0], 'name': r[1] or ''} for r in rows]


@router.get("/vehicle/cars")
async def vehicle_cars(type: str = 'passenger', year: int = Query(...), model_id: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    if type not in _VEHICLE_TYPES:
        return []
    table = _VEHICLE_TYPES[type]['table']
    has_engine = _VEHICLE_TYPES[type]['has_engine']

    if has_engine:
        sql = sa_text(f"""
            SELECT pc.id, pc.description, pc.start_year, pc.end_year,
                   {_attr_subquery('Capacity', 'capacity')},
                   (SELECT string_agg(DISTINCT attr.displayvalue, ', ' ORDER BY attr.displayvalue) FROM passanger_car_attributes attr WHERE attr.passangercarid = pc.id AND attr.attributetype = 'EngineCode') as engine_code,
                   {_attr_subquery('FuelType', 'fuel')},
                   {_attr_subquery('Power', 'power')}
            FROM {table} pc
            WHERE pc.model_id = :model_id AND {_YEAR_FILTER_AUTO}
            ORDER BY pc.description
        """)
        rows = tecdoc_db.execute(sql, {'model_id': model_id, 'year': year}).fetchall()
        return [{
            'id': r[0], 'name': r[1] or '', 'year_from': r[2], 'year_to': r[3],
            'capacity': r[4] or '', 'engine': r[5] or '', 'fuel': r[6] or '', 'power': r[7] or '',
        } for r in rows]
    else:
        sql = sa_text(f"""
            SELECT pc.id, pc.description, pc.fulldescription, pc.constructioninterval
            FROM {table} pc
            WHERE pc.modelid = :model_id AND {_YEAR_FILTER_DOT}
            ORDER BY pc.description
        """)
        rows = tecdoc_db.execute(sql, {'model_id': model_id, 'year': year}).fetchall()
        return [{
            'id': r[0], 'name': r[2] or r[1] or '', 'year_from': None, 'year_to': None,
            'capacity': '', 'engine': '', 'fuel': '', 'power': '', 'constructioninterval': r[3] or '',
        } for r in rows]


@router.get("/vehicle/volumes")
async def vehicle_volumes(year: int = Query(...), model_id: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT attr.displayvalue FROM autodb_passenger_cars pc
        JOIN passanger_car_attributes attr ON attr.passangercarid = pc.id
        WHERE pc.model_id = :model_id AND {_YEAR_FILTER_AUTO}
        AND attr.attributetype = 'Capacity'
        AND attr.displayvalue IS NOT NULL AND attr.displayvalue != ''
        ORDER BY attr.displayvalue
    """), {'model_id': model_id, 'year': year}).fetchall()
    return [{'volume': r[0]} for r in rows]


@router.get("/vehicle/engines")
async def vehicle_engines(year: int = Query(...), model_id: int = Query(...), volume: str = Query(''), tecdoc_db: Session = Depends(get_tecdoc_db)):
    vol_cond = f"AND {_attr_exists('Capacity', 'volume')}" if volume else ''
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT attr.displayvalue FROM autodb_passenger_cars pc
        JOIN passanger_car_attributes attr ON attr.passangercarid = pc.id
        WHERE pc.model_id = :model_id AND {_YEAR_FILTER_AUTO}
        AND attr.attributetype = 'EngineCode'
        {vol_cond}
        AND attr.displayvalue IS NOT NULL AND attr.displayvalue != ''
        ORDER BY attr.displayvalue
    """), {'model_id': model_id, 'year': year, 'volume': volume}).fetchall()
    return [{'engine': r[0]} for r in rows]
