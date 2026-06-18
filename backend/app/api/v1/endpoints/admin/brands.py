from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, text as sa_text
from app.core.db import get_db, get_tecdoc_db
from app.api.v1.deps import require_role
from app.models import User, SupplierPrice
from app.schemas.admin_schemas import BrandListItem, BrandListResponse

router = APIRouter()


@router.get("/brands", response_model=BrandListResponse)
async def list_brands(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=1000),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    tecdoc_db: Session = Depends(get_tecdoc_db),
    current_user: User = Depends(require_role("admin")),
):
    """Список брендов с агрегированной статистикой по наличию, сопоставлению и применимости."""
    agg_rows = db.query(
        SupplierPrice.tecdoc_brand_id,
        func.count(SupplierPrice.id).label("total"),
        func.sum(case((SupplierPrice.match_status == "matched", 1), else_=0)).label("matched"),
        func.sum(case((SupplierPrice.match_status == "matched_app", 1), else_=0)).label("with_app"),
        func.sum(case((SupplierPrice.match_status.in_(["unmatched", "not_found"]), 1), else_=0)).label("unmatched"),
    ).filter(SupplierPrice.tecdoc_brand_id.isnot(None)).group_by(SupplierPrice.tecdoc_brand_id).all()

    brand_ids = [a.tecdoc_brand_id for a in agg_rows]

    name_map: dict[int, str] = {}
    if brand_ids:
        names = tecdoc_db.execute(
            sa_text("SELECT id, name FROM autodb_suppliers WHERE id = ANY(:ids)"),
            {"ids": brand_ids},
        ).fetchall()
        for row in names:
            name_map[row[0]] = row[1]

    items = []
    for agg in agg_rows:
        name = name_map.get(agg.tecdoc_brand_id, f"ID:{agg.tecdoc_brand_id}")
        if search and search.lower() not in name.lower():
            continue
        items.append(BrandListItem(
            id=agg.tecdoc_brand_id,
            name=name,
            total=int(agg.total or 0),
            matched=int(agg.matched or 0) + int(agg.with_app or 0),
            unmatched=int(agg.unmatched or 0),
            with_applicability=int(agg.with_app or 0),
        ))

    items.sort(key=lambda x: x.total, reverse=True)
    total = len(items)
    start = (page - 1) * page_size
    paged = items[start:start + page_size]

    return BrandListResponse(
        items=paged, total=total, page=page, page_size=page_size,
    )
