"""Правила промокодов: кому принадлежит код и кому его можно применить."""
import re
from typing import Optional

from sqlalchemy.orm import Session

from app.models.loyalty import Promocode
from app.models.users import User


def phone_digits(phone: Optional[str]) -> str:
    return re.sub(r"\D", "", phone or "")


def find_customer_by_phone(db: Session, phone: Optional[str]) -> Optional[User]:
    """Найти зарегистрированного клиента по номеру телефона (сравниваем последние 10 цифр)."""
    digits = phone_digits(phone)
    tail = digits[-10:] if len(digits) >= 10 else digits
    if not tail:
        return None
    candidates = db.query(User).filter(User.phone.ilike(f"%{tail}%")).all()
    for candidate in candidates:
        if phone_digits(candidate.phone)[-10:] == tail:
            return candidate
    return None


def promocode_allowed_for(
    pc: Promocode,
    *,
    client_user_id: Optional[int],
    actor_user_id: Optional[int],
) -> bool:
    """Код выдан конкретному пользователю — применить его можно только этому клиенту
    или сотруднику, который оформляет заказ. Коды без владельца применяются свободно.

    Если клиент не зарегистрирован (client_user_id is None), выданный ему код
    применить нельзя: в системе нет пользователя, которому он принадлежит.
    """
    if pc.user_id is None:
        return True
    if actor_user_id is not None and pc.user_id == actor_user_id:
        return True
    if client_user_id is not None and pc.user_id == client_user_id:
        return True
    return False
