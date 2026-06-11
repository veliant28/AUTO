from celery import shared_task
from datetime import datetime
from zoneinfo import ZoneInfo
from app.workers import celery_app
from app.core.db import SessionLocal, TecDocSessionLocal
from app.models.imports import SupplierConfig, PriceImport, ImportSchedule
from app.models.settings import SiteSettings
from app.services.supplier_api import GPLAPIClient, UTRAPIClient
from app.services.import_processor import (
    build_xlsx_from_json, parse_xlsx_to_prices, promote_all_to_catalog,
    assign_gpl_categories, _ensure_import_dir, IMPORT_DIR
)
from app.services.pricing_service import apply_margins_bulk
from app.models.pricing import PriceRule, PricingApplySnapshot
import json
import os
import time


def _snapshot_margins(db):
    general = db.query(PriceRule).filter(
        PriceRule.type == "general",
        PriceRule.is_active == True
    ).first()
    categories = db.query(PriceRule).filter(
        PriceRule.type == "category",
        PriceRule.is_active == True
    ).all()
    cat_margins = {str(r.category_id): float(r.margin_percent) for r in categories} if categories else {}
    snapshot = PricingApplySnapshot(
        general_margin=float(general.margin_percent) if general else None,
        category_margins=json.dumps(cat_margins) if cat_margins else None,
    )
    db.add(snapshot)
    db.commit()


def _get_client(supplier: str, db) -> tuple:
    config = db.query(SupplierConfig).filter(SupplierConfig.supplier == supplier).first()
    if not config:
        return None, None

    now = datetime.utcnow()
    token = config.token
    token_valid = token and config.token_expires_at and config.token_expires_at > now

    if not token_valid:
        if supplier.upper() == "GPL":
            client = GPLAPIClient(config)
        elif supplier.upper() == "UTR":
            client = UTRAPIClient(config)
        else:
            return None, None

        result = None

        # 1. Пробуем рефреш
        if supplier.upper() == "GPL" and token:
            result = client.refresh(token)
        elif supplier.upper() == "UTR" and config.refresh_token:
            result = client.refresh(config.refresh_token)

        # 2. Рефреш не вышел или не пробовали — полная авторизация
        if not result or not result.success:
            result = client.auth()

        # 3. Всё упало — ошибка
        if not result.success:
            return None, result.message or "Auth failed"

        config.token = result.token
        config.token_expires_at = result.expires_at
        if result.refresh_token:
            config.refresh_token = result.refresh_token
        db.commit()
        token = result.token

    if supplier.upper() == "GPL":
        return GPLAPIClient(config), token
    elif supplier.upper() == "UTR":
        return UTRAPIClient(config), token
    return None, None


