from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text
from app.core.db import get_tecdoc_db

router = APIRouter()

VEHICLE_TYPES = {
    'passenger': {'table': 'autodb_passenger_cars', 'has_engine': True},
    'commercial': {'table': 'commercial_vehicles', 'has_engine': False},
    'motorbike': {'table': 'motorbikes', 'has_engine': False},
}

YEAR_FILTER_AUTO = ':year BETWEEN pc.start_year AND pc.end_year'
YEAR_FILTER_BASIC = "CAST(SPLIT_PART(pc.constructioninterval, '-', 1) AS INTEGER) <= :year AND (CAST(SPLIT_PART(pc.constructioninterval, '-', 2) AS INTEGER) >= :year OR SPLIT_PART(pc.constructioninterval, '-', 2) = '' OR SPLIT_PART(pc.constructioninterval, '-', 2) IS NULL)"


def attr_subquery(attr_type: str, alias: str) -> str:
    return f"""(SELECT attr.displayvalue FROM passanger_car_attributes attr
                WHERE attr.passangercarid = pc.id
                AND attr.attributetype = '{attr_type}'
                LIMIT 1) as {alias}"""


def attr_exists(attr_type: str, param: str) -> str:
    return f"""EXISTS (SELECT 1 FROM passanger_car_attributes a
                WHERE a.passangercarid = pc.id
                AND a.attributetype = '{attr_type}'
                AND a.displayvalue = :{param})"""


@router.get('/catalog/types')
async def get_types():
    """Получить типы транспортных средств."""
    return [
        {'id': 'passenger', 'name': 'Легковые'},
        {'id': 'commercial', 'name': 'Коммерческие'},
        {'id': 'motorbike', 'name': 'Мотоциклы'},
    ]


@router.get('/catalog/years')
async def get_years(type: str = 'passenger', tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить доступные года выпуска ТС."""
    if type not in VEHICLE_TYPES:
        return []
    table = VEHICLE_TYPES[type]['table']
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
                SELECT (regexp_match(constructioninterval, '^(\\d+)'))[1]::int as y
                FROM {table} WHERE constructioninterval ~ '^\\d+'
                UNION
                SELECT (regexp_match(constructioninterval, '-(\\d+)$'))[1]::int as y
                FROM {table} WHERE constructioninterval ~ '\\d+$'
            ) sub WHERE y IS NOT NULL ORDER BY y
        """)).fetchall()
    return [{'year': r[0]} for r in rows]


