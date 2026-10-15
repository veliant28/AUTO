"""Индекс успешности клиента — единая формула для админки.

Индекс = доля «удержанной» выручки: (доставлено − возвраты) / (доставлено +
отменено), где возвраты считаются по статусам APPROVED и COMPLETED (approved —
деньги возвращены, completed — оформлен до конца); pending/rejected — не
возвраты. Раньше таблица пользователей и модалка заказа считали индекс по
COMPLETED-возвратам, а карточка клиента — по этой формуле: числа расходились,
поэтому формула живёт здесь и используется везде.
"""
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models import Order, OrderStatus
from app.models.returns import ReturnRequest, ReturnStatus


def _index_from_stats(
    delivered_total: float,
    cancelled_total: float,
    delivered_count: int,
    cancelled_count: int,
    refund_rows: Iterable[Tuple[float, float]],
) -> Dict:
    """Формула индекса по суммам заказов и возвратам (total_refund, order_total)."""
    refunded_full = 0.0
    refunded_partial = 0.0
    full_count = 0
    partial_count = 0
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
        "total_orders": int((delivered_count or 0) + (cancelled_count or 0)),
        "delivered_total": delivered_total,
        "delivered_count": int(delivered_count or 0),
        "cancelled_total": cancelled_total,
        "cancelled_count": int(cancelled_count or 0),
        "refunded_full": refunded_full,
        "full_count": full_count,
        "refunded_partial": refunded_partial,
        "partial_count": partial_count,
    }


def _refund_rows_for_user(db: Session, user_id: int) -> List[Tuple[float, float]]:
    return (
        db.query(ReturnRequest.total_refund, Order.total)
        .join(Order, Order.id == ReturnRequest.order_id)
        .filter(
            ReturnRequest.user_id == user_id,
            ReturnRequest.status.in_([ReturnStatus.APPROVED, ReturnStatus.COMPLETED]),
        )
        .all()
    )


def compute_client_index_stats(db: Session, user_id: int) -> Dict:
    """Полная статистика клиента для индекса успешности."""
    delivered_total, cancelled_total, delivered_count, cancelled_count = db.query(
        func.sum(case((Order.status == OrderStatus.DELIVERED, Order.total), else_=0)),
        func.sum(case((Order.status == OrderStatus.CANCELLED, Order.total), else_=0)),
        func.sum(case((Order.status == OrderStatus.DELIVERED, 1), else_=0)),
        func.sum(case((Order.status == OrderStatus.CANCELLED, 1), else_=0)),
    ).filter(Order.user_id == user_id).one()

    return _index_from_stats(
        float(delivered_total or 0),
        float(cancelled_total or 0),
        int(delivered_count or 0),
        int(cancelled_count or 0),
        _refund_rows_for_user(db, user_id),
    )


def compute_client_index_stats_bulk(db: Session, user_ids: List[int]) -> Dict[int, Dict]:
    """То же для списка пользователей (таблица админки) — 2 запроса вместо N+1."""
    if not user_ids:
        return {}

    totals = {
        row.user_id: (float(row.delivered_total or 0), float(row.cancelled_total or 0),
                      int(row.delivered_count or 0), int(row.cancelled_count or 0))
        for row in db.query(
            Order.user_id,
            func.sum(case((Order.status == OrderStatus.DELIVERED, Order.total), else_=0)).label("delivered_total"),
            func.sum(case((Order.status == OrderStatus.CANCELLED, Order.total), else_=0)).label("cancelled_total"),
            func.sum(case((Order.status == OrderStatus.DELIVERED, 1), else_=0)).label("delivered_count"),
            func.sum(case((Order.status == OrderStatus.CANCELLED, 1), else_=0)).label("cancelled_count"),
        )
        .filter(Order.user_id.in_(user_ids))
        .group_by(Order.user_id)
        .all()
    }

    refunds: Dict[int, List[Tuple[float, float]]] = {uid: [] for uid in user_ids}
    for row in (
        db.query(ReturnRequest.user_id, ReturnRequest.total_refund, Order.total)
        .join(Order, Order.id == ReturnRequest.order_id)
        .filter(
            ReturnRequest.user_id.in_(user_ids),
            ReturnRequest.status.in_([ReturnStatus.APPROVED, ReturnStatus.COMPLETED]),
        )
        .all()
    ):
        refunds.setdefault(row.user_id, []).append((row.total_refund, row.total))

    result: Dict[int, Dict] = {}
    for uid in user_ids:
        delivered_total, cancelled_total, delivered_count, cancelled_count = totals.get(uid, (0.0, 0.0, 0, 0))
        result[uid] = _index_from_stats(
            delivered_total, cancelled_total, delivered_count, cancelled_count,
            refunds.get(uid, []),
        )
    return result
