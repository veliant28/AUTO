"""
Shared utility functions for catalog endpoints.
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import joinedload
from app.models import SupplierOffer, Part


def best_offer(offers: List[SupplierOffer]) -> Optional[Dict[str, Any]]:
    """Pick the best offer: in-stock, freshest first. Use final_price if available."""
    in_stock = [o for o in offers if o.quantity > 0]
    candidates = in_stock or offers
    if not candidates:
        return None
    best = max(candidates, key=lambda o: (o.updated_at or o.id, o.id))
    effective_price = float(best.final_price) if best.final_price is not None else float(best.price)
    return {
        "price": effective_price,
        "original_price": float(best.price),
        "quantity": best.quantity or 0,
        "supplier_name": best.supplier.name if best.supplier else None,
        "supplier_offer_id": best.id,
        "currency": best.currency or "UAH",
    }


def part_to_result(part: Part, db) -> dict:
    """Convert a Part to a result dict with best offer info."""
    offers = db.query(SupplierOffer).options(
        joinedload(SupplierOffer.supplier)
    ).filter(SupplierOffer.part_id == part.id).all()
    best = best_offer(offers)
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
        "quantity": best["quantity"] if best else None,
        "supplier_name": best["supplier_name"] if best else None,
        "supplier_offer_id": best["supplier_offer_id"] if best else None,
        "currency": best["currency"] if best else "UAH",
        "image_url": part.image_url,
    }
