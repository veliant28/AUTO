"""Admin endpoints for the Monitor tab (online clients, chart, archive)."""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, case, func

from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.models import (
    User, Role, SiteSettings, Part, SupplierOffer, Supplier, CartItem,
    Order, OrderStatus, ReturnRequest, ReturnStatus,
)
from app.models.presence import PresenceSession, ProductView
from app.services import presence_service
from app.schemas.monitor_schemas import (
    MonitorClientsResponse,
    MonitorClientItem,
    MonitorKpiResponse,
    MonitorChartResponse,
    MonitorClientDetailResponse,
    MonitorProfile,
    MonitorViewItem,
    MonitorCartResponse,
    MonitorCartItem,
)

logger = logging.getLogger(__name__)

router = APIRouter()

PAGE_SIZE_DEFAULT = 50
PAGE_SIZE_MAX = 100
KPI_CLIENTS_LIMIT = 200


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _get_admin_tz(db: Session) -> ZoneInfo:
    row = db.query(SiteSettings).first()
    tz_name = (row.timezone if row and row.timezone else "Europe/Kiev")
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("Europe/Kiev")


def _day_range_utc(date_str: str, tz: ZoneInfo) -> Tuple[datetime, datetime]:
    """[start, end) дня в tz, переведённые в naive UTC."""
    try:
        y, m, d = (int(x) for x in date_str.split("-"))
        start = datetime(y, m, d, tzinfo=tz)
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid date, expected YYYY-MM-DD")
    end = start + timedelta(days=1)
    return (
        start.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
        end.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
    )


def _display_name(user: User) -> str:
    """ФИО клиента: Фамилия Имя Отчество (как в заказах), затем full_name, затем email."""
    parts = [p for p in (user.last_name, user.first_name, user.middle_name) if p]
    if parts:
        return " ".join(parts)
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    return user.email or ""


def _user_map(db: Session, user_ids: set) -> Dict[int, Dict]:
    """{user_id: {name, email, phone, role, avatar_index}}."""
    if not user_ids:
        return {}
    users = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id.in_(user_ids))
        .all()
    )
    result = {}
    for u in users:
        result[u.id] = {
            "name": _display_name(u),
            "email": u.email,
            "phone": u.phone,
            "role": u.role.name if u.role else None,
            "avatar_index": u.avatar_index,
        }
    return result


def _client_items_from_payloads(payloads: List[dict], user_map: Dict[int, Dict], status: str) -> List[dict]:
    """Payload'ы Redis -> строки таблицы (отсортировано по first_seen desc)."""
    items = []
    for p in payloads:
        user_id = p.get("user_id")
        info = user_map.get(user_id) if user_id else None
        items.append({
            "client_id": p["client_key"],
            "is_anonymous": not info,
            "name": info["name"] if info else None,
            "email": info["email"] if info else None,
            "phone": info["phone"] if info else None,
            "role": info["role"] if info else None,
            "status": status,
            "first_seen": p.get("first_seen"),
            "last_seen": p.get("last_seen"),
            "ip": p.get("ip"),
            "avatar_index": info["avatar_index"] if info else None,
        })
    items.sort(key=lambda x: x["first_seen"] or "", reverse=True)
    return items


def _paginate(items: List[dict], page: int, page_size: int) -> MonitorClientsResponse:
    total = len(items)
    start = (page - 1) * page_size
    return MonitorClientsResponse(
        items=[MonitorClientItem(**i) for i in items[start:start + page_size]],
        total=total,
        page=page,
        page_size=page_size,
    )


def _group_of(user_id: Optional[int], user_map: Dict[int, Dict]) -> str:
    if user_id is None:
        return "anon"
    info = user_map.get(user_id)
    role = info["role"] if info else None
    return role if role in presence_service.REGISTERED_GROUPS else "anon"


