import random
import string
from sqlalchemy.orm import Session
from app.models import SupplierPrice


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
        exists = db.query(SupplierPrice).filter(SupplierPrice.sku == sku).first()
        if not exists:
            return sku
    raise RuntimeError("Could not generate unique SKU after 100 attempts")


def bulk_generate_skus(db: Session, batch_size: int = 100) -> int:
    count = 0
    while True:
        rows = db.query(SupplierPrice).filter(SupplierPrice.sku.is_(None)).limit(batch_size).all()
        if not rows:
            break
        for row in rows:
            row.sku = generate_sku(db)
            count += 1
        db.commit()
    return count
