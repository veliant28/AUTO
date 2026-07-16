from celery import shared_task
from datetime import datetime
from zoneinfo import ZoneInfo
from app.workers import celery_app
from app.core.db import SessionLocal, TecDocSessionLocal
from app.models.imports import SupplierConfig, PriceImport, ImportSchedule
from app.models.settings import SiteSettings
from app.models.backup import BackupRecord
from app.services.supplier_api import GPLAPIClient, UTRAPIClient
from app.services.import_processor import (
    build_xlsx_from_json, parse_xlsx_to_prices, promote_all_to_catalog,
    assign_gpl_categories, _ensure_import_dir, IMPORT_DIR
)
from app.services.pricing_service import apply_margins_bulk
from app.services.sku_generator import bulk_generate_skus, sync_skus_to_parts
from app.services.import_utils import make_progress_cb, safe_fail_import, complete_import, queue_post_import_tasks
from app.models.pricing import PriceRule, PricingApplySnapshot
from sqlalchemy import delete as sa_delete
from app.models.tecdoc import SupplierPrice
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
        LOG(f"{supplier}: supplier config not found")
        return None, None

    now = datetime.utcnow()
    token = config.token
    expires_at = config.token_expires_at
    expires_in_hours = (expires_at - now).total_seconds() / 3600 if expires_at and token else 0

    LOG(f"{supplier}: token expires_at={expires_at}, expires_in={expires_in_hours:.1f}h")

    # Нужно обновить если: истёк ИЛИ expires < 1ч
    needs_refresh = not (token and expires_at and expires_at > now)
    needs_preemptive = token and expires_at and expires_at > now and expires_in_hours < 1

    if needs_refresh:
        LOG(f"{supplier}: token EXPIRED — need full auth")
    elif needs_preemptive:
        LOG(f"{supplier}: token expires in {expires_in_hours:.1f}h (< 1h) — preemptive auth")
    else:
        LOG(f"{supplier}: token valid ({expires_in_hours:.1f}h remaining) — using existing")
        if supplier.upper() == "GPL":
            return GPLAPIClient(config), token
        elif supplier.upper() == "UTR":
            return UTRAPIClient(config), token
        return None, None

    if supplier.upper() == "GPL":
        client = GPLAPIClient(config)
    elif supplier.upper() == "UTR":
        client = UTRAPIClient(config)
    else:
        return None, None

    result = None

    # GPL: только полная авторизация (refresh токена нет)
    if supplier.upper() == "GPL":
        LOG(f"{supplier}: performing full auth...")
        result = client.auth()
    else:
        # UTR: сначала refresh, при неудаче — полная авторизация
        if config.refresh_token:
            LOG(f"{supplier}: trying refresh...")
            result = client.refresh(config.refresh_token)
        if not result or not result.success:
            prev_msg = result.message if result else 'no refresh token'
            LOG(f"{supplier}: refresh failed ({prev_msg}), performing full auth...")
            result = client.auth()

    if not result or not result.success:
        msg = result.message if result else "Auth returned None"
        LOG(f"{supplier}: AUTH FAILED — {msg}")
        return None, msg

    # Сохраняем новый токен
    config.token = result.token
    config.token_expires_at = result.expires_at
    if result.refresh_token:
        config.refresh_token = result.refresh_token
    db.commit()

    new_expires_in = (result.expires_at - datetime.utcnow()).total_seconds() / 3600 if result.expires_at else 0
    LOG(f"{supplier}: auth SUCCESS — new token expires in {new_expires_in:.1f}h (at {result.expires_at})")

    if supplier.upper() == "GPL":
        return GPLAPIClient(config), result.token
    elif supplier.upper() == "UTR":
        return UTRAPIClient(config), result.token
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

            LOG("GPL: cleaning up old supplier prices...")
            db.execute(sa_delete(SupplierPrice).where(SupplierPrice.supplier == "GPL"))
            db.commit()

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

            promoted = promote_all_to_catalog(db, "GPL", progress_cb=make_progress_cb(db, import_id, offset=35, scale=0.30))
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            pi.matched_items = promoted
            set_progress(pi, db, 65)
            LOG(f"GPL: promoted {promoted} offers")

            LOG("GPL: generating SKUs...")
            set_stage(pi, db, "Создание товаров в каталоге")
            bulk_generate_skus(db)
            sync_skus_to_parts(db, supplier="GPL")
            LOG("GPL: SKUs generated")

            LOG("GPL: assigning categories...")
            set_stage(pi, db, "Назначение категорий")
            cat_assigned = assign_gpl_categories(db, "GPL")
            LOG(f"GPL: categories assigned: {cat_assigned}")

            # Import is complete — set status and launch parallel tasks
            complete_import(pi, db)
            LOG("GPL: import complete — launching parallel tasks (margins, photos, matching)")
            try:
                queue_post_import_tasks("GPL")
            except Exception as e:
                LOG(f"GPL: post-import tasks failed (non-critical): {e}")

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

            LOG("UTR: cleaning up old supplier prices...")
            db.execute(sa_delete(SupplierPrice).where(SupplierPrice.supplier == "UTR"))
            db.commit()

            LOG("UTR: parsing XLSX and upserting supplier_prices...")
            set_stage(pi, db, "Импорт остатков и цен в БД")
            count = parse_xlsx_to_prices(db, "UTR", xlsx_data)
            pi.total_items = count
            set_progress(pi, db, 35)
            LOG(f"UTR: parsed {count} prices")

            LOG("UTR: promoting to catalog...")
            set_stage(pi, db, "Обновление каталога")

            promoted = promote_all_to_catalog(db, "UTR", progress_cb=make_progress_cb(db, import_id, offset=35, scale=0.30))
            pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
            pi.matched_items = promoted
            set_progress(pi, db, 65)
            LOG(f"UTR: promoted {promoted} offers")

            LOG("UTR: generating SKUs...")
            set_stage(pi, db, "Создание товаров в каталоге")
            bulk_generate_skus(db)
            sync_skus_to_parts(db, supplier="UTR")
            LOG("UTR: SKUs generated")

            complete_import(pi, db)
            LOG("UTR: import complete — launching parallel tasks (margins, matching)")
            try:
                queue_post_import_tasks("UTR")
            except Exception as e:
                LOG(f"UTR: post-import tasks failed (non-critical): {e}")

        LOG("process_price_import: success")
        return {"status": pi.status, "items": pi.total_items, "matched": pi.matched_items}

    except Exception as e:
        LOG(f"process_price_import: ERROR — {e}")
        db.rollback()
        safe_fail_import(db, import_id, str(e))
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

        LOG(f"promote: promoting {pi.supplier} to catalog...")
        promoted = promote_all_to_catalog(db, pi.supplier, progress_cb=make_progress_cb(db, import_id))
        pi = db.query(PriceImport).filter(PriceImport.id == import_id).first()
        pi.matched_items = promoted
        pi.progress = 90
        db.commit()
        LOG(f"promote: promoted {promoted} offers")

        LOG("promote: generating SKUs...")
        bulk_generate_skus(db)
        sync_skus_to_parts(db, supplier=pi.supplier)
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
        safe_fail_import(db, import_id, str(e))
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

        # Check backup schedule
        try:
            backup_time = settings_row.backup_run_at_time if settings_row else "02:00"
            if backup_time:
                bh, bm = map(int, backup_time.split(":"))
                backup_target = now_tz.replace(hour=bh, minute=bm, second=0, microsecond=0)

                if backup_target <= now_tz:
                    # Check if backup already ran today
                    today_start = now_tz.replace(hour=0, minute=0, second=0, microsecond=0)
                    today_start_utc = today_start.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
                    existing = db.query(BackupRecord).filter(
                        BackupRecord.created_at >= today_start_utc,
                        BackupRecord.type == "full",
                    ).first()
                    if not existing:
                        from app.workers.tasks.backup_tasks import run_database_backup_task
                        logger.info("Scheduler tick: starting scheduled backup")
                        run_database_backup_task.delay()
        except Exception:
            pass
    except Exception:
        db.rollback()
    finally:
        db.close()