def _client_success_stats(db: Session, user_id: int) -> Tuple[int, int]:
    """Индекс успешности клиента + число заказов (как в admin/users.py).

    success_index = доля «удержанной» выручки: (доставлено − возвраты) / всего.
    """
    delivered_total, cancelled_total, delivered_count, cancelled_count = db.query(
        func.sum(case((Order.status == OrderStatus.DELIVERED, Order.total), else_=0)),
        func.sum(case((Order.status == OrderStatus.CANCELLED, Order.total), else_=0)),
        func.sum(case((Order.status == OrderStatus.DELIVERED, 1), else_=0)),
        func.sum(case((Order.status == OrderStatus.CANCELLED, 1), else_=0)),
    ).filter(Order.user_id == user_id).one()
    delivered_total = float(delivered_total or 0)
    cancelled_total = float(cancelled_total or 0)
    total_orders = int((delivered_count or 0) + (cancelled_count or 0))
    refunded = (
        db.query(func.sum(ReturnRequest.total_refund))
        .filter(
            ReturnRequest.user_id == user_id,
            ReturnRequest.status == ReturnStatus.COMPLETED,
        )
        .scalar()
        or 0
    )
    total_value = delivered_total + cancelled_total
    if total_value == 0:
        return 0, total_orders
    retained = max(delivered_total - float(refunded), 0)
    return round((retained / total_value) * 100), total_orders


