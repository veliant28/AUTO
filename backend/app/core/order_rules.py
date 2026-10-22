"""Общие правила редактирования заказа: статусы и роли."""
from typing import Any

# Статусы, в которых заказ может менять только администратор
EDIT_LOCKED_STATUSES = {"shipped", "delivered", "cancelled"}


def order_status_value(order: Any) -> str:
    status = order.status
    return status.value if hasattr(status, "value") else str(status)


def status_value(status: Any) -> str:
    return status.value if hasattr(status, "value") else str(status)


def is_admin(user: Any) -> bool:
    return bool(user and user.role and user.role.name == "admin")


def can_edit_order(order: Any, user: Any) -> bool:
    """Можно ли пользователю менять заказ в его текущем статусе."""
    if order_status_value(order) not in EDIT_LOCKED_STATUSES:
        return True
    return is_admin(user)


def can_change_order_status(
    order: Any, user: Any, new_status: Any
) -> bool:
    """Из финальных статусов менять статус может только администратор."""
    current = order_status_value(order)
    target = status_value(new_status)
    if current not in EDIT_LOCKED_STATUSES or target == current:
        return True
    return is_admin(user)


def can_delete_order(order: Any, user: Any) -> bool:
    """Финальные заказы удаляет только администратор."""
    if order_status_value(order) not in EDIT_LOCKED_STATUSES:
        return True
    return is_admin(user)
