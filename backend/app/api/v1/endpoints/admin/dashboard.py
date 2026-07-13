from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.schemas.admin_schemas import (
    DashboardResponse, OrdersByDateItem, PartsByCategoryItem,
    WeekdayDistribution, PaymentMethodDistribution,
)
from app.models import User, Order, OrderStatus, Part, PartCategory, OrderItem
from app.models.suppliers import SupplierOffer
from datetime import datetime, timedelta

# PostgreSQL enum cast helper for raw SQL (OrderStatus enum values are UPPERCASE in DB)
_NOT_CANCELLED = "o.status != 'CANCELLED'::orderstatus"
_NOT_CANCELLED_WO = "status != 'CANCELLED'::orderstatus"

router = APIRouter()


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("dashboard.view")),
):
    """Статистика админ-панели: пользователи, заказы, выручка, товары."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Основные KPI ───────────────────────────────────────────────
    total_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0
    total_orders = db.query(func.count(Order.id)).scalar() or 0
    total_revenue = float(
        db.query(func.coalesce(func.sum(Order.total), 0))
        .filter(Order.status != OrderStatus.CANCELLED)
        .scalar()
    )
    total_parts = db.query(func.count(Part.id)).scalar() or 0

    # ── Заказы сегодня ─────────────────────────────────────────────
    orders_today = db.query(func.count(Order.id)).filter(
        Order.created_at >= today_start,
        Order.status != OrderStatus.CANCELLED,
    ).scalar() or 0

	    # ── Новые пользователи сегодня ──────────────────────────────────
    new_users_today = db.query(func.count(User.id)).filter(
        User.created_at >= today_start.strftime('%Y-%m-%d %H:%M:%S'),
        User.is_active == True,
    ).scalar() or 0

    # ── Средний чек ────────────────────────────────────────────────
    total_orders_inc = db.query(func.count(Order.id)).filter(
        Order.status != OrderStatus.CANCELLED
    ).scalar() or 0
    average_check = round(total_revenue / total_orders_inc, 2) if total_orders_inc > 0 else 0

    # ── Наценка (margin) ───────────────────────────────────────────
    # Сумма: (продажная_цена - закупочная_цена) по каждому товару в заказе
    margin_rows = db.execute(text(f"""
        SELECT COALESCE(SUM(oi.price - so.price), 0)
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id AND {_NOT_CANCELLED}
        JOIN LATERAL (
            SELECT so2.price
            FROM supplier_offers so2
            WHERE so2.part_id = oi.part_id
            ORDER BY so2.price ASC
            LIMIT 1
        ) so ON true
    """)).scalar() or 0
    total_margin = float(margin_rows)

    # ── Pending orders / KIP таймер ─────────────────────────────────
    oldest_pending = db.query(func.min(Order.created_at)).filter(
        Order.status == OrderStatus.PENDING
    ).scalar()
    pending_orders_count = db.query(func.count(Order.id)).filter(
        Order.status == OrderStatus.PENDING
    ).scalar() or 0
    oldest_pending_seconds = 0
    if oldest_pending:
        delta = now - oldest_pending
        oldest_pending_seconds = int(delta.total_seconds())

    # ── Заказы по дням (14 дней) ───────────────────────────────────
    fourteen_days_ago = now - timedelta(days=14)
    orders_by_date_rows = (
        db.query(
            func.date(Order.created_at).label("date"),
            func.count(Order.id).label("count"),
            func.coalesce(func.sum(Order.total), 0).label("revenue"),
        )
        .filter(Order.created_at >= fourteen_days_ago)
        .filter(Order.status != OrderStatus.CANCELLED)
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
        .all()
    )

    # Наценка по дням
    margin_by_date_rows = db.execute(text(f"""
        SELECT
            DATE(o.created_at) AS date,
            COALESCE(SUM(oi.price - so.price), 0) AS margin
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id AND {_NOT_CANCELLED}
            AND o.created_at >= :start_date
        JOIN LATERAL (
            SELECT so2.price
            FROM supplier_offers so2
            WHERE so2.part_id = oi.part_id
            ORDER BY so2.price ASC
            LIMIT 1
        ) so ON true
        GROUP BY DATE(o.created_at)
        ORDER BY DATE(o.created_at)
    """), {"start_date": fourteen_days_ago}).fetchall()
    margin_map = {str(row[0]): float(row[1]) for row in margin_by_date_rows}

    orders_by_date = [
        OrdersByDateItem(
            date=str(row.date),
            count=row.count,
            revenue=float(row.revenue),
            margin=margin_map.get(str(row.date), 0),
        )
        for row in orders_by_date_rows
    ]

    # ── Заказы по статусам ─────────────────────────────────────────
    orders_by_status_rows = (
        db.query(Order.status, func.count(Order.id))
        .group_by(Order.status)
        .all()
    )
    orders_by_status = {row[0].value if hasattr(row[0], "value") else row[0]: row[1] for row in orders_by_status_rows}

    # ── Заказы по дням недели (Polar Area) ─────────────────────────
    weekday_names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    weekday_rows = db.execute(text(f"""
        SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*)
        FROM orders
        WHERE {_NOT_CANCELLED_WO}
        GROUP BY EXTRACT(DOW FROM created_at)
        ORDER BY dow
    """)).fetchall()
    weekday_map = {row[0]: row[1] for row in weekday_rows}
    # DOW: 0=воскресенье, 1=понедельник... переводим в Пн=0
    orders_by_weekday = []
    for i in range(7):
        dow = (i + 1) % 7  # 1=Пн, 2=Вт... 0=Вс
        orders_by_weekday.append(WeekdayDistribution(
            weekday=weekday_names[i],
            count=weekday_map.get(dow, 0),
        ))

    # ── Способы оплаты (Pie) ───────────────────────────────────────
    payment_rows = (
        db.query(Order.payment_method, func.count(Order.id))
        .filter(Order.payment_method.isnot(None), Order.status != OrderStatus.CANCELLED)
        .group_by(Order.payment_method)
        .all()
    )
    payment_method_names = {
        "cod": "Наложенный",
        "monobank": "Monobank",
        "novapay": "NovaPay",
        "liqpay": "LiqPay",
    }
    payment_methods = [
        PaymentMethodDistribution(
            method=payment_method_names.get(row[0], row[0]),
            count=row[1],
        )
        for row in payment_rows
    ]

    # ── Товары по категориям ───────────────────────────────────────
    parts_by_category_rows = (
        db.query(PartCategory.name, func.count(Part.id))
        .join(Part, Part.category_id == PartCategory.id, isouter=True)
        .group_by(PartCategory.name)
        .order_by(func.count(Part.id).desc())
        .all()
    )
    parts_by_category = [
        PartsByCategoryItem(category=row[0] or "Без категории", count=row[1])
        for row in parts_by_category_rows
    ]

    return DashboardResponse(
        total_users=total_users,
        total_orders=total_orders,
        total_revenue=total_revenue,
        total_margin=total_margin,
        total_parts=total_parts,
        orders_by_date=orders_by_date,
        orders_by_status=orders_by_status,
        parts_by_category=parts_by_category,
        orders_today=orders_today,
        new_users_today=new_users_today,
        average_check=average_check,
        oldest_pending_seconds=oldest_pending_seconds,
        pending_orders_count=pending_orders_count,
        orders_by_weekday=orders_by_weekday,
        payment_methods=payment_methods,
    )
