"""
Shared utility functions for catalog endpoints.
"""
from decimal import Decimal
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session, joinedload
from app.models import SupplierOffer, Part, User
from app.services.pricing_service import calculate_final_price, resolve_b2b_price, resolve_b2b_margin


def best_offer(
    offers: List[SupplierOffer],
    b2b_margin: Optional[Decimal] = None,
) -> Optional[Dict[str, Any]]:
    """Pick the best offer: in-stock, freshest first. Use final_price if available.

    При заданной B2B-наценке (клиент с ролью b2b, см. b2b_margin_for_user)
    цена считается от закупочной: закупка + наценка, но не выше розничной
    (в категориях с низкой розничной наценкой B2B-клиент платит как
    розничный). retail_price всегда — розничная цена (для зачёркивания на
    витрине); original_price — закупка, только для внутренних расчётов
    (в публичные ответы не отдаём).
    """
    in_stock = [o for o in offers if o.quantity > 0]
    candidates = in_stock or offers
    if not candidates:
        return None
    best = max(candidates, key=lambda o: (o.updated_at or o.id, o.id))
    retail = best.final_price if best.final_price is not None else best.price
    retail_price = float(retail)
    is_b2b = bool(b2b_margin and b2b_margin > 0)
    price = (
        float(resolve_b2b_price(best.price, retail, b2b_margin))
        if is_b2b
        else retail_price
    )
    return {
        "price": price,
        "original_price": float(best.price),
        "retail_price": retail_price,
        "is_b2b": is_b2b,
        "quantity": best.quantity or 0,
        "supplier_name": best.supplier.name if best.supplier else None,
        "supplier_offer_id": best.id,
        "currency": best.currency or "UAH",
    }


def b2b_margin_for_user(db: Session, user_id: Optional[int]) -> Optional[Decimal]:
    """B2B-наценка для пользователя: только роль b2b и включённое правило."""
    if not user_id:
        return None
    user = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == user_id)
        .first()
    )
    if not user or not user.role or user.role.name != "b2b":
        return None
    return resolve_b2b_margin(db)


def part_to_result(part: Part, db, b2b_margin: Optional[Decimal] = None) -> dict:
    """Convert a Part to a result dict with best offer info."""
    offers = db.query(SupplierOffer).options(
        joinedload(SupplierOffer.supplier)
    ).filter(SupplierOffer.part_id == part.id).all()
    best = best_offer(offers, b2b_margin=b2b_margin)
    return {
        "id": part.id,
        "article": part.article,
        "name": part.name,
        "brand_id": part.brand_id,
        "tecdoc_id": part.tecdoc_id,
        "category_id": part.category_id,
        "brand": part.brand,
        "sku": part.sku,
        "price": best["price"] if best else None,
        "retail_price": best["retail_price"] if best else None,
        "is_b2b": best["is_b2b"] if best else False,
        "quantity": best["quantity"] if best else None,
        "supplier_name": best["supplier_name"] if best else None,
        "supplier_offer_id": best["supplier_offer_id"] if best else None,
        "currency": best["currency"] if best else "UAH",
        "image_url": part.image_url,
    }
