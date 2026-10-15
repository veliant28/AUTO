"""Сбор вариантов доставки клиента из его заказов.

Единый источник логики для админской модалки клиента (режим «Доставка»).
Отдельного хранилища нет: варианты выводятся из заказов при каждом запросе,
поэтому правка правил дедупликации сразу и корректно пересчитывает всю
историю, а заказы остаются единственным источником правды.

Правила уникальности варианта:
- «Самовывоз» — один вариант на клиента, без деталей;
- «Новая Почта, отделение/почтомат» — город + отделение: ref отделения, при
  его отсутствии (легаси-заказы без ref) — название; другой номер отделения
  или почтомата — другой вариант;
- «Новая Почта, курьер» — город + улица + дом: ref улицы с fallback на
  название; регистр и лишние пробелы варианты не различают («2А» == «2а»),
  квартира тоже не различает (показываем последнюю).

Учитываются все заказы, включая отменённые: отменённый заказ на отделение,
которое не работает, — это как раз сигнал для менеджера.

Функции принимают любые объекты с атрибутами заказа (ORM Order или
SimpleNamespace в тестах): delivery_type, delivery_city(_ref/_label),
delivery_warehouse(_ref/_label), delivery_street(_ref/_label),
delivery_house, delivery_apartment, created_at.
"""
from datetime import datetime
from typing import Callable, Dict, List, Optional

# Группы типов доставки. У заказа своя лексика (pickup/warehouse/courier),
# у накладной НП — своя (warehouse/postomat/address), поэтому маппим обе.
PICKUP = "pickup"
WAREHOUSE = "warehouse"
COURIER = "courier"

GROUP_BY_TYPE = {
    "pickup": PICKUP,
    "warehouse": WAREHOUSE,
    "postomat": WAREHOUSE,
    "courier": COURIER,
    "address": COURIER,
}

# Больше 100 вариантов не показываем: свежие использования важнее старых
MAX_VARIANTS = 100


def delivery_group(delivery_type) -> Optional[str]:
    """Группа типа доставки заказа; None — пустой/неизвестный тип."""
    return GROUP_BY_TYPE.get(_norm(delivery_type))


def _norm(value) -> str:
    """Нормализация текста для сравнения: регистр, внешние и лишние пробелы."""
    return " ".join(str(value or "").strip().lower().split())


def _city_key(o) -> str:
    return _norm(o.delivery_city_ref or o.delivery_city_label or o.delivery_city)


def _city_label(o) -> Optional[str]:
    return (o.delivery_city_label or o.delivery_city or "").strip() or None


def _ref_index(
    orders: List,
    group: str,
    get_ref: Callable,
    get_label: Callable,
) -> Dict[tuple, str]:
    """Индекс «город + название» → ref по заказам, где есть и ref, и название.

    Нужен, чтобы легаси-заказы без ref (сохраняли только название отделения
    или улицы) попали в тот же вариант, что и новые заказы с ref.
    """
    index: Dict[tuple, str] = {}
    for o in orders:
        if delivery_group(o.delivery_type) != group:
            continue
        ref = str(get_ref(o) or "").strip()
        label = _norm(get_label(o))
        if ref and label:
            index[(_city_key(o), label)] = ref
    return index


def aggregate_variants(orders) -> List[Dict]:
    """Уникальные варианты доставки клиента, свежие сверху (не история).

    «Самовывоз» не дублируется — вариант просто поднимается вверх по дате
    последнего использования. Заказы без типа доставки (легаси) пропускаем:
    это не вариант, а отсутствие данных.

    Возвращает словари: type, raw_type, city_label, warehouse_label,
    street_label, house, apartment, count, first_used_at, last_used_at.
    """
    orders = [o for o in orders if o.created_at is not None]
    wh_index = _ref_index(
        orders,
        WAREHOUSE,
        lambda o: o.delivery_warehouse_ref,
        lambda o: o.delivery_warehouse_label or o.delivery_warehouse,
    )
    street_index = _ref_index(
        orders,
        COURIER,
        lambda o: o.delivery_street_ref,
        lambda o: o.delivery_street_label,
    )

    variants: Dict[str, Dict] = {}
    for o in orders:
        group = delivery_group(o.delivery_type)
        if group is None and not _norm(o.delivery_type):
            continue  # тип не указан вовсе — варианта нет
        if group == PICKUP:
            key = "pickup"
        elif group == WAREHOUSE:
            city = _city_key(o)
            ref = str(o.delivery_warehouse_ref or "").strip()
            label = _norm(o.delivery_warehouse_label or o.delivery_warehouse)
            if not ref and label:
                ref = wh_index.get((city, label), "")
            key = f"wh|{city}|{'r:' + _norm(ref) if ref else 'l:' + label}"
        elif group == COURIER:
            city = _city_key(o)
            ref = str(o.delivery_street_ref or "").strip()
            label = _norm(o.delivery_street_label)
            if not ref and label:
                ref = street_index.get((city, label), "")
            street = f"r:{_norm(ref)}" if ref else f"l:{label}"
            key = f"cr|{city}|{street}|{_norm(o.delivery_house)}"
        else:
            # Неизвестный тип: в списке с fallback-подписью, из графика выпадет
            key = f"other|{_norm(o.delivery_type)}"

        rec = variants.get(key)
        if rec is None:
            rec = {
                "type": group or "other",
                "raw_type": o.delivery_type if group is None else None,
                "city_label": None,
                "warehouse_label": None,
                "street_label": None,
                "house": None,
                "apartment": None,
                "count": 0,
                "first_used_at": o.created_at,
                "last_used_at": o.created_at,
            }
            variants[key] = rec
        rec["count"] += 1
        if o.created_at < rec["first_used_at"]:
            rec["first_used_at"] = o.created_at
        # Детали варианта — из последнего заказа (адрес/квартира могли меняться)
        if o.created_at >= rec["last_used_at"]:
            rec["last_used_at"] = o.created_at
            rec["city_label"] = _city_label(o)
            rec["warehouse_label"] = (o.delivery_warehouse_label or o.delivery_warehouse or "").strip() or None
            rec["street_label"] = (o.delivery_street_label or "").strip() or None
            rec["house"] = (o.delivery_house or "").strip() or None
            rec["apartment"] = (o.delivery_apartment or "").strip() or None

    return sorted(
        variants.values(), key=lambda v: v["last_used_at"], reverse=True
    )[:MAX_VARIANTS]


def monthly_type_counts(orders, now: Optional[datetime] = None) -> List[Dict]:
    """Счётчики заказов по месяцам за 12 месяцев (всегда 12 записей).

    Месяц заказа — по created_at (UTC, как в остальных админских графиках);
    неизвестные типы доставки в разбивку не входят.
    """
    now = now or datetime.utcnow()
    buckets: Dict[str, Dict[str, int]] = {}
    for i in range(11, -1, -1):
        y, m = now.year, now.month - i
        while m <= 0:
            m += 12
            y -= 1
        buckets[f"{y:04d}-{m:02d}"] = {PICKUP: 0, WAREHOUSE: 0, COURIER: 0}

    for o in orders:
        group = delivery_group(o.delivery_type)
        if group is None or o.created_at is None:
            continue
        key = f"{o.created_at.year:04d}-{o.created_at.month:02d}"
        if key in buckets:
            buckets[key][group] += 1

    return [{"month": k, **counts} for k, counts in buckets.items()]
