"""Правила редактирования и смены статуса возврата."""
from typing import Any

# Завершённый возврат может менять только администратор
RETURN_LOCKED_STATUSES = {"completed"}


def return_status_value(ret: Any) -> str:
    status = ret.status
    return status.value if hasattr(status, "value") else str(status)


def status_value(status: Any) -> str:
    return status.value if hasattr(status, "value") else str(status)


def is_admin(user: Any) -> bool:
    return bool(user and user.role and user.role.name == "admin")


def can_edit_return(ret: Any, user: Any) -> bool:
    if return_status_value(ret) not in RETURN_LOCKED_STATUSES:
        return True
    return is_admin(user)


def can_change_return_status(
    ret: Any, user: Any, new_status: Any
) -> bool:
    current = return_status_value(ret)
    target = status_value(new_status)
    if current not in RETURN_LOCKED_STATUSES or target == current:
        return True
    return is_admin(user)
