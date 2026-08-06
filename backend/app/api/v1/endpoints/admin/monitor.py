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
    Order, OrderItem, OrderStatus, ReturnRequest, ReturnItem, ReturnStatus,
    OrderNovaPoshtaWaybill,
)
from app.models.presence import PresenceSession, ProductView, ClientIp
from app.models.loyalty import Promocode
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
    MonitorIndexResponse,
    MonitorIndexSlice,
    MonitorOrderItem,
    MonitorOrderListResponse,
    MonitorReturnItem,
    MonitorReturnListResponse,
    MonitorIpItem,
    MonitorIpListResponse,
    MonitorVisitDay,
    MonitorVisitsResponse,
    MonitorLoyaltyResponse,
    MonitorLoyaltyStatsMonth,
    MonitorLoyaltyStatsResponse,
)
from app.api.v1.endpoints.admin.loyalty import _promocode_to_response

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


def _client_index_stats(db: Session, user_id: int) -> Dict:
    """Полная статистика клиента для индекса успешности.

    success_index = доля «удержанной» выручки: (доставлено − возвраты) / всего.
    Возвраты делятся на полные (total_refund >= суммы заказа) и частичные.
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

    refunded_full = 0.0
    refunded_partial = 0.0
    full_count = 0
    partial_count = 0
    # Возвраты считаем по APPROVED и COMPLETED (approved = деньги возвращены,
    # completed = оформлен до конца); pending/rejected — не возвраты.
    refund_rows = (
        db.query(ReturnRequest.total_refund, Order.total)
        .join(Order, Order.id == ReturnRequest.order_id)
        .filter(
            ReturnRequest.user_id == user_id,
            ReturnRequest.status.in_(
                [ReturnStatus.APPROVED, ReturnStatus.COMPLETED]
            ),
        )
        .all()
    )
    for refund, order_total in refund_rows:
        refund = float(refund or 0)
        order_total = float(order_total or 0)
        if refund >= order_total:
            refunded_full += refund
            full_count += 1
        else:
            refunded_partial += refund
            partial_count += 1

    refunded = refunded_full + refunded_partial
    total_value = delivered_total + cancelled_total
    if total_value == 0:
        success_index = 0
    else:
        retained = max(delivered_total - refunded, 0)
        success_index = round((retained / total_value) * 100)

    return {
        "success_index": success_index,
        "total_orders": total_orders,
        "delivered_total": delivered_total,
        "delivered_count": int(delivered_count or 0),
        "cancelled_total": cancelled_total,
        "cancelled_count": int(cancelled_count or 0),
        "refunded_full": refunded_full,
        "full_count": full_count,
        "refunded_partial": refunded_partial,
        "partial_count": partial_count,
    }


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
        stats = _client_index_stats(db, user.id)
        info["success_index"] = stats["success_index"]
        info["total_orders"] = stats["total_orders"]
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


@router.get("/monitor/clients/{client_key}/index", response_model=MonitorIndexResponse)
async def monitor_client_index(
    client_key: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Статистика индекса успешности клиента (доли доната)."""
    user_id, _session = _parse_client_key(client_key)
    if user_id is None:
        return MonitorIndexResponse(success_index=None, total_orders=None, slices=[])

    stats = _client_index_stats(db, user_id)
    slices = [
        MonitorIndexSlice(key="delivered", value=stats["delivered_total"], count=stats["delivered_count"]),
        MonitorIndexSlice(key="cancelled", value=stats["cancelled_total"], count=stats["cancelled_count"]),
        MonitorIndexSlice(key="returned_full", value=stats["refunded_full"], count=stats["full_count"]),
        MonitorIndexSlice(key="returned_partial", value=stats["refunded_partial"], count=stats["partial_count"]),
    ]
    return MonitorIndexResponse(
        success_index=stats["success_index"],
        total_orders=stats["total_orders"],
        slices=slices,
    )