@celery_app.task(bind=True, name="process_price_import")
def process_price_import(self, import_id: int):
    db = SessionLocal()
    try:
        pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
        if not pi:
            return {"error": "Import not found"}

        pi.status = "processing"
        pi.progress = 0
        db.commit()

        client, token = _get_client(pi.supplier, db)
        if not client or not token:
            pi.status = "failed"
            pi.error_message = str(token) if token else "No valid token for supplier"
            db.commit()
            return {"error": pi.error_message}

        _ensure_import_dir()

        if pi.supplier.upper() == "GPL":
            gpl_client = GPLAPIClient(client.config)
            items = gpl_client.fetch_all_prices(token)
            pi.progress = 25
            db.commit()

            xlsx_data = build_xlsx_from_json(items)
            file_name = f"gpl_{import_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
            file_path = os.path.join(IMPORT_DIR, file_name)
            with open(file_path, "wb") as f:
                f.write(xlsx_data)
            pi.file_path = file_path
            pi.file_size = len(xlsx_data)
            pi.progress = 30
            db.commit()

            tecdb = TecDocSessionLocal()
            try:
                count = parse_xlsx_to_prices(db, "GPL", xlsx_data, tecdoc_db=tecdb)
            finally:
                tecdb.close()
            pi.progress = 35
            pi.total_items = count
            db.commit()

            # Stage 1: promote to catalog first (creates/updates SupplierOffer rows with raw prices)
            def update_progress_gpl(pct: int):
                try:
                    pi2 = db.query(PriceImport).filter(PriceImport.id == import_id).first()
                    if pi2:
                        pi2.progress = 35 + int(pct * 0.30)
                        db.commit()
                except Exception:
                    db.rollback()

            promoted = promote_all_to_catalog(db, "GPL", progress_cb=update_progress_gpl)
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            pi.matched_items = promoted
            pi.progress = 65
            db.commit()

            # Stage 2: apply margins on ALL SupplierOffer (both existing and newly created)
            apply_margins_bulk(db)
            _snapshot_margins(db)
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            pi.progress = 85
            db.commit()

            # Stage 3: assign GPL categories from category mapping
            cat_assigned = assign_gpl_categories(db, "GPL")
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            pi.progress = 90
            db.commit()

            pi.progress = 100
            pi.status = "complete"
            pi.finished_at = datetime.utcnow()
            db.commit()

        elif pi.supplier.upper() == "UTR":
            utr_client = UTRAPIClient(client.config)
            filters = pi.filters or {}

            result = utr_client.request_export(token, filters)
            pi.external_id = result.external_id
            pi.external_token = result.external_token or ""
            pi.progress = 5
            db.commit()

            for attempt in range(60):
                status_result = utr_client.check_export_status(token, pi.external_id)
                pi.progress = 5 + min(attempt, 20)
                db.commit()
                if status_result.status == "complete":
                    pi.external_token = status_result.external_token or pi.external_token
                    pi.progress = 25
                    db.commit()
                    break
                time.sleep(5)
            else:
                pi.status = "failed"
                pi.error_message = "Export timed out waiting for completion"
                db.commit()
                return {"error": pi.error_message}

            xlsx_data = utr_client.download_export(token, pi.external_token)
            file_name = f"utr_{import_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
            file_path = os.path.join(IMPORT_DIR, file_name)
            with open(file_path, "wb") as f:
                f.write(xlsx_data)
            pi.file_path = file_path
            pi.file_size = len(xlsx_data)
            pi.progress = 30
            db.commit()

            count = parse_xlsx_to_prices(db, "UTR", xlsx_data)
            pi.progress = 35
            pi.total_items = count
            db.commit()

            # Stage 1: promote to catalog first (creates/updates SupplierOffer rows with raw prices)
            def update_progress_utr(pct: int):
                try:
                    pi2 = db.query(PriceImport).filter(PriceImport.id == import_id).first()
                    if pi2:
                        pi2.progress = 35 + int(pct * 0.30)
                        db.commit()
                except Exception:
                    db.rollback()

            promoted = promote_all_to_catalog(db, "UTR", progress_cb=update_progress_utr)
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            pi.matched_items = promoted
            pi.progress = 65
            db.commit()

            # Stage 2: apply margins on ALL SupplierOffer (both existing and newly created)
            apply_margins_bulk(db)
            _snapshot_margins(db)
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            pi.progress = 85
            db.commit()

            pi.progress = 100
            pi.status = "complete"
            pi.finished_at = datetime.utcnow()
            db.commit()

        return {"status": pi.status, "items": pi.total_items, "matched": pi.matched_items}

    except Exception as e:
        db.rollback()
        try:
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            if pi:
                pi.status = "failed"
                pi.error_message = str(e)[:500]
                db.commit()
        except Exception:
            db.rollback()
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task(bind=True, name="promote_import_task")
def promote_import_task(self, import_id: int):
    db = SessionLocal()
    try:
        pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
        if not pi:
            return {"error": "Import not found"}

        pi.progress = 5
        pi.status = "processing"
        db.commit()

        def update_progress(pct: int):
            nonlocal db
            try:
                pi2 = db.query(PriceImport).filter(PriceImport.id == import_id).first()
                if pi2:
                    pi2.progress = pct
                    db.commit()
            except Exception:
                db.rollback()

        promoted = promote_all_to_catalog(db, pi.supplier, progress_cb=update_progress)
        pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
        pi.matched_items = promoted
        pi.progress = 90
        db.commit()

        cat_assigned = assign_gpl_categories(db, pi.supplier)

        pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
        pi.progress = 100
        pi.status = "complete" if pi.total_items > 0 else pi.status
        db.commit()

        return {"promoted": promoted, "categories_assigned": cat_assigned}
    except Exception as e:
        db.rollback()
        try:
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            if pi:
                pi.status = "failed"
                pi.error_message = str(e)[:500]
                db.commit()
        except Exception:
            db.rollback()
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task(bind=True, name="scheduler_tick")
def scheduler_tick(self):
    db = SessionLocal()
    try:
        settings_row = db.query(SiteSettings).first()
        tz_name = settings_row.timezone if settings_row else "Europe/Kiev"
        tz = ZoneInfo(tz_name)

        schedules = db.query(ImportSchedule).filter(ImportSchedule.enabled == True).all()
        now_utc = datetime.utcnow()
        now_tz = now_utc.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)

        for s in schedules:
            try:
                hour, minute = map(int, s.run_at_time.split(":"))
                target = now_tz.replace(hour=hour, minute=minute, second=0, microsecond=0)

                if target > now_tz:
                    continue

                if s.last_run_at:
                    last_kyiv = s.last_run_at.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz)
                    if last_kyiv.date() == now_tz.date():
                        continue

                pimport = PriceImport(supplier=s.supplier, format="xlsx", status="in_queue")
                db.add(pimport)
                db.commit()
                db.refresh(pimport)

                process_price_import.delay(pimport.id)

                s.last_import_id = pimport.id
                s.last_run_at = now_utc
                db.commit()
            except Exception:
                db.rollback()
                continue
    except Exception:
        db.rollback()
    finally:
        db.close()
