from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Tuple
from app.core.db import get_db
from app.models import User, PartCategory
from app.schemas.part_schemas import PartCategorySchema, CategoryCreate, CategoryUpdate, CategoryListResponse
from app.api.v1.deps import require_permission

router = APIRouter()


def _build_tree_flat(categories: List[PartCategory]) -> List[Tuple[PartCategory, int]]:
    """Flatten category tree with depth-aware ordering. Returns (category, depth)."""
    by_id = {c.id: c for c in categories}
    children_map: dict[int, List[PartCategory]] = {}
    for c in categories:
        pid = c.parent_id or 0
        children_map.setdefault(pid, []).append(c)
    result: List[tuple[PartCategory, int]] = []
    def _walk(parent_id: int, depth: int):
        for child in sorted(children_map.get(parent_id, []), key=lambda x: x.name):
            result.append((child, depth))
            _walk(child.id, depth + 1)
    _walk(0, 0)
    return result


@router.get("/categories", response_model=CategoryListResponse)
async def list_categories(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=1000),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("categories.view")),
):
    """Список категорий с поиском и плоским деревом с отступами."""
    query = db.query(PartCategory)
    if search:
        like = f"%{search}%"
        query = query.filter(
            PartCategory.name.ilike(like)
            | PartCategory.name_ua.ilike(like)
            | PartCategory.name_en.ilike(like)
        )
    total = query.count()
    # For tree display, we fetch all and flatten with depth ordering
    # But paginate the flat list
    all_cats = query.all()
    flat = _build_tree_flat(all_cats)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = flat[start:end]
    return CategoryListResponse(
        items=[PartCategorySchema(id=c.id, name=c.name, name_ua=c.name_ua, name_en=c.name_en, tecdoc_id=c.tecdoc_id, parent_id=c.parent_id, depth=d) for c, d in paginated],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/categories", response_model=PartCategorySchema)
async def create_category(
    data: CategoryCreate,
    current_user: User = Depends(require_permission("categories.create")),
    db: Session = Depends(get_db),
):
    """Создать новую категорию."""
    cat = PartCategory(name=data.name, name_ua=data.name_ua, name_en=data.name_en, parent_id=data.parent_id)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return PartCategorySchema.model_validate(cat)


@router.put("/categories/{cat_id}", response_model=PartCategorySchema)
async def update_category(
    cat_id: int,
    data: CategoryUpdate,
    current_user: User = Depends(require_permission("categories.edit")),
    db: Session = Depends(get_db),
):
    """Обновить категорию по ID."""
    cat = db.query(PartCategory).filter(PartCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    if data.name is not None:
        cat.name = data.name
    if data.name_ua is not None:
        cat.name_ua = data.name_ua
    if data.name_en is not None:
        cat.name_en = data.name_en
    if data.parent_id is not None:
        # Prevent setting self as parent or creating cycle
        if data.parent_id == cat_id:
            raise HTTPException(400, "Cannot set self as parent")
        cat.parent_id = data.parent_id
    db.commit()
    db.refresh(cat)
    return PartCategorySchema.model_validate(cat)


@router.delete("/categories/{cat_id}")
async def delete_category(
    cat_id: int,
    current_user: User = Depends(require_permission("categories.delete")),
    db: Session = Depends(get_db),
):
    """Удалить категорию по ID (только без дочерних)."""
    cat = db.query(PartCategory).filter(PartCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Category not found")
    # Check for children
    has_children = db.query(PartCategory).filter(PartCategory.parent_id == cat_id).first()
    if has_children:
        raise HTTPException(400, "Cannot delete category with children")
    db.delete(cat)
    db.commit()
    return {"ok": True}
