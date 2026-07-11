"""Форматирование сообщений для Telegram уведомлений."""

# Цвета ролей — соответствуют badge-цветам в админке
ROLE_COLORS: dict[str, str] = {
    "admin": "#ef4444",      # red-500
    "manager": "#3b82f6",    # blue-500
    "operator": "#f97316",   # orange-500
    "b2b": "#22c55e",        # green-500
    "retail": "#9ca3af",     # gray-400
}

ROLE_NAMES: dict[str, str] = {
    "admin": "Администратор",
    "manager": "Менеджер",
    "operator": "Оператор",
    "b2b": "B2B",
    "retail": "Розничный",
}

ORDER_STATUSES: dict[str, str] = {
    "pending": "Ожидает",
    "confirmed": "Подтвержден",
    "processing": "В обработке",
    "shipped": "Отгружен",
    "delivered": "Доставлен",
    "cancelled": "Отменен",
}

RETURN_STATUSES: dict[str, str] = {
    "pending": "Ожидает",
    "approved": "Одобрен",
    "rejected": "Отклонен",
    "completed": "Завершен",
}


def _role_html(role: str | None) -> str:
    """Роль с цветом."""
    key = (role or "").lower()
    name = ROLE_NAMES.get(key, key or "—")
    color = ROLE_COLORS.get(key, "#9ca3af")
    return f'<span style="color:{color}">{name}</span>'


def _status_html(status: str, status_map: dict[str, str]) -> str:
    """Статус заглавными."""
    label = status_map.get(status.lower(), status)
    return label


def new_order(number: str, total: float, full_name: str, phone: str) -> str:
    """🆕 Новый заказ."""
    return (
        f"🆕 <b>Новый заказ {number}</b>\n"
        f"Сумма: {total} грн\n"
        f"Клиент: {full_name}, {phone}"
    )


def new_return(return_number: str, order_number: str) -> str:
    """🔄 Новый возврат."""
    return (
        f"🔄 <b>Новый возврат {return_number}</b>\n"
        f"Заказ: {order_number}"
    )


def order_status_changed(
    order_number: str,
    old_status: str,
    new_status: str,
    role: str | None,
    last_name: str | None,
    first_name: str | None,
) -> str:
    """📦 Смена статуса заказа."""
    changer = f"{last_name or ''} {first_name or ''}".strip()
    return (
        f"📦 <b>Заказ {order_number}</b>\n"
        f"Статус: {_status_html(old_status, ORDER_STATUSES)} → {_status_html(new_status, ORDER_STATUSES)}\n"
        f"{_role_html(role)} {changer}"
    )


def return_status_changed(
    return_number: str,
    old_status: str,
    new_status: str,
    role: str | None,
    last_name: str | None,
    first_name: str | None,
) -> str:
    """🔄 Смена статуса возврата."""
    changer = f"{last_name or ''} {first_name or ''}".strip()
    return (
        f"🔄 <b>Возврат {return_number}</b>\n"
        f"Статус: {_status_html(old_status, RETURN_STATUSES)} → {_status_html(new_status, RETURN_STATUSES)}\n"
        f"{_role_html(role)} {changer}"
    )
