from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text
from app.core.db import get_tecdoc_db
from app.api.v1.deps import require_permission

router = APIRouter(dependencies=[Depends(require_permission("catalog.view"))])

VEHICLE_TYPES = {
    'passenger': {'table': 'passanger_cars', 'has_engine': True, 'id_col': 'id', 'model_fk': 'modelid', 'man_fk': 'manufacturerid'},
    'commercial': {'table': 'commercial_vehicles', 'has_engine': False, 'id_col': 'id', 'model_fk': 'modelid', 'man_fk': 'manufacturerid'},
    'motorbike': {'table': 'motorbikes', 'has_engine': False, 'id_col': 'id', 'model_fk': 'modelid', 'man_fk': 'manufacturerid'},
}

YEAR_FILTER = "pc.constructioninterval ~ '\\d{4}' AND (regexp_match(pc.constructioninterval, '(\\d{4})'))[1]::int >= 1900 AND (regexp_match(pc.constructioninterval, '(\\d{4})'))[1]::int <= :year AND (regexp_match(pc.constructioninterval, '(\\d{4})$'))[1]::int >= :year"


def attr_subquery(attr_type: str, alias: str) -> str:
    return f"""(SELECT string_agg(DISTINCT attr.displayvalue, ' / ' ORDER BY attr.displayvalue) FROM passanger_car_attributes attr
                WHERE attr.passangercarid = pc.id
                AND attr.attributetype = '{attr_type}') as {alias}"""


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
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT y FROM (
            SELECT (regexp_match(constructioninterval, '(\\d{{4}})'))[1]::int as y
            FROM {table} WHERE constructioninterval ~ '\\d{{4}}'
            UNION
            SELECT (regexp_match(constructioninterval, '(\\d{{4}})$'))[1]::int as y
            FROM {table} WHERE constructioninterval ~ '\\d{{4}}$'
        ) sub WHERE y >= 1900 ORDER BY y
    """)).fetchall()
    return [{'year': r[0]} for r in rows]


@router.get('/catalog/makes')
async def get_makes(type: str = 'passenger', year: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить производителей ТС по типу и году."""
    if type not in VEHICLE_TYPES:
        return []
    vt = VEHICLE_TYPES[type]
    sql = sa_text(f"""
        SELECT DISTINCT man.id, man.description FROM {vt['table']} pc
        JOIN models m ON m.id = pc.{vt['model_fk']}
        JOIN manufacturers man ON man.id = m.{vt['man_fk']}
        WHERE {YEAR_FILTER} ORDER BY man.description
    """)
    rows = tecdoc_db.execute(sql, {'year': year}).fetchall()
    return [{'id': r[0], 'name': r[1]} for r in rows]


@router.get('/catalog/models')
async def get_models(type: str = 'passenger', year: int = Query(...), make_id: int = Query(...), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить модели ТС по производителю и году."""
    if type not in VEHICLE_TYPES:
        return []
    vt = VEHICLE_TYPES[type]
    sql = sa_text(f"""
        SELECT DISTINCT m.id, m.description FROM {vt['table']} pc
        JOIN models m ON m.id = pc.{vt['model_fk']}
        JOIN manufacturers man ON man.id = m.{vt['man_fk']}
        WHERE man.id = :make_id AND {YEAR_FILTER} ORDER BY m.description
    """)
    rows = tecdoc_db.execute(sql, {'make_id': make_id, 'year': year}).fetchall()
    return [{'id': r[0], 'name': r[1] or ''} for r in rows]


@router.get('/catalog/cars')
async def get_cars(type: str = 'passenger', year: int = Query(...), model_id: int = Query(...), volume: str = Query(''), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить модификации ТС по модели, году и опционально объёму."""
    if type not in VEHICLE_TYPES:
        return []
    vt = VEHICLE_TYPES[type]
    is_passenger = (type == 'passenger')

    vol_cond = "AND EXISTS (SELECT 1 FROM passanger_car_attributes attr WHERE attr.passangercarid = pc.id AND attr.attributetype = 'Capacity' AND attr.displayvalue = :volume)" if volume else ''

    if is_passenger:
        sql = sa_text(f"""
            SELECT pc.id, pc.description, pc.fulldescription, pc.constructioninterval,
                   {attr_subquery('Capacity', 'capacity')},
                   {attr_subquery('EngineCode', 'engine_code')},
                   {attr_subquery('Power', 'power')},
                   {attr_subquery('FuelType', 'fuel')}
            FROM {vt['table']} pc
            WHERE {vt['model_fk']} = :model_id AND {YEAR_FILTER} {vol_cond}
            ORDER BY pc.description
        """)
        params = {'model_id': model_id, 'year': year}
        if volume:
            params['volume'] = volume
    else:
        sql = sa_text(f"""
            SELECT id, description, fulldescription, constructioninterval
            FROM {vt['table']} pc
            WHERE {vt['model_fk']} = :model_id AND {YEAR_FILTER}
            ORDER BY description
        """)
        params = {'model_id': model_id, 'year': year}

    rows = tecdoc_db.execute(sql, params).fetchall()
    if is_passenger:
        return [{
            'id': r[0], 'name': r[2] or r[1] or '', 'year_from': None, 'year_to': None,
            'capacity': r[4] or '', 'engine': r[5] or '', 'power': r[6] or '', 'fuel': r[7] or '',
            'constructioninterval': r[3] or '',
        } for r in rows]
    return [{
        'id': r[0], 'name': r[2] or r[1] or '', 'year_from': None, 'year_to': None,
        'capacity': '', 'engine': '', 'fuel': '', 'power': '', 'constructioninterval': r[3] or '',
    } for r in rows]


@router.get('/catalog/volumes')
async def get_volumes(year: int = Query(...), model_id: int = Query(...), car_id: Optional[int] = Query(None), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить объёмы двигателей для модели."""
    car_cond = 'AND pc.id = :car_id' if car_id else ''
    params = {'model_id': model_id, 'year': year}
    if car_id:
        params['car_id'] = car_id
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT attr.displayvalue FROM passanger_cars pc
        JOIN passanger_car_attributes attr ON attr.passangercarid = pc.id
        WHERE pc.modelid = :model_id {car_cond} AND {YEAR_FILTER}
        AND attr.attributetype = 'Capacity'
        AND attr.displayvalue IS NOT NULL AND attr.displayvalue != ''
        ORDER BY attr.displayvalue
    """), params).fetchall()
    return [{'volume': r[0]} for r in rows]


