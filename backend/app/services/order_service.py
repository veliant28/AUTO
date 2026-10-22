"""Сервисные операции с заказом, общие для API и автоматизаций заявок."""
from sqlalchemy.orm import Session

from app.models import Order, OrderChangeLog, OrderItem
from app.models.nova_poshta import (
    OrderNovaPoshtaWaybill,
    OrderNovaPoshtaWaybillEvent,
    OrderNovaPoshtaWaybillSeat,
)


def delete_order_cascade(db: Session, order: Order) -> None:
    """Полное удаление заказа: ТТН, история, позиции, сам заказ.

    Коммит выполняет вызывающая сторона.
    """
    waybill = (
        db.query(OrderNovaPoshtaWaybill)
        .filter(OrderNovaPoshtaWaybill.order_id == order.id)
        .first()
    )
    if waybill:
        db.query(OrderNovaPoshtaWaybillEvent).filter(
            OrderNovaPoshtaWaybillEvent.waybill_id == waybill.id
        ).delete()
        db.query(OrderNovaPoshtaWaybillSeat).filter(
            OrderNovaPoshtaWaybillSeat.waybill_id == waybill.id
        ).delete()
        db.delete(waybill)

    db.query(OrderChangeLog).filter(
        OrderChangeLog.order_id == order.id
    ).delete()
    db.query(OrderItem).filter(OrderItem.order_id == order.id).delete()
    db.delete(order)
