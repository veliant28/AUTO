import random
import string
from sqlalchemy.orm import Session
from app.models import SupplierPrice
from app.models.parts import Part


def generate_sku(db: Session) -> str:
    brand = "SVOM"
    for _ in range(100):
        parts = []
        parts.append(''.join(random.choices(string.digits, k=random.randint(1, 2))))
        for i, letter in enumerate(brand):
            parts.append(letter)
            if i < len(brand) - 1:
                parts.append(''.join(random.choices(string.digits, k=random.randint(1, 2))))
        parts.append(''.join(random.choices(string.digits, k=random.randint(1, 2))))
        sku = ''.join(parts)
        if len(sku) > 16:
            continue
        # Check both SupplierPrice and Part tables — SKU must be globally unique
        exists_in_sp = db.query(SupplierPrice).filter(SupplierPrice.sku == sku).first()
        exists_in_part = db.query(Part).filter(Part.sku == sku).first()
        if not exists_in_sp and not exists_in_part:
            return sku
    raise RuntimeError("Could not generate unique SKU after 100 attempts")


def sync_skus_to_parts(db: Session, supplier: str | None = None) -> int:
    """Sync existing SupplierPrice SKUs to matching Part records."""
    q = db.query(SupplierPrice).filter(
        SupplierPrice.sku.isnot(None),
    )
    if supplier:
        q = q.filter(SupplierPrice.supplier == supplier)
    rows = q.all()
    count = 0
    for sp in rows:
        part = db.query(Part).filter(
            Part.sku.is_(None),
            Part.article == sp.article,
            Part.brand == (sp.brand or ""),
        ).first()
        if part:
            part.sku = sp.sku
            count += 1
    if count:
        db.commit()
    return count


def bulk_generate_skus(db: Session, batch_size: int = 100) -> int:
    count = 0
    while True:
        rows = db.query(SupplierPrice).filter(SupplierPrice.sku.is_(None)).limit(batch_size).all()
        if not rows:
            break
        for row in rows:
            sku = generate_sku(db)
            row.sku = sku
            # Sync generated SKU to the matching Part record
            part = db.query(Part).filter(
                Part.article == row.article,
                Part.brand == (row.brand or ""),
            ).first()
            if part:
                part.sku = sku
            count += 1
        db.commit()
    return count