@router.get('/catalog/engines')
async def get_engines(year: int = Query(...), model_id: int = Query(...), volume: str = Query(''), car_id: Optional[int] = Query(None), tecdoc_db: Session = Depends(get_tecdoc_db)):
    """Получить коды двигателей для модели."""
    car_cond = 'AND pc.id = :car_id' if car_id else ''
    vol_cond = f"AND {attr_exists('Capacity', 'volume')}" if volume else ''
    params = {'model_id': model_id, 'year': year, 'volume': volume}
    if car_id:
        params['car_id'] = car_id
    rows = tecdoc_db.execute(sa_text(f"""
        SELECT DISTINCT attr.displayvalue FROM passanger_cars pc
        JOIN passanger_car_attributes attr ON attr.passangercarid = pc.id
        WHERE pc.modelid = :model_id {car_cond} AND {YEAR_FILTER}
        AND attr.attributetype = 'EngineCode'
        {vol_cond}
        AND attr.displayvalue IS NOT NULL AND attr.displayvalue != ''
        ORDER BY attr.displayvalue
    """), params).fetchall()
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

    vt = VEHICLE_TYPES[type]
    is_passenger = (type == 'passenger')

    if is_passenger:
        select_cols = f"""pc.id, man.description as brand, m.description as model,
                     pc.description, pc.constructioninterval as year_str,
                     {attr_subquery('Capacity', 'capacity')},
                     {attr_subquery('EngineCode', 'engine_code')},
                     {attr_subquery('Power', 'power')},
                     {attr_subquery('FuelType', 'fuel')}"""
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

    if year is not None:
        where.append(YEAR_FILTER)
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
    elif volume:
        where.append(attr_exists('Capacity', 'volume'))
        params['volume'] = volume
    elif engine:
        where.append(attr_exists('EngineCode', 'engine'))
        params['engine'] = engine
    if search:
        where.append("(pc.description ILIKE :search OR m.description ILIKE :search OR man.description ILIKE :search)")
        params['search'] = f'%{search}%'

    where_clause = ' WHERE ' + ' AND '.join(where) if where else ''

    count_sql = sa_text(f'SELECT COUNT(DISTINCT pc.id) FROM {vt["table"]} pc {joins} {where_clause}')
    total = tecdoc_db.execute(count_sql, params).scalar() or 0

    offset = (page - 1) * page_size
    params['limit'] = page_size
    params['offset'] = offset

    data_sql = sa_text(f"""
        SELECT DISTINCT {select_cols}
        FROM {vt["table"]} pc {joins} {where_clause}
        ORDER BY man.description, m.description, pc.description
        LIMIT :limit OFFSET :offset
    """)
    rows = tecdoc_db.execute(data_sql, params).fetchall()

    items = []
    for r in rows:
        items.append({
            'id': r[0], 'brand': r[1], 'model': r[2], 'modification': r[3] or '',
            'constructioninterval': r[4] or '',
            'capacity': r[5] or '', 'engine': r[6] or '', 'power': r[7] or '', 'fuel': r[8] or '',
        })

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}
