import io
import os
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models.tecdoc import SupplierPrice
from app.models.imports import PriceImport
from app.models.parts import Part
from app.models.suppliers import Supplier, SupplierOffer
from app.core.db import TecDocSessionLocal


IMPORT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "imports")


def _ensure_import_dir():
    os.makedirs(IMPORT_DIR, exist_ok=True)


def build_xlsx_from_json(items: list) -> bytes:
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Prices"
    headers = ["cid", "article", "brand", "category", "name", "price", "currency",
               "stock_total", "stock_regions", "tecdoc_article"]
    if not items:
        ws.append(headers)
    else:
        ws.append(headers)
        for item in items:
            row = [
                item.get("cid", ""),
                item.get("article", ""),
                item.get("brand", ""),
                item.get("category", ""),
                item.get("name", ""),
                item.get("price_type_10", item.get("price_currency_980", "")),
                "UAH",
                _sum_stock(item),
                str(_extract_stock(item)),
                item.get("tecdoc_article", ""),
            ]
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def _sum_stock(item: dict) -> int:
    total = 0
    for key, val in item.items():
        if key.startswith("count_warehouse_"):
            try:
                v = int(float(str(val).replace(">", "").replace("<", "").strip()))
                total += v
            except (ValueError, TypeError):
                pass
    return total


def _extract_stock(item: dict) -> dict:
    regions = {}
    for key, val in item.items():
        if key.startswith("count_warehouse_"):
            try:
                v = int(float(str(val).replace(">", "").replace("<", "").strip()))
            except (ValueError, TypeError):
                v = 0
            warehouse = key.replace("count_warehouse_", "")
            regions[warehouse] = v
    return regions


def _resolve_tecdoc_brand(tecdoc_db, brand_name: str) -> int | None:
    if not brand_name or not tecdoc_db:
        return None
    from sqlalchemy import text
    norm = brand_name.lower().strip()
    row = tecdoc_db.execute(
        text("SELECT id FROM autodb_suppliers WHERE LOWER(normalized_name) = :name OR LOWER(matchcode) = :match LIMIT 1"),
        {"name": norm, "match": norm},
    ).first()
    if row:
        return row[0]
    row = tecdoc_db.execute(
        text("SELECT id FROM autodb_suppliers WHERE LOWER(name) = :name LIMIT 1"),
        {"name": norm},
    ).first()
    return row[0] if row else None


def parse_xlsx_to_prices(db: Session, supplier: str, file_data: bytes, tecdoc_db: Session | None = None) -> int:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(file_data), read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return 0

    headers = [str(h).strip().lower() if h else f"col_{i}" for i, h in enumerate(rows[0])]
    batch = []
    total = 0

    def flush_batch():
        nonlocal batch
        if not batch:
            return
        stmt = pg_insert(SupplierPrice).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=["supplier", "article"],
            set_={
                "brand": stmt.excluded.brand,
                "name": stmt.excluded.name,
                "price": stmt.excluded.price,
                "currency": stmt.excluded.currency,
                "stock_total": stmt.excluded.stock_total,
                "stock_regions": stmt.excluded.stock_regions,
                "tecdoc_article": stmt.excluded.tecdoc_article,
                "tecdoc_brand_id": stmt.excluded.tecdoc_brand_id,
                "match_status": stmt.excluded.match_status,
                "category": stmt.excluded.category,
            },
        )
        db.execute(stmt)
        db.commit()
        batch = []

    for row in rows[1:]:
        if all(v is None for v in row):
            continue
        values = {headers[i]: row[i] if row[i] is not None else "" for i in range(min(len(headers), len(row)))}

        article = str(values.get("article", values.get("articul", values.get("oem", ""))))
        if not article or article.lower() == "article":
            continue

        brand = str(values.get("brand", values.get("producer", values.get("category", ""))))
        name = str(values.get("name", values.get("title", values.get("description", ""))))
        price_str = str(values.get("price", values.get("price_currency_980", values.get("ррц", "0")))).replace(",", ".")
        try:
            price = float(price_str) if price_str else None
        except (ValueError, TypeError):
            price = None

        stock_total = 0
        stock_regions = {}
        for k, v in values.items():
            if any(kw in k for kw in ["count", "stock", "remain", "warehouse", "склад"]):
                try:
                    qty = int(float(str(v).replace(">", "").replace("<", "").strip()))
                    stock_total += qty
                    stock_regions[k] = qty
                except (ValueError, TypeError):
                    pass

        currency = str(values.get("currency", values.get("currency_code", "UAH"))).upper()

        tecdoc_article = str(values.get("tecdoc_article", "")).strip() or None
        tecdoc_brand_id = _resolve_tecdoc_brand(tecdoc_db, brand) if tecdoc_db else None
        match_status = "matched" if tecdoc_brand_id else "pending"

        category = str(values.get("category", "")).strip() or None

        batch.append({
            "supplier": supplier,
            "article": str(article)[:100],
            "brand": str(brand)[:100] if brand else None,
            "name": str(name)[:500] if name else None,
            "price": price,
            "currency": currency,
            "stock_total": stock_total,
            "stock_regions": stock_regions if stock_regions else None,
            "tecdoc_article": tecdoc_article,
            "tecdoc_brand_id": tecdoc_brand_id,
            "match_status": match_status,
            "category": category,
        })
        total += 1

        if len(batch) >= 1000:
            flush_batch()

    flush_batch()
    return total


