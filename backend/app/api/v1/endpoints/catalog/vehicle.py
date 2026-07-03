from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text
from app.core.db import get_tecdoc_db
from typing import Optional

router = APIRouter()

_VEHICLE_TYPES = {
    'passenger': {'table': 'passanger_cars', 'has_engine': True},
    'commercial': {'table': 'commercial_vehicles', 'has_engine': False},
    'motorbike': {'table': 'motorbikes', 'has_engine': False},
}

_YEAR_FILTER_DOT = """
    CAST(NULLIF(SPLIT_PART(SPLIT_PART(pc.constructioninterval, ' - ', 1), '.', 2), '') AS INTEGER) <= :year
    AND (CAST(NULLIF(SPLIT_PART(SPLIT_PART(pc.constructioninterval, ' - ', 2), '.', 2), '') AS INTEGER) >= :year
         OR SPLIT_PART(pc.constructioninterval, ' - ', 2) = ''
         OR SPLIT_PART(pc.constructioninterval, ' - ', 2) IS NULL)
"""


@router.get("/vehicle/years")
async def vehicle_years(type: str = 'passenger', tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить доступные года выпуска ТС."""
    if type not in _VEHICLE_TYPES:
        return []
    table = _VEHICLE_TYPES[type]['table']
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT y FROM (
            SELECT (regexp_match(constructioninterval, '(\\d{{4}})'))[1]::int as y
            FROM {table} WHERE constructioninterval ~ '\\d{{4}}'
        ) sub WHERE y IS NOT NULL AND y >= 1900 AND y <= 2100 ORDER BY y
    """)).fetchall()
    return [{'year': r[0]} for r in rows]


@router.get("/vehicle/makes")
async def vehicle_makes(type: str = 'passenger', year: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить производителей ТС по типу и году."""
    if type not in _VEHICLE_TYPES:
        return []
    table = _VEHICLE_TYPES[type]['table']
    sql = sa_text(f"""
        SELECT DISTINCT man.id, man.description FROM {table} pc
        JOIN models m ON m.id = pc.modelid
        JOIN manufacturers man ON man.id = m.manufacturerid
        WHERE {_YEAR_FILTER_DOT} ORDER BY man.description
    """)
    rows = tecdoc_db.execute(sql, {'year': year}).fetchall()
    return [{'id': r[0], 'name': r[1]} for r in rows]


@router.get("/vehicle/models")
async def vehicle_models(type: str = 'passenger', year: int = Query(...), make_id: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить модели ТС по производителю и году."""
    if type not in _VEHICLE_TYPES:
        return []
    table = _VEHICLE_TYPES[type]['table']
    sql = sa_text(f"""
        SELECT DISTINCT m.id, m.description FROM {table} pc
        JOIN models m ON m.id = pc.modelid
        JOIN manufacturers man ON man.id = m.manufacturerid
        WHERE man.id = :make_id AND {_YEAR_FILTER_DOT} ORDER BY m.description
    """)
    rows = tecdoc_db.execute(sql, {'make_id': make_id, 'year': year}).fetchall()
    return [{'id': r[0], 'name': r[1] or ''} for r in rows]


@router.get("/vehicle/cars")
async def vehicle_cars(type: str = 'passenger', year: int = Query(...), model_id: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить модификации ТС по модели и году."""
    if type not in _VEHICLE_TYPES:
        return []
    table = _VEHICLE_TYPES[type]['table']
    has_engine = _VEHICLE_TYPES[type]['has_engine']
    if has_engine:
        sql = sa_text(f"""
            SELECT pc.id, pc.description, pc.fulldescription, pc.constructioninterval,
                   (SELECT string_agg(DISTINCT attr.displayvalue, ' / ' ORDER BY attr.displayvalue) FROM passanger_car_attributes attr WHERE attr.passangercarid = pc.id AND attr.attributetype = 'Capacity') as capacity,
                   (SELECT string_agg(DISTINCT attr.displayvalue, ' / ' ORDER BY attr.displayvalue) FROM passanger_car_attributes attr WHERE attr.passangercarid = pc.id AND attr.attributetype = 'EngineCode') as engine_code
            FROM {table} pc
            WHERE pc.modelid = :model_id AND {_YEAR_FILTER_DOT}
            ORDER BY pc.description
        """)
    else:
        sql = sa_text(f"""
            SELECT pc.id, pc.description, pc.fulldescription, pc.constructioninterval,
                   ''::varchar as capacity, ''::varchar as engine_code
            FROM {table} pc
            WHERE pc.modelid = :model_id AND {_YEAR_FILTER_DOT}
            ORDER BY pc.description
        """)
    rows = tecdoc_db.execute(sql, {'model_id': model_id, 'year': year}).fetchall()
    result = []
    for r in rows:
        ci = r[3] or ''
        import re
        years = re.findall(r'(\d{4})', ci)
        year_from = int(years[0]) if len(years) > 0 else None
        year_to = int(years[1]) if len(years) > 1 else None
        result.append({
            'id': r[0], 'name': r[1] or '', 'year_from': year_from, 'year_to': year_to,
            'capacity': r[4] or '', 'engine': r[5] or '',
            'fuel': '', 'power': '', 'constructioninterval': ci,
        })
    return result


@router.get("/vehicle/volumes")
async def vehicle_volumes(year: int = Query(...), car_id: Optional[int] = Query(None), model_id: Optional[int] = Query(None), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить объёмы двигателей для модификации или модели."""
    if car_id:
        where = 'attr.passangercarid = :car_id'
        params = {'car_id': car_id}
    elif model_id:
        where = 'pc.modelid = :model_id'
        params = {'model_id': model_id}
    else:
        return []
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT attr.displayvalue FROM passanger_car_attributes attr
        JOIN passanger_cars pc ON pc.id = attr.passangercarid
        WHERE {where}
        AND attr.attributetype = 'Capacity'
        AND attr.displayvalue IS NOT NULL AND attr.displayvalue != ''
        ORDER BY attr.displayvalue
    """), params).fetchall()
    return [{'volume': r[0]} for r in rows]


@router.get("/vehicle/engines")
async def vehicle_engines(year: int = Query(...), car_id: int = Query(...), volume: str = Query(''), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить коды двигателей для выбранной модификации."""
    vol_cond = ""
    if volume:
        vol_cond = f"AND EXISTS (SELECT 1 FROM passanger_car_attributes a WHERE a.passangercarid = :car_id AND a.attributetype = 'Capacity' AND a.displayvalue = :volume)"
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT attr.displayvalue FROM passanger_car_attributes attr
        WHERE attr.passangercarid = :car_id
        AND attr.attributetype = 'EngineCode'
        {vol_cond}
        AND attr.displayvalue IS NOT NULL AND attr.displayvalue != ''
        ORDER BY attr.displayvalue
    """), {'car_id': car_id, 'volume': volume}).fetchall()
    return [{'engine': r[0]} for r in rows]
