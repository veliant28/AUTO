from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text
from app.core.db import get_tecdoc_db
from typing import Optional

router = APIRouter()

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
    """Получить доступные года выпуска ТС."""
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
    """Получить производителей ТС по типу и году."""
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
    """Получить модели ТС по производителю и году."""
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
    """Получить модификации ТС по модели и году."""
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
    """Получить объёмы двигателей для модели."""
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
    """Получить коды двигателей для модели."""
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