def promote_all_to_catalog(db: Session, supplier: str, progress_cb=None):
    supplier_obj = db.query(Supplier).filter(Supplier.name == supplier).first()
    if not supplier_obj:
        return 0

    rows = db.query(SupplierPrice).filter(
        SupplierPrice.supplier == supplier,
        SupplierPrice.price.isnot(None),
    ).all()

    if not rows:
        return 0

    total = len(rows)
    part_batch = []
    part_ids = {}

    for sp in rows:
        brand = sp.brand or ""
        key = (sp.article, brand)
        if key not in part_ids:
            part_batch.append({
                "article": sp.article,
                "brand": brand,
                "name": sp.name or sp.article,
                "brand_id": sp.tecdoc_brand_id or 0,
                "sku": sp.sku,
            })
            part_ids[key] = None

    for batch_start in range(0, len(part_batch), 1000):
        chunk = part_batch[batch_start:batch_start + 1000]
        stmt = pg_insert(Part).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=["article", "brand"],
            set_={
                "name": stmt.excluded.name,
                "brand_id": stmt.excluded.brand_id,
                "sku": stmt.excluded.sku,
            },
        )
        db.execute(stmt)
        db.commit()
        if progress_cb:
            progress_cb(10 + int(30 * batch_start / max(len(part_batch), 1)))

    for part in db.query(Part).all():
        key = (part.article, part.brand or "")
        if key in part_ids:
            part_ids[key] = part.id

    offer_batch = []
    for sp in rows:
        key = (sp.article, sp.brand or "")
        part_id = part_ids.get(key)
        if not part_id:
            continue
        offer_batch.append({
            "part_id": part_id,
            "supplier_id": supplier_obj.id,
            "price": sp.price,
            "currency": sp.currency or "UAH",
            "quantity": sp.stock_total,
            "stock_regions": sp.stock_regions,
            "updated_at": datetime.utcnow(),
        })

    matched = 0
    for batch_start in range(0, len(offer_batch), 1000):
        chunk = offer_batch[batch_start:batch_start + 1000]
        stmt = pg_insert(SupplierOffer).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=["part_id", "supplier_id"],
            set_={
                "price": stmt.excluded.price,
                "currency": stmt.excluded.currency,
                "quantity": stmt.excluded.quantity,
                "stock_regions": stmt.excluded.stock_regions,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        db.execute(stmt)
        matched += len(chunk)
        if progress_cb:
            progress_cb(40 + int(60 * batch_start / max(len(offer_batch), 1)))

    db.commit()
    return matched


def assign_gpl_categories(db: Session, supplier: str):
    from app.services.gpl_categories import GPL_CATEGORY_MAP
    from sqlalchemy import text

    if supplier.upper() != "GPL":
        return

    rows = db.query(SupplierPrice).filter(
        SupplierPrice.supplier == supplier,
        SupplierPrice.category.isnot(None),
        SupplierPrice.category != "",
    ).all()

    cat_map = {}
    for sp in rows:
        tecdoc_id = GPL_CATEGORY_MAP.get(sp.category)
        if tecdoc_id is None:
            continue
        cat_map.setdefault(tecdoc_id, []).append((sp.article, sp.brand or ""))

    parts_to_update = []
    for tecdoc_id, article_brands in cat_map.items():
        for article, brand in article_brands:
            parts_to_update.append((article, brand, tecdoc_id))

    if not parts_to_update:
        return 0

    updated = 0
    for article, brand, tecdoc_id in parts_to_update:
        part = db.query(Part).filter(
            Part.article == article,
            Part.brand == brand,
        ).first()
        if part:
            cat_pc = db.execute(
                text("SELECT id FROM part_categories WHERE tecdoc_id = :tid LIMIT 1"),
                {"tid": tecdoc_id},
            ).first()
            if cat_pc and part.category_id != cat_pc[0]:
                part.category_id = cat_pc[0]
                updated += 1

    db.commit()
    return updated