@router.get('/catalog/makes')
async def get_makes(type: str = 'passenger', year: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить производителей ТС по типу и году."""
    if type not in VEHICLE_TYPES:
        return []
    table = VEHICLE_TYPES[type]['table']
    yf = YEAR_FILTER_AUTO if table == 'autodb_passenger_cars' else YEAR_FILTER_BASIC
    sql = sa_text(f"""
        SELECT DISTINCT man.id, man.description FROM {table} pc
        JOIN {"autodb_models" if table == "autodb_passenger_cars" else "models"} m ON m.id = pc.{'model_id' if table == "autodb_passenger_cars" else 'modelid'}
        JOIN {"autodb_manufacturers" if table == "autodb_passenger_cars" else "manufacturers"} man ON man.id = m.{'manufacturer_id' if table == "autodb_passenger_cars" else 'manufacturerid'}
        WHERE {yf} ORDER BY man.description
    """)
    rows = tecdoc_db.execute(sql, {'year': year}).fetchall()
    return [{'id': r[0], 'name': r[1]} for r in rows]


@router.get('/catalog/models')
async def get_models(type: str = 'passenger', year: int = Query(...), make_id: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить модели ТС по производителю и году."""
    if type not in VEHICLE_TYPES:
        return []
    table = VEHICLE_TYPES[type]['table']
    yf = YEAR_FILTER_AUTO if table == 'autodb_passenger_cars' else YEAR_FILTER_BASIC
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


@router.get('/catalog/cars')
async def get_cars(type: str = 'passenger', year: int = Query(...), model_id: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить модификации ТС по модели и году."""
    if type not in VEHICLE_TYPES:
        return []
    table = VEHICLE_TYPES[type]['table']
    has_engine = VEHICLE_TYPES[type]['has_engine']

    if has_engine:
        sql = sa_text(f"""
            SELECT pc.id, pc.description,
                   pc.start_year, pc.end_year,
                   {attr_subquery('Capacity', 'capacity')},
            (SELECT string_agg(DISTINCT attr.displayvalue, ' / ' ORDER BY attr.displayvalue) FROM passanger_car_attributes attr WHERE attr.passangercarid = pc.id AND attr.attributetype = 'EngineCode') as engine_code,
                   {attr_subquery('FuelType', 'fuel')},
                   {attr_subquery('Power', 'power')}
            FROM {table} pc
            WHERE pc.model_id = :model_id AND {YEAR_FILTER_AUTO}
            ORDER BY pc.description
        """)
        rows = tecdoc_db.execute(sql, {'model_id': model_id, 'year': year}).fetchall()
        return [{
            'id': r[0], 'name': r[1] or '', 'year_from': r[2], 'year_to': r[3],
            'capacity': r[4] or '', 'engine': r[5] or '', 'fuel': r[6] or '', 'power': r[7] or '',
        } for r in rows]
    else:
        sql = sa_text(f"""
            SELECT id, description, fulldescription, constructioninterval
            FROM {table}
            WHERE modelid = :model_id AND {YEAR_FILTER_BASIC}
            ORDER BY description
        """)
        rows = tecdoc_db.execute(sql, {'model_id': model_id, 'year': year}).fetchall()
        return [{
            'id': r[0], 'name': r[2] or r[1] or '', 'year_from': None, 'year_to': None,
            'capacity': '', 'engine': '', 'fuel': '', 'power': '', 'constructioninterval': r[3] or '',
        } for r in rows]


@router.get('/catalog/volumes')
async def get_volumes(year: int = Query(...), model_id: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить объёмы двигателей для модели."""
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT attr.displayvalue FROM autodb_passenger_cars pc
        JOIN passanger_car_attributes attr ON attr.passangercarid = pc.id
        WHERE pc.model_id = :model_id AND {YEAR_FILTER_AUTO}
        AND attr.attributetype = 'Capacity'
        AND attr.displayvalue IS NOT NULL AND attr.displayvalue != ''
        ORDER BY attr.displayvalue
    """), {'model_id': model_id, 'year': year}).fetchall()
    return [{'volume': r[0]} for r in rows]


@router.get('/catalog/engines')
async def get_engines(year: int = Query(...), model_id: int = Query(...), volume: str = Query(''), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить коды двигателей для модели."""
    vol_cond = f"AND {attr_exists('Capacity', 'volume')}" if volume else ''
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT attr.displayvalue FROM autodb_passenger_cars pc
        JOIN passanger_car_attributes attr ON attr.passangercarid = pc.id
        WHERE pc.model_id = :model_id AND {YEAR_FILTER_AUTO}
        AND attr.attributetype = 'EngineCode'
        {vol_cond}
        AND attr.displayvalue IS NOT NULL AND attr.displayvalue != ''
        ORDER BY attr.displayvalue
    """), {'model_id': model_id, 'year': year, 'volume': volume}).fetchall()
    return [{'engine': r[0]} for r in rows]


@router.get('/catalog/items')
async def get_catalog_items(
    type: str = 'passenger',
    year: Optional[int] = Query(None),
    make_id: Optional[int] = Query(None),
    model_id: Optional[int] = Query(None),
    car_id: Optional[int] = Query(None),
    volume: str = Query(''),
    engine: str = Query(''),
    search: str = Query(''),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    tecdoc_db: Session = Depends(get_tecdoc_db),
):
    """Поиск ТС по параметрам с пагинацией."""
    if type not in VEHICLE_TYPES:
        return {'items': [], 'total': 0, 'page': page, 'page_size': page_size}

    table = VEHICLE_TYPES[type]['table']
    has_engine = VEHICLE_TYPES[type]['has_engine']

    joins = ''
    if table == 'autodb_passenger_cars':
        select_cols = f"""
            pc.id, man.description as brand, m.description as model,
            pc.description, pc.start_year, pc.end_year,
            {attr_subquery('Capacity', 'capacity')},
            {attr_subquery('EngineCode', 'engine_code')},
            (SELECT string_agg(DISTINCT attr.displayvalue, ' / ' ORDER BY attr.displayvalue) FROM passanger_car_attributes attr WHERE attr.passangercarid = pc.id AND attr.attributetype = 'Power') as power,
            {attr_subquery('FuelType', 'fuel')}
        """
        joins = """
            JOIN autodb_models m ON m.id = pc.model_id
            JOIN autodb_manufacturers man ON man.id = m.manufacturer_id
        """
        model_fk = 'pc.model_id'
    else:
        select_cols = """pc.id, man.description as brand, m.description as model,
                         pc.description, pc.constructioninterval as year_str,
                         ''::varchar as capacity, ''::varchar as engine_code,
                         ''::varchar as power, ''::varchar as fuel"""
        joins = """
            JOIN models m ON m.id = pc.modelid
            JOIN manufacturers man ON man.id = m.manufacturerid
        """
        model_fk = 'pc.modelid'

    where, params = [], {}
    yf = YEAR_FILTER_AUTO if table == 'autodb_passenger_cars' else YEAR_FILTER_BASIC

    if year is not None:
        where.append(yf)
        params['year'] = year
    if make_id is not None:
        where.append('man.id = :make_id')
        params['make_id'] = make_id
    if model_id is not None:
        where.append(f'{model_fk} = :model_id')
        params['model_id'] = model_id
    if car_id is not None:
        where.append('pc.id = :car_id')
        params['car_id'] = car_id
    if volume and has_engine:
        where.append(attr_exists('Capacity', 'volume'))
        params['volume'] = volume
    if engine and has_engine:
        where.append(attr_exists('EngineCode', 'engine'))
        params['engine'] = engine
    if search:
        where.append("(pc.description ILIKE :search OR m.description ILIKE :search OR man.description ILIKE :search)")
        params['search'] = f'%{search}%'

    where_clause = ' WHERE ' + ' AND '.join(where) if where else ''

    count_sql = sa_text(f'SELECT COUNT(*) FROM {table} pc {joins} {where_clause}')
    total = tecdoc_db.execute(count_sql, params).scalar() or 0

    offset = (page - 1) * page_size
    params['limit'] = page_size
    params['offset'] = offset

    data_sql = sa_text(f"""
        SELECT {select_cols} FROM {table} pc {joins} {where_clause}
        ORDER BY man.description, m.description, pc.description
        LIMIT :limit OFFSET :offset
    """)
    rows = tecdoc_db.execute(data_sql, params).fetchall()

    items = []
    for r in rows:
        item = {
            'id': r[0], 'brand': r[1], 'model': r[2], 'modification': r[3] or '',
            'capacity': r[6] or '', 'engine': r[7] or '', 'power': r[8] or '', 'fuel': r[9] or '',
        }
        if engine:
            item['engine'] = engine
        if table == 'autodb_passenger_cars':
            item['year_from'] = r[4]
            item['year_to'] = r[5]
        else:
            item['constructioninterval'] = r[4] or ''
        items.append(item)

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}
