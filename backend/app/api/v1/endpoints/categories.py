from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Tuple
from pydantic import BaseModel
from app.core.db import get_db
from app.models.parts import PartCategory, Part
from app.utils.translator import translate

router = APIRouter()


class CategoryChild(BaseModel):
    id: int
    name: str
    name_ru: str
    product_count: int


class CategoryGroup(BaseModel):
    name: str
    name_ru: str
    children: List[CategoryChild]


class HeaderCategory(BaseModel):
    id: int
    name: str
    name_ru: str
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


TO_SECTIONS: Dict[str, List[dict]] = {
    "ru": [
        {"heading": "Электрика", "links": [(1, "Стартерная аккумуляторная батарея"), (686, "Свечи зажигания"), (243, "Свечи накаливания"), (107, "Лампа накаливания, основная фара")]},
        {"heading": "Фильтры", "links": [(7, "Масляный фильтр"), (8, "Воздушный фильтр"), (424, "Фильтр, воздух во внутреннем пространстве"), (9, "Топливный фильтр")]},
        {"heading": "ТО двигателя", "links": [(306, "Ремень ГРМ"), (307, "Комплект ремня ГРМ"), (541, "Натяжитель ремня, клиновой зубча"), (1260, "Водяной насос"), (305, "Поликлиновой ремень"), (310, "Натяжной ролик, поликлиновойремень"), (316, "Термостат, охлаждающая жидкость"), (1862, "Моторное масло")]},
        {"heading": "ТО тормозной системы", "links": [(402, "Комплект тормозных колодок, дисковый тормоз"), (82, "Тормозной диск")]},
        {"heading": "ТО ходовой части", "links": [(914, "Наконечник поперечной рулевой тяги")]},
    ],
    "ua": [
        {"heading": "Електрика", "links": [(1, "Стартерна акумуляторна батарея"), (686, "Свічки запалювання"), (243, "Свічки розжарювання"), (107, "Лампа розжарювання, основна фара")]},
        {"heading": "Фільтри", "links": [(7, "Масляний фільтр"), (8, "Повітряний фільтр"), (424, "Фільтр, повітря в салоні"), (9, "Паливний фільтр")]},
        {"heading": "ТО двигуна", "links": [(306, "Ремінь ГРМ"), (307, "Комплект ременя ГРМ"), (541, "Натягувач ременя, клиновий зубчастий"), (1260, "Водяний насос"), (305, "Полікліновий ремінь"), (310, "Натяжний ролик, поліклінового ременя"), (316, "Термостат, охолоджуюча рідина"), (1862, "Моторне масло")]},
        {"heading": "ТО гальмівної системи", "links": [(402, "Комплект гальмівних колодок, дисковий гальмо"), (82, "Гальмівний диск")]},
        {"heading": "ТО ходової частини", "links": [(914, "Наконечник поперечної рульової тяги")]},
    ],
    "en": [
        {"heading": "Electrics", "links": [(1, "Starter battery"), (686, "Spark plugs"), (243, "Glow plugs"), (107, "Bulb, main headlight")]},
        {"heading": "Filters", "links": [(7, "Oil filter"), (8, "Air filter"), (424, "Cabin air filter"), (9, "Fuel filter")]},
        {"heading": "Engine Service", "links": [(306, "Timing belt"), (307, "Timing belt kit"), (541, "Tensioner, timing belt"), (1260, "Water pump"), (305, "Serpentine belt"), (310, "Idler pulley, serpentine belt"), (316, "Thermostat, coolant"), (1862, "Engine oil")]},
        {"heading": "Brake Service", "links": [(402, "Brake pad set, disc brake"), (82, "Brake disc")]},
        {"heading": "Suspension Service", "links": [(914, "Tie rod end")]},
    ],
}


def _localized_name(cat: PartCategory, locale: str, db: Optional[Session] = None) -> str:
    if locale == "ua":
        if cat.name_ua:
            return cat.name_ua
        if db and cat.name:
            translated = translate(cat.name, "uk")
            if translated:
                cat.name_ua = translated
                db.flush()
                return translated
    if locale == "en":
        if cat.name_en:
            return cat.name_en
        if db and cat.name:
            translated = translate(cat.name, "en")
            if translated:
                cat.name_en = translated
                db.flush()
                return translated
    return cat.name


@router.get("/categories/header", response_model=HeaderResponse)
async def categories_header(
    locale: str = Query("ru", regex="^(ru|ua|en)$"),
    db: Session = Depends(get_db),
):
    """Получить категории и секции ТО для шапки сайта."""
    all_cats = db.query(PartCategory).all()
    by_id = {c.id: c for c in all_cats}

    children_of: Dict[int, List[PartCategory]] = {}
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
                CategoryChild(id=c.id, name=_localized_name(c, locale, db), name_ru=c.name, product_count=get_product_count(c.id))
                for c in sorted(children_of.get(l2_cat.id, []), key=lambda x: x.name)
            ]
            if children:
                groups.append(CategoryGroup(name=_localized_name(l2_cat, locale, db), name_ru=l2_cat.name, children=children))
        if groups:
            categories.append(HeaderCategory(id=l1_cat.id, name=_localized_name(l1_cat, locale, db), name_ru=l1_cat.name, groups=groups))

    to_sections_data = TO_SECTIONS.get(locale, TO_SECTIONS["ru"])
    to_sections = []
    for section in to_sections_data:
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
