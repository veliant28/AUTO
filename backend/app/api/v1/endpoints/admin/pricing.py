import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from decimal import Decimal
from typing import List, Optional
from app.core.db import get_db
from app.api.v1.deps import require_role, require_permission
from app.models import User
from app.models.pricing import PriceRule, PriceRuleHistory, PricingApplySnapshot
from app.models.parts import PartCategory
from app.services.pricing_service import (
    get_or_create_general_rule, get_or_create_category_rule, update_rule,
    apply_margins_bulk, cleanup_old_history
)
from pydantic import BaseModel

router = APIRouter()


class GeneralMarginUpdate(BaseModel):
    margin_percent: float


class CategoryMarginUpdate(BaseModel):
    margin_percent: Optional[float] = None


class CategoryMarginBulkUpdate(BaseModel):
    rules: List[dict]


class PriceRuleResponse(BaseModel):
    id: int
    type: str
    category_id: Optional[int]
    margin_percent: float
    is_active: bool
    created_at: Optional[str]
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class CategoryRuleItem(BaseModel):
    category_id: int
    category_name: str
    margin_percent: Optional[float]
    is_active: bool


class HistoryItem(BaseModel):
    id: int
    price_rule_id: int
    old_percent: float
    new_percent: float
    changed_at: str

    class Config:
        from_attributes = True


@router.get("/pricing/general", response_model=PriceRuleResponse)
async def get_general_margin(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("pricing.view")),
):
    """Получить общую маржу."""
    rule = db.query(PriceRule).filter(PriceRule.type == "general").first()
    if not rule:
        return PriceRuleResponse(
            id=0, type="general", category_id=None,
            margin_percent=0.0, is_active=True,
            created_at=None, updated_at=None
        )
    return PriceRuleResponse(
        id=rule.id, type=rule.type, category_id=rule.category_id,
        margin_percent=float(rule.margin_percent), is_active=rule.is_active,
        created_at=str(rule.created_at) if rule.created_at else None,
        updated_at=str(rule.updated_at) if rule.updated_at else None,
    )


@router.put("/pricing/general", response_model=PriceRuleResponse)
async def update_general_margin(
    data: GeneralMarginUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("pricing.edit")),
):
    """Обновить общую маржу."""
    rule = get_or_create_general_rule(db)
    new_margin = Decimal(str(data.margin_percent))
    update_rule(db, rule, new_margin)
    return PriceRuleResponse(
        id=rule.id, type=rule.type, category_id=rule.category_id,
        margin_percent=float(rule.margin_percent), is_active=rule.is_active,
        created_at=str(rule.created_at) if rule.created_at else None,
        updated_at=str(rule.updated_at) if rule.updated_at else None,
    )


@router.get("/pricing/categories", response_model=List[CategoryRuleItem])
async def get_category_margins(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=1000),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("pricing.view")),
):
    """Получить маржу по категориям с поиском."""
    q = db.query(PartCategory)
    if search:
        q = q.filter(PartCategory.name.ilike(f"%{search}%"))
    total = q.count()
    categories = q.order_by(PartCategory.name).offset((page - 1) * page_size).limit(page_size).all()
    rules = {
        r.category_id: r for r in db.query(PriceRule).filter(
            PriceRule.type == "category"
        ).all()
    }
    
    result = []
    for cat in categories:
        rule = rules.get(cat.id)
        result.append(CategoryRuleItem(
            category_id=cat.id,
            category_name=cat.name,
            margin_percent=float(rule.margin_percent) if rule else None,
            is_active=rule.is_active if rule else False,
        ))
    
    return response_headers(result, total)


def response_headers(items: list, total: int):
    from fastapi.responses import JSONResponse
    from fastapi.encoders import jsonable_encoder
    
    return JSONResponse(
        content=jsonable_encoder({"items": items, "total": total})
    )


@router.put("/pricing/categories/{category_id}", response_model=CategoryRuleItem)
async def update_category_margin(
    category_id: int,
    data: CategoryMarginUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("pricing.edit")),
):
    """Обновить маржу для конкретной категории."""
    category = db.query(PartCategory).filter(PartCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    rule = get_or_create_category_rule(db, category_id)
    
    if data.margin_percent is None:
        # Deactivate/remove rule
        rule.is_active = False
        rule.margin_percent = Decimal(0)
        db.commit()
    else:
        new_margin = Decimal(str(data.margin_percent))
        update_rule(db, rule, new_margin)
    
    return CategoryRuleItem(
        category_id=category.id,
        category_name=category.name,
        margin_percent=float(rule.margin_percent) if rule.is_active else None,
        is_active=rule.is_active,
    )


@router.post("/pricing/categories/bulk")
async def update_category_margins_bulk(
    data: CategoryMarginBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("pricing.edit")),
):
    """Массово обновить маржу по категориям."""
    for item in data.rules:
        cat_id = item.get("category_id")
        margin = item.get("margin_percent")
        
        category = db.query(PartCategory).filter(PartCategory.id == cat_id).first()
        if not category:
            continue
        
        rule = get_or_create_category_rule(db, cat_id)
        
        if margin is None or margin == 0:
            rule.is_active = False
            rule.margin_percent = Decimal(0)
        else:
            new_margin = Decimal(str(margin))
            if rule.margin_percent != new_margin:
                history = PriceRuleHistory(
                    price_rule_id=rule.id,
                    old_percent=rule.margin_percent,
                    new_percent=new_margin
                )
                db.add(history)
            rule.margin_percent = new_margin
            rule.is_active = True
    
    db.commit()
    return {"status": "ok"}


@router.get("/pricing/history", response_model=List[HistoryItem])
async def get_pricing_history(
    type: str = "general",
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("pricing.view")),
):
    """Получить историю изменений маржи."""
    query = db.query(PriceRuleHistory).join(PriceRule)
    
    if type == "general":
        query = query.filter(PriceRule.type == "general")
    elif category_id:
        query = query.filter(
            PriceRule.type == "category",
            PriceRule.category_id == category_id
        )
    
    # Cleanup old history on read (lazy cleanup)
    cleanup_old_history(db, days=30)
    
    items = query.order_by(PriceRuleHistory.changed_at.desc()).limit(100).all()
    
    return [
        HistoryItem(
            id=h.id,
            price_rule_id=h.price_rule_id,
            old_percent=float(h.old_percent),
            new_percent=float(h.new_percent),
            changed_at=str(h.changed_at),
        )
        for h in items
    ]


@router.post("/pricing/apply")
async def apply_pricing(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("pricing.apply")),
):
    """Запустить применение маржи ко всем товарам."""
    from app.workers.tasks.pricing_tasks import apply_margins_task
    task = apply_margins_task.delay()
    return {"task_id": task.id, "status": "queued"}


@router.get("/pricing/task-status/{task_id}")
async def get_task_status(
    task_id: str,
    current_user: User = Depends(require_permission("pricing.view")),
):
    """Получить статус задачи применения маржи."""
    from celery.result import AsyncResult
    from app.workers import celery_app
    result = AsyncResult(task_id, app=celery_app)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }


@router.get("/pricing/applied-history")
async def get_applied_pricing_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("pricing.view")),
):
    """Получить историю применений маржи."""
    items = db.query(PricingApplySnapshot).order_by(
        PricingApplySnapshot.applied_at.desc()
    ).limit(100).all()
    return [
        {
            "id": s.id,
            "applied_at": str(s.applied_at),
            "general_margin": float(s.general_margin) if s.general_margin is not None else None,
            "category_margins": json.loads(s.category_margins) if s.category_margins else None,
        }
        for s in items
    ]