@router.get("/monitor/clients/{client_key}/orders", response_model=MonitorOrderListResponse)
async def monitor_client_orders(
    client_key: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Заказы клиента (ленивая подгрузка). ТТН — одним запросом, без N+1."""
    user_id, _session = _parse_client_key(client_key)
    if user_id is None:
        return MonitorOrderListResponse(items=[], total=0, page=page, page_size=page_size)

    base = db.query(Order).filter(Order.user_id == user_id)
    total = base.count()
    orders = (
        base.order_by(Order.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    order_ids = [o.id for o in orders]

    item_counts = dict(
        db.query(OrderItem.order_id, func.count(OrderItem.id))
        .filter(OrderItem.order_id.in_(order_ids))
        .group_by(OrderItem.order_id)
        .all()
    )
    # ТТН: активная (is_deleted=False) новейшая, иначе последняя — как waybill_service
    waybills = (
        db.query(OrderNovaPoshtaWaybill)
        .filter(OrderNovaPoshtaWaybill.order_id.in_(order_ids))
        .order_by(OrderNovaPoshtaWaybill.is_deleted.asc(), OrderNovaPoshtaWaybill.id.desc())
        .all()
    )
    ttn_map: Dict[int, dict] = {}
    for wb in waybills:
        if wb.order_id not in ttn_map:
            ttn_map[wb.order_id] = {
                "np_number": wb.np_number,
                "exists": True,
                "is_deleted": wb.is_deleted,
            }

    items = [
        MonitorOrderItem(
            order_number=o.order_number,
            status=o.status.value,
            total=float(o.total or 0),
            items_count=item_counts.get(o.id, 0),
            created_at=o.created_at.isoformat(),
            ttn=ttn_map.get(o.id),
        )
        for o in orders
    ]
    return MonitorOrderListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/monitor/clients/{client_key}/returns", response_model=MonitorReturnListResponse)
async def monitor_client_returns(
    client_key: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Возвраты клиента (ленивая подгрузка)."""
    user_id, _session = _parse_client_key(client_key)
    if user_id is None:
        return MonitorReturnListResponse(items=[], total=0, page=page, page_size=page_size)

    base = db.query(ReturnRequest).filter(ReturnRequest.user_id == user_id)
    total = base.count()
    returns = (
        base.order_by(ReturnRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    ids = [r.id for r in returns]

    item_counts = dict(
        db.query(ReturnItem.return_request_id, func.count(ReturnItem.id))
        .filter(ReturnItem.return_request_id.in_(ids))
        .group_by(ReturnItem.return_request_id)
        .all()
    )
    order_ids = [r.order_id for r in returns if r.order_id]
    order_map: Dict[int, str] = {}
    if order_ids:
        order_map = {
            o.id: o.order_number
            for o in db.query(Order).filter(Order.id.in_(order_ids)).all()
        }

    items = [
        MonitorReturnItem(
            return_number=r.return_number,
            order_number=order_map.get(r.order_id),
            status=r.status.value,
            total_refund=float(r.total_refund or 0),
            items_count=item_counts.get(r.id, 0),
            created_at=r.created_at.isoformat(),
            ttn_number=r.ttn_number,
        )
        for r in returns
    ]
    return MonitorReturnListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/monitor/clients/{client_key}/ips", response_model=MonitorIpListResponse)
async def monitor_client_ips(
    client_key: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Все IP клиента (по частоте). Звёзды топ-5 стабильны при пагинации."""
    user_id, session_id = _parse_client_key(client_key)
    q = db.query(ClientIp)
    if user_id is not None:
        q = q.filter(ClientIp.client_key == f"u{user_id}")
    else:
        q = q.filter(ClientIp.client_key == f"s{session_id}")
    all_rows = q.all()

    # Умная сортировка:
    # 1) топ-5 самых частых (избранные, со звёздами) — всегда в самом верху,
    #    между собой по частоте;
    # 2) остальные — по дате последней сессии (новые сверху); 6-й по частоте
    #    встаёт среди них по своей дате.
    top_ips = {
        r.ip
        for r in sorted(all_rows, key=lambda r: r.visits, reverse=True)[:5]
    }
    favorites = sorted(
        (r for r in all_rows if r.ip in top_ips),
        key=lambda r: r.visits,
        reverse=True,
    )
    rest = sorted(
        (r for r in all_rows if r.ip not in top_ips),
        key=lambda r: r.last_seen,
        reverse=True,
    )
    ordered = favorites + rest

    total = len(ordered)
    start = (page - 1) * page_size
    items = [
        MonitorIpItem(
            ip=r.ip,
            visits=r.visits,
            first_seen=r.first_seen.isoformat(),
            last_seen=r.last_seen.isoformat(),
            is_top=r.ip in top_ips,
        )
        for r in ordered[start:start + page_size]
    ]
    return MonitorIpListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/monitor/clients/{client_key}/visits", response_model=MonitorVisitsResponse)
async def monitor_client_visits(
    client_key: str,
    days: int = Query(7, ge=1, le=31),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Посещения за последние N суток (в tz админки): каждая сессия = заход."""
    user_id, session_id = _parse_client_key(client_key)
    tz = _get_admin_tz(db)
    now = datetime.utcnow()

    q = db.query(PresenceSession.first_seen)
    if user_id is not None:
        q = q.filter(PresenceSession.user_id == user_id)
    else:
        q = q.filter(PresenceSession.session_id == session_id)
    sessions = q.filter(
        PresenceSession.first_seen >= now - timedelta(days=days + 1)
    ).all()

    counts = {}
    for (first_seen,) in sessions:
        local = first_seen.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
        counts[local.strftime("%Y-%m-%d")] = counts.get(local.strftime("%Y-%m-%d"), 0) + 1

    result = []
    for offset in range(days - 1, -1, -1):
        day_start = (now - timedelta(days=offset)).replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
        result.append(MonitorVisitDay(
            date=day_start.strftime("%Y-%m-%d"),
            count=counts.get(day_start.strftime("%Y-%m-%d"), 0),
        ))
    return MonitorVisitsResponse(days=result)


@router.get("/monitor/clients/{client_key}/loyalty", response_model=MonitorLoyaltyResponse)
async def monitor_client_loyalty(
    client_key: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Промокоды клиента с пагинацией (для анонимной сессии — пусто)."""
    user_id, _session_id = _parse_client_key(client_key)
    if user_id is None:
        return MonitorLoyaltyResponse(
            items=[], total=0, page=page, page_size=page_size
        )

    q = (
        db.query(Promocode)
        .options(
            joinedload(Promocode.user),
            joinedload(Promocode.issued_by).joinedload(User.role),
        )
        .filter(Promocode.user_id == user_id)
    )
    total = q.count()
    items = (
        q.order_by(Promocode.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return MonitorLoyaltyResponse(
        items=[_promocode_to_response(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/monitor/clients/{client_key}/loyalty-stats", response_model=MonitorLoyaltyStatsResponse)
async def monitor_client_loyalty_stats(
    client_key: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("monitor.view")),
):
    """Выдача промокодов клиенту по месяцам за 12 месяцев (всегда 12 записей)."""
    user_id, _session_id = _parse_client_key(client_key)

    now = datetime.utcnow()
    buckets = {}
    for i in range(11, -1, -1):
        y, m = now.year, now.month - i
        while m <= 0:
            m += 12
            y -= 1
        buckets[f"{y:04d}-{m:02d}"] = 0

    if user_id is not None:
        year, month = map(int, next(iter(buckets)).split("-"))
        since = datetime(year, month, 1)
        rows = db.query(Promocode.created_at).filter(
            Promocode.user_id == user_id,
            Promocode.created_at >= since,
        ).all()
        for (created_at,) in rows:
            key = f"{created_at.year:04d}-{created_at.month:02d}"
            if key in buckets:
                buckets[key] += 1

    months = [MonitorLoyaltyStatsMonth(month=k, count=v) for k, v in buckets.items()]
    return MonitorLoyaltyStatsResponse(
        months=months,
        total=sum(v for v in buckets.values()),
    )
