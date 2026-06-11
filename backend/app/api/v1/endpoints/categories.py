from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.core.db import get_db
from app.models.parts import PartCategory, Part

router = APIRouter()


class CategoryChild(BaseModel):
    id: int
    name: str
    product_count: int


class CategoryGroup(BaseModel):
    name: str
    children: List[CategoryChild]


class HeaderCategory(BaseModel):
    id: int
    name: str
    groups: List[CategoryGroup]


class TosLink(BaseModel):
    id: int
    name: str
    product_count: int


class TosSection(BaseModel):
    heading: str
    links: List[TosLink]


class HeaderResponse(BaseModel):
    categories: List[HeaderCategory]
    zapchasti_dlya_to: Optional[List[TosSection]]


TO_SECTIONS = [
    {
        "heading": "Электрика",
        "links": [
            (1, "Стартерная аккумуляторная батарея"),
            (686, "Свечи зажигания"),
            (243, "Свечи накаливания"),
            (107, "Лампа накаливания, основная фара"),
        ],
    },
    {
        "heading": "Фильтры",
        "links": [
            (7, "Масляный фильтр"),
            (8, "Воздушный фильтр"),
            (424, "Фильтр, воздух во внутреннем пространстве"),
            (9, "Топливный фильтр"),
        ],
    },
    {
        "heading": "ТО двигателя",
        "links": [
            (306, "Ремень ГРМ"),
            (307, "Комплект ремня ГРМ"),
            (541, "Натяжитель ремня, клиновой зубча"),
            (1260, "Водяной насос"),
            (305, "Поликлиновой ремень"),
            (310, "Натяжной ролик, поликлиновойремень"),
            (316, "Термостат, охлаждающая жидкость"),
            (1862, "Моторное масло"),
        ],
    },
    {
        "heading": "ТО тормозной системы",
        "links": [
            (402, "Комплект тормозных колодок, дисковый тормоз"),
            (82, "Тормозной диск"),
        ],
    },
    {
        "heading": "ТО ходовой части",
        "links": [
            (914, "Наконечник поперечной рулевой тяги"),
        ],
    },
]


@router.get("/categories/header", response_model=HeaderResponse)
async def categories_header(db: Session = Depends(get_db)):
    all_cats = db.query(PartCategory).all()
    by_id = {c.id: c for c in all_cats}

    children_of = {}
    for c in all_cats:
        pid = c.parent_id or 0
        children_of.setdefault(pid, []).append(c)

    l1 = children_of.get(0, [])

    def get_product_count(cat_id: int) -> int:
        total = 0
        for cat in children_of.get(cat_id, []):
            total += get_product_count(cat.id)
        cat = by_id.get(cat_id)
        if cat and cat.tecdoc_id:
            total += db.query(Part).filter(Part.category_id == cat_id).count()
        return total

    categories = []
    for l1_cat in sorted(l1, key=lambda x: x.id):
        groups = []
        for l2_cat in sorted(children_of.get(l1_cat.id, []), key=lambda x: x.name):
            children = [
                CategoryChild(id=c.id, name=c.name, product_count=get_product_count(c.id))
                for c in sorted(children_of.get(l2_cat.id, []), key=lambda x: x.name)
            ]
            if children:
                groups.append(CategoryGroup(name=l2_cat.name, children=children))
        if groups:
            categories.append(HeaderCategory(id=l1_cat.id, name=l1_cat.name, groups=groups))

    to_sections = []
    for section in TO_SECTIONS:
        links = []
        for prd_id, prd_name in section["links"]:
            pc = db.query(PartCategory).filter(
                PartCategory.tecdoc_id == prd_id
            ).first()
            if pc:
                cnt = db.query(Part).filter(Part.category_id == pc.id).count()
                links.append(TosLink(id=pc.id, name=prd_name, product_count=cnt))
        if links:
            to_sections.append(TosSection(heading=section["heading"], links=links))

    return HeaderResponse(categories=categories, zapchasti_dlya_to=to_sections)
