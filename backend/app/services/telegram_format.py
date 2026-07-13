"""Форматирование сообщений для Telegram уведомлений."""

# Внимание: Telegram HTML не поддерживает style, color и т.д.
# Доступны только: <b>, <i>, <u>, <s>, <code>, <pre>, <a>

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
    "shipped": "Отправлен",
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
    """Роль жирным шрифтом."""
    key = (role or "").lower()
    name = ROLE_NAMES.get(key, key or "—")
    return f"<b>{name}</b>"


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


# ── Customer-facing notifications (no role/person info) ──────────────

def customer_new_order(number: str, total: float) -> str:
    """🆕 Заказ оформлен — уведомление клиенту."""
    return (
        f"✅ <b>Заказ {number} оформлен</b>\n"
        f"Сумма: {total} грн\n"
        f"Мы свяжемся с вами для подтверждения."
    )


def customer_new_return(return_number: str, order_number: str) -> str:
    """🔄 Возврат создан — уведомление клиенту."""
    return (
        f"🔄 <b>Возврат {return_number} создан</b>\n"
        f"Заказ: {order_number}\n"
        f"Мы обработаем ваш возврат в ближайшее время."
    )


def customer_order_status_changed(order_number: str, new_status: str) -> str:
    """📦 Статус заказа изменён — уведомление клиенту."""
    return (
        f"📦 <b>Заказ {order_number}</b>\n"
        f"Статус: {_status_html(new_status, ORDER_STATUSES)}"
    )


def customer_return_status_changed(return_number: str, new_status: str) -> str:
    """🔄 Статус возврата изменён — уведомление клиенту."""
    return (
        f"🔄 <b>Возврат {return_number}</b>\n"
        f"Статус: {_status_html(new_status, RETURN_STATUSES)}"
    )
