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
from app.services.sku_generator import bulk_generate_skus
from app.models.pricing import PriceRule, PricingApplySnapshot
import json
import os
import time


LOG = lambda msg: print(f"[{datetime.utcnow().strftime('%H:%M:%S')}] {msg}")

def set_stage(pi, db, stage: str):
    pi.stage_progress_start = pi.progress
    pi.stage_started_at = datetime.utcnow()
    pi.stage_name = stage
    db.commit()


def set_progress(pi, db, progress: int):
    pi.progress = progress
    db.commit()


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
            LOG("GPL: fetching prices from API...")
            gpl_client = GPLAPIClient(client.config)
            set_stage(pi, db, "Загрузка цен с GPL API")
            items = gpl_client.fetch_all_prices(token)
            LOG(f"GPL: fetched {len(items)} items")
            set_progress(pi, db, 25)

            LOG("GPL: building XLSX...")
            set_stage(pi, db, "Подготовка файла импорта")
            xlsx_data = build_xlsx_from_json(items)
            file_name = f"gpl_{import_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
            file_path = os.path.join(IMPORT_DIR, file_name)
            with open(file_path, "wb") as f:
                f.write(xlsx_data)
            pi.file_path = file_path
            pi.file_size = len(xlsx_data)
            set_progress(pi, db, 30)
            LOG(f"GPL: XLSX saved ({len(xlsx_data)} bytes)")

            LOG("GPL: parsing XLSX and upserting supplier_prices...")
            set_stage(pi, db, "Импорт остатков и цен в БД")
            tecdb = TecDocSessionLocal()
            try:
                count = parse_xlsx_to_prices(db, "GPL", xlsx_data, tecdoc_db=tecdb)
            finally:
                tecdb.close()
            pi.total_items = count
            set_progress(pi, db, 35)
            LOG(f"GPL: parsed {count} prices")

            LOG("GPL: promoting to catalog (creating/updating Parts and SupplierOffers)...")
            set_stage(pi, db, "Обновление каталога")
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
            set_progress(pi, db, 65)
            LOG(f"GPL: promoted {promoted} offers")

            LOG("GPL: generating SKUs...")
            set_stage(pi, db, "Создание товаров в каталоге")
            bulk_generate_skus(db)
            LOG("GPL: SKUs generated")

            LOG("GPL: applying margins...")
            apply_margins_bulk(db)
            _snapshot_margins(db)
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            set_progress(pi, db, 85)
            LOG("GPL: margins applied")

            LOG("GPL: assigning categories...")
            set_stage(pi, db, "Назначение категорий")
            cat_assigned = assign_gpl_categories(db, "GPL")
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            set_progress(pi, db, 90)
            LOG(f"GPL: categories assigned: {cat_assigned}")

            pi.progress = 100
            pi.status = "complete"
            pi.stage_name = ""
            pi.finished_at = datetime.utcnow()
            db.commit()
            LOG("GPL: import complete")

        elif pi.supplier.upper() == "UTR":
            LOG("UTR: requesting export...")
            utr_client = UTRAPIClient(client.config)
            filters = pi.filters or {}

            set_stage(pi, db, "Запрос экспорта с UTR API")
            result = utr_client.request_export(token, filters)
            pi.external_id = result.external_id
            pi.external_token = result.external_token or ""
            set_progress(pi, db, 5)
            LOG(f"UTR: export requested, id={result.external_id}")

            LOG("UTR: waiting for export completion...")
            set_stage(pi, db, "Ожидание готовности экспорта UTR")
            for attempt in range(60):
                status_result = utr_client.check_export_status(token, pi.external_id)
                pi.progress = 5 + min(attempt, 20)
                db.commit()
                if status_result.status == "complete":
                    pi.external_token = status_result.external_token or pi.external_token
                    set_progress(pi, db, 25)
                    LOG("UTR: export ready")
                    break
                time.sleep(5)
            else:
                pi.status = "failed"
                pi.error_message = "Export timed out waiting for completion"
                db.commit()
                return {"error": pi.error_message}

            LOG("UTR: downloading export...")
            set_stage(pi, db, "Загрузка и подготовка XLSX")
            xlsx_data = utr_client.download_export(token, pi.external_token)
            file_name = f"utr_{import_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
            file_path = os.path.join(IMPORT_DIR, file_name)
            with open(file_path, "wb") as f:
                f.write(xlsx_data)
            pi.file_path = file_path
            pi.file_size = len(xlsx_data)
            set_progress(pi, db, 30)
            LOG(f"UTR: downloaded {len(xlsx_data)} bytes")

            LOG("UTR: parsing XLSX and upserting supplier_prices...")
            set_stage(pi, db, "Импорт остатков и цен в БД")
            count = parse_xlsx_to_prices(db, "UTR", xlsx_data)
            pi.total_items = count
            set_progress(pi, db, 35)
            LOG(f"UTR: parsed {count} prices")

            LOG("UTR: promoting to catalog...")
            set_stage(pi, db, "Обновление каталога")
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
            set_progress(pi, db, 65)
            LOG(f"UTR: promoted {promoted} offers")

            LOG("UTR: generating SKUs...")
            set_stage(pi, db, "Создание товаров в каталоге")
            bulk_generate_skus(db)
            LOG("UTR: SKUs generated")

            LOG("UTR: applying margins...")
            apply_margins_bulk(db)
            _snapshot_margins(db)
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            set_progress(pi, db, 85)
            LOG("UTR: margins applied")

            pi.progress = 100
            pi.status = "complete"
            pi.stage_name = ""
            pi.finished_at = datetime.utcnow()
            db.commit()
            LOG("UTR: import complete")

        LOG("process_price_import: success")
        return {"status": pi.status, "items": pi.total_items, "matched": pi.matched_items}

    except Exception as e:
        LOG(f"process_price_import: ERROR — {e}")
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
        LOG("process_price_import: finally — db closed")


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

        LOG(f"promote: promoting {pi.supplier} to catalog...")
        promoted = promote_all_to_catalog(db, pi.supplier, progress_cb=update_progress)
        pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
        pi.matched_items = promoted
        pi.progress = 90
        db.commit()
        LOG(f"promote: promoted {promoted} offers")

        LOG("promote: generating SKUs...")
        bulk_generate_skus(db)
        LOG("promote: SKUs generated")

        LOG("promote: applying margins...")
        apply_margins_bulk(db)
        _snapshot_margins(db)

        cat_assigned = assign_gpl_categories(db, pi.supplier)
        LOG(f"promote: categories assigned: {cat_assigned}")

        pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
        pi.progress = 100
        pi.status = "complete" if pi.total_items > 0 else pi.status
        db.commit()

        return {"promoted": promoted, "categories_assigned": cat_assigned}
    except Exception as e:
        LOG(f"promote: ERROR — {e}")
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
        LOG("promote: finished")


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
                    if last_kyiv.date() == now_tz.date() and last_kyiv >= target:
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