def _session_client_key(row: PresenceSession) -> Optional[str]:
    return presence_service.client_key(row.user_id, row.session_id)


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@router.get("/monitor/online", response_model=MonitorClientsResponse)
async def monitor_online(
    page: int = Query(1, ge=1),
    page_size: int = Query(PAGE_SIZE_DEFAULT, ge=1, le=PAGE_SIZE_MAX),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Кто онлайн прямо сейчас (из Redis)."""
    payloads = await presence_service.get_online_payloads()
    user_ids = {p["user_id"] for p in payloads if p.get("user_id")}
    user_map = _user_map(db, user_ids)
    return _paginate(_client_items_from_payloads(payloads, user_map, "online"), page, page_size)


@router.get("/monitor/archive", response_model=MonitorClientsResponse)
async def monitor_archive(
    date: str = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(PAGE_SIZE_DEFAULT, ge=1, le=PAGE_SIZE_MAX),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Кто был онлайн в указанный день (архив, tz из настроек)."""
    tz = _get_admin_tz(db)
    start, end = _day_range_utc(date, tz)

    sessions = (
        db.query(PresenceSession)
        .filter(
            PresenceSession.first_seen < end,
            or_(PresenceSession.offline_at.is_(None), PresenceSession.offline_at > start),
        )
        .all()
    )

    # Дедуп по клиенту: first_seen — самое раннее, last_seen — самое позднее
    by_key: Dict[str, dict] = {}
    for s in sessions:
        key = _session_client_key(s)
        if not key:
            continue
        entry = by_key.setdefault(key, {
            "user_id": s.user_id,
            "first_seen": s.first_seen,
            "last_seen": s.last_seen,
            "ip": s.ip,
        })
        if s.first_seen < entry["first_seen"]:
            entry["first_seen"] = s.first_seen
        if s.last_seen and (not entry["last_seen"] or s.last_seen > entry["last_seen"]):
            entry["last_seen"] = s.last_seen
        if s.ip:
            entry["ip"] = s.ip

    user_map = _user_map(db, {e["user_id"] for e in by_key.values() if e["user_id"]})
    online_keys = await presence_service.get_online_keys()

    items = []
    for key, e in by_key.items():
        info = user_map.get(e["user_id"]) if e["user_id"] else None
        items.append({
            "client_id": key,
            "is_anonymous": not info,
            "name": info["name"] if info else None,
            "email": info["email"] if info else None,
            "phone": info["phone"] if info else None,
            "role": info["role"] if info else None,
            "status": "online" if key in online_keys else "offline",
            "first_seen": e["first_seen"].isoformat() if e["first_seen"] else None,
            "last_seen": e["last_seen"].isoformat() if e["last_seen"] else None,
            "ip": e["ip"],
            "avatar_index": info["avatar_index"] if info else None,
        })
    items.sort(key=lambda x: x["first_seen"] or "", reverse=True)
    return _paginate(items, page, page_size)


@router.get("/monitor/kpi", response_model=MonitorKpiResponse)
async def monitor_kpi(
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Счётчики по 6 группам (5 ролей + анонимы). Без date — сейчас, с date — за день."""
    groups: Dict[str, List[dict]] = {g: [] for g in presence_service.GROUPS}

    if date:
        tz = _get_admin_tz(db)
        start, end = _day_range_utc(date, tz)
        sessions = (
            db.query(PresenceSession)
            .filter(
                PresenceSession.first_seen < end,
                or_(PresenceSession.offline_at.is_(None), PresenceSession.offline_at > start),
            )
            .all()
        )
        seen_keys: Dict[str, str] = {}  # client_key -> group
        user_ids = {s.user_id for s in sessions if s.user_id}
        user_map = _user_map(db, user_ids)
        for s in sessions:
            key = _session_client_key(s)
            if not key or key in seen_keys:
                continue
            seen_keys[key] = _group_of(s.user_id, user_map)
        for key, group in seen_keys.items():
            kind, value = presence_service.client_key_parts(key)
            info = None
            if kind == "u":
                try:
                    info = user_map.get(int(value))
                except ValueError:
                    pass
            groups[group].append({
                "name": info["name"] if info else None,
                "avatar_index": info["avatar_index"] if info else None,
                "client_id": key,
            })
    else:
        payloads = await presence_service.get_online_payloads()
        user_ids = {p["user_id"] for p in payloads if p.get("user_id")}
        user_map = _user_map(db, user_ids)
        for p in payloads:
            group = _group_of(p.get("user_id"), user_map)
            user_id = p.get("user_id")
            info = user_map.get(user_id) if user_id else None
            groups[group].append({
                "name": info["name"] if info else None,
                "avatar_index": info["avatar_index"] if info else None,
                "client_id": p["client_key"],
            })

    return MonitorKpiResponse(groups={
        g: {"count": len(clients), "clients": clients[:KPI_CLIENTS_LIMIT]}
        for g, clients in groups.items()
    })


@router.get("/monitor/chart", response_model=MonitorChartResponse)
async def monitor_chart(
    date: str = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Кто был онлайн в каждый час суток (0-23) по 6 группам."""
    tz = _get_admin_tz(db)
    start, end = _day_range_utc(date, tz)
    now = datetime.utcnow()

    sessions = (
        db.query(PresenceSession)
        .filter(
            PresenceSession.first_seen < end,
            or_(PresenceSession.offline_at.is_(None), PresenceSession.offline_at > start),
        )
        .all()
    )
    user_ids = {s.user_id for s in sessions if s.user_id}
    user_map = _user_map(db, user_ids)

    # client_key -> (user_id, name)
    client_names: Dict[str, Tuple[Optional[int], Optional[str]]] = {}
    for s in sessions:
        key = _session_client_key(s)
        if not key:
            continue
        if key not in client_names:
            info = user_map.get(s.user_id) if s.user_id else None
            client_names[key] = (s.user_id, info["name"] if info else None)

    hours = []
    for h in range(24):
        h_start = start + timedelta(hours=h)
        h_end = h_start + timedelta(hours=1)
        per_group: Dict[str, Dict] = {
            g: {"count": 0, "clients": [], "_seen": set()} for g in presence_service.GROUPS
        }
        for s in sessions:
            # Открытая сессия не может покрывать будущие часы
            if s.offline_at is None and h_start >= now:
                continue
            # Пересечение сессии с часом
            if not (s.first_seen < h_end and (s.offline_at is None or s.offline_at > h_start)):
                continue
            key = _session_client_key(s)
            if not key:
                continue
            user_id, name = client_names[key]
            group = _group_of(user_id, user_map)
            slot = per_group[group]
            if key in slot["_seen"]:
                continue
            slot["_seen"].add(key)
            slot["count"] += 1
            if len(slot["clients"]) < presence_service.CHART_NAMES_LIMIT:
                slot["clients"].append(name)
        for g in presence_service.GROUPS:
            per_group[g].pop("_seen", None)
        hours.append({"hour": h, "groups": per_group})

    return MonitorChartResponse(date=date, hours=hours)


def _parse_client_key(client_key: str) -> Tuple[Optional[int], Optional[str]]:
    """'u5' -> (5, None); 'sabc' -> (None, 'abc')."""
    kind, value = presence_service.client_key_parts(client_key)
    if kind == "u":
        try:
            return int(value), None
        except ValueError:
            raise HTTPException(400, "Invalid client id")
    if kind == "s":
        return None, value
    raise HTTPException(400, "Invalid client id")


def _load_profile(db: Session, client_key: str) -> Tuple[Dict, Optional[User]]:
    user_id, session_id = _parse_client_key(client_key)
    user = None
    if user_id is not None:
        user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(404, "Client not found")

    # Последняя сессия для дат захода/ухода и IP
    q = db.query(PresenceSession)
    if user_id is not None:
        q = q.filter(PresenceSession.user_id == user_id)
    else:
        q = q.filter(PresenceSession.session_id == session_id)
    last = q.order_by(PresenceSession.first_seen.desc()).first()

    info = {
        "client_id": client_key,
        "is_anonymous": user is None,
        "name": _display_name(user) if user else None,
        "last_name": user.last_name if user else None,
        "first_name": user.first_name if user else None,
        "middle_name": user.middle_name if user else None,
        "email": user.email if user else None,
        "phone": user.phone if user else None,
        "role": user.role.name if user and user.role else None,
        "avatar_index": user.avatar_index if user else None,
        "status": "offline",
        "first_seen": last.first_seen.isoformat() if last else None,
        "last_seen": (last.last_seen or last.first_seen).isoformat() if last else None,
        "ip": last.ip if last else None,
        "delivery": None,
        "success_index": None,
        "total_orders": None,
    }
    if user:
        info["success_index"], info["total_orders"] = _client_success_stats(
            db, user.id
        )
    if user:
        info["delivery"] = {
            "delivery_type": user.delivery_type,
            "delivery_city_label": user.delivery_city_label or user.delivery_city,
            "delivery_warehouse_label": user.delivery_warehouse_label or user.delivery_warehouse,
            "delivery_street_label": user.delivery_street_label or user.delivery_street,
            "delivery_house": user.delivery_house,
            "delivery_apartment": user.delivery_apartment,
        }
    return info, user


@router.get("/monitor/clients/{client_key}", response_model=MonitorClientDetailResponse)
async def monitor_client(
    client_key: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Профиль клиента + последние 100 просмотренных товаров."""
    profile, user = _load_profile(db, client_key)
    user_id, session_id = _parse_client_key(client_key)
    online_keys = await presence_service.get_online_keys()
    profile["status"] = "online" if client_key in online_keys else "offline"

    q = (
        db.query(ProductView)
        .options(joinedload(ProductView.part), joinedload(ProductView.offer).joinedload(SupplierOffer.supplier))
    )
    if user_id is not None:
        q = q.filter(ProductView.user_id == user_id)
    else:
        q = q.filter(ProductView.session_id == session_id)
    views = q.order_by(ProductView.viewed_at.desc()).limit(100).all()

    view_items = []
    for v in views:
        part = v.part
        offer = v.offer
        price = float(offer.final_price) if offer and offer.final_price is not None else (float(offer.price) if offer else None)
        view_items.append(MonitorViewItem(
            part_id=v.part_id,
            article=part.article if part else None,
            brand=part.brand if part else None,
            part_name=part.name if part else None,
            sku=part.sku if part else None,
            image_url=part.image_url if part else None,
            price=price,
            currency=offer.currency if offer else None,
            supplier_name=offer.supplier.name if offer and offer.supplier else None,
            viewed_at=v.viewed_at.isoformat(),
        ))

    return MonitorClientDetailResponse(client=MonitorProfile(**profile), views=view_items)


@router.get("/monitor/clients/{client_key}/cart", response_model=MonitorCartResponse)
async def monitor_client_cart(
    client_key: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Содержимое корзины клиента (серверная синхронизация /cart/sync)."""
    user_id, session_id = _parse_client_key(client_key)
    q = (
        db.query(CartItem)
        .options(
            joinedload(CartItem.part),
            joinedload(CartItem.offer).joinedload(SupplierOffer.supplier),
        )
    )
    if user_id is not None:
        q = q.filter(CartItem.user_id == user_id)
    else:
        q = q.filter(CartItem.session_id == session_id)
    items = q.order_by(CartItem.created_at.desc()).all()

    result = []
    for it in items:
        part = it.part
        offer = it.offer
        price = float(offer.final_price) if offer and offer.final_price is not None else (float(offer.price) if offer else None)
        result.append(MonitorCartItem(
            part_id=it.part_id,
            article=part.article if part else None,
            brand=part.brand if part else None,
            part_name=part.name if part else None,
            sku=part.sku if part else None,
            image_url=part.image_url if part else None,
            quantity=it.quantity,
            price=price,
            currency=offer.currency if offer else None,
            supplier_name=offer.supplier.name if offer and offer.supplier else None,
        ))
    return MonitorCartResponse(items=result, total=len(result))
