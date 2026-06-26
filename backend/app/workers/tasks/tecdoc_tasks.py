from celery import shared_task
from app.workers import celery_app
from app.core.db import SessionLocal, TecDocSessionLocal
from app.models import SupplierPrice, Part
from app.services.tecdoc_gateway import TecDocGateway, TecDocLimitExceeded, TecDocApiError
from app.services.rate_limiter import rate_limiter
from sqlalchemy import func, text as sa_text
from datetime import datetime
import asyncio
import json
import logging


def save_article_info(tecdoc_db, article: str, brand_id: int, data: dict):
    if not data:
        return
    try:
        name = data.get("name") or data.get("description") or ""
        desc = data.get("description") or data.get("info") or ""
        tecdoc_db.execute(
            sa_text("""INSERT INTO autodb_article_infos (article_number, supplier_id, name, description, source_payload, imported_at)
                       VALUES (:art, :bid, :name, :desc, :payload::jsonb, NOW())
                       ON CONFLICT (article_number, supplier_id) DO UPDATE
                       SET name = EXCLUDED.name, description = EXCLUDED.description,
                           source_payload = EXCLUDED.source_payload, imported_at = NOW()"""),
            {"art": str(article), "bid": brand_id, "name": str(name)[:255], "desc": str(desc)[:2048], "payload": json.dumps(data)},
        )
        tecdoc_db.commit()
    except Exception:
        tecdoc_db.rollback()


def save_images(tecdoc_db, article: str, brand_id: int, data: list):
    if not data:
        return
    try:
        for img in data[:10]:
            url = img.get("url") or img.get("image") or ""
            if not url:
                continue
            tecdoc_db.execute(
                sa_text("""INSERT INTO article_images ("DataSupplierArticleNumber", "SupplierId", url, _synced_at)
                           VALUES (:art, :bid, :url, NOW())
                           ON CONFLICT DO NOTHING"""),
                {"art": str(article), "bid": brand_id, "url": str(url)[:1024]},
            )
        tecdoc_db.commit()
    except Exception:
        tecdoc_db.rollback()


def save_oem(tecdoc_db, article: str, brand_id: int, data: list):
    if not data:
        return
    try:
        for oem in data[:50]:
            oem_nbr = oem.get("number") or oem.get("OENbr") or ""
            oem_manufacturer = oem.get("manufacturer") or oem.get("manufacturerId") or 0
            if not oem_nbr:
                continue
            tecdoc_db.execute(
                sa_text("""INSERT INTO article_oe ("OENbr", "SupplierId", "manufacturerId")
                           VALUES (:oem, :bid, :mid)
                           ON CONFLICT DO NOTHING"""),
                {"oem": str(oem_nbr)[:64], "bid": brand_id, "mid": int(oem_manufacturer) if oem_manufacturer else 0},
            )
        tecdoc_db.commit()
    except Exception:
        tecdoc_db.rollback()


def save_crosses(tecdoc_db, article: str, brand_id: int, data: list):
    if not data:
        return
    try:
        for cr in data[:50]:
            cross_art = cr.get("number") or cr.get("PartsDataSupplierArticleNumber") or ""
            cross_brand = cr.get("brand") or cr.get("SupplierId") or brand_id
            if not cross_art:
                continue
            tecdoc_db.execute(
                sa_text("""INSERT INTO article_cross ("PartsDataSupplierArticleNumber", "SupplierId", "manufacturerId")
                           VALUES (:art, :bid, :mid)
                           ON CONFLICT DO NOTHING"""),
                {"art": str(cross_art)[:32], "bid": int(cross_brand) if cross_brand else brand_id, "mid": 0},
            )
        tecdoc_db.commit()
    except Exception:
        tecdoc_db.rollback()


def save_applicability(tecdoc_db, article: str, brand_id: int, data: list):
    if not data:
        return
    try:
        for veh in data[:100]:
            linkage_id = veh.get("id") or veh.get("linkageId") or veh.get("carId") or 0
            linkage_type = veh.get("type") or veh.get("linkageTypeId") or "P"
            if not linkage_id:
                continue
            tecdoc_db.execute(
                sa_text("""INSERT INTO article_li ("DataSupplierArticleNumber", "supplierId", "linkageTypeId", "linkageId", _synced_at)
                           VALUES (:art, :bid, :lt, :lid, NOW())
                           ON CONFLICT DO NOTHING"""),
                {"art": str(article)[:32], "bid": brand_id, "lt": str(linkage_type)[:32], "lid": int(linkage_id)},
            )
        tecdoc_db.commit()
    except Exception:
        tecdoc_db.rollback()


@celery_app.task(bind=True, name="process_tecdoc_batch")
def process_tecdoc_batch(self, article_ids: list[int] = None, batch_size: int = 25):
    db = SessionLocal()
    tecdoc_db = TecDocSessionLocal()
    try:
        if article_ids:
            articles = db.query(SupplierPrice).filter(
                SupplierPrice.id.in_(article_ids)
            ).order_by(SupplierPrice.id).all()
        else:
            articles = db.query(SupplierPrice).filter(
                SupplierPrice.match_status.in_(["pending", "unmatched"])
            ).order_by(func.random()).limit(batch_size).all()

        total = len(articles)
        gateway = TecDocGateway(db)

        for i, sp in enumerate(articles):
            self.update_state(state="PROGRESS", meta={"processed": i, "total": total})

            if rate_limiter.is_exhausted(db):
                raise Exception("Hourly limit reached")

            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

                # Step 1: Search by article
                result = loop.run_until_complete(gateway.search(sp.article))

                if not result or not isinstance(result, list) or len(result) == 0:
                    sp.match_status = "not_found" if sp.attempts >= 2 else "unmatched"
                    loop.close()
                    sp.attempts = (sp.attempts or 0) + 1
                    sp.last_attempt_at = datetime.utcnow()
                    db.commit()
                    continue

                first = result[0]
                found_article = first.get("number") or first.get("article") or sp.article
                found_brand_id = first.get("brand") or first.get("brand_id") or 0

                if not found_brand_id:
                    sp.match_status = "not_found" if sp.attempts >= 2 else "unmatched"
                    loop.close()
                    sp.attempts = (sp.attempts or 0) + 1
                    sp.last_attempt_at = datetime.utcnow()
                    db.commit()
                    continue

                sp.tecdoc_article = str(found_article)
                sp.tecdoc_brand_id = int(found_brand_id)

                enriched = False

                # Step 2: Article info
                try:
                    info = loop.run_until_complete(gateway.get_article_info(str(found_article), int(found_brand_id)))
                    if info:
                        save_article_info(tecdoc_db, str(found_article), int(found_brand_id), info)
                        enriched = True
                except (TecDocLimitExceeded, TecDocApiError):
                    loop.close()
                    raise
                except Exception:
                    pass

                # Step 3: Images
                try:
                    images = loop.run_until_complete(gateway.get_images(str(found_article), int(found_brand_id)))
                    if images:
                        img_list = images if isinstance(images, list) else []
                        save_images(tecdoc_db, str(found_article), int(found_brand_id), img_list)
                        if img_list:
                            enriched = True
                except (TecDocLimitExceeded, TecDocApiError):
                    loop.close()
                    raise
                except Exception:
                    pass

                # Step 4: OEM
                try:
                    oem = loop.run_until_complete(gateway.get_oem(str(found_article), int(found_brand_id)))
                    if oem:
                        oem_list = oem if isinstance(oem, list) else []
                        save_oem(tecdoc_db, str(found_article), int(found_brand_id), oem_list)
                        if oem_list:
                            enriched = True
                except (TecDocLimitExceeded, TecDocApiError):
                    loop.close()
                    raise
                except Exception:
                    pass

                # Step 5: Crosses
                try:
                    crosses = loop.run_until_complete(gateway.get_cross(str(found_article), int(found_brand_id)))
                    if crosses:
                        cross_list = crosses if isinstance(crosses, list) else []
                        save_crosses(tecdoc_db, str(found_article), int(found_brand_id), cross_list)
                        if cross_list:
                            enriched = True
                except (TecDocLimitExceeded, TecDocApiError):
                    loop.close()
                    raise
                except Exception:
                    pass

                # Step 6: Vehicles (applicability)
                try:
                    vehicles = loop.run_until_complete(gateway.get_vehicles(str(found_article), int(found_brand_id)))
                    if vehicles:
                        veh_list = vehicles if isinstance(vehicles, list) else []
                        save_applicability(tecdoc_db, str(found_article), int(found_brand_id), veh_list)
                        if veh_list:
                            enriched = True
                except (TecDocLimitExceeded, TecDocApiError):
                    loop.close()
                    raise
                except Exception:
                    pass

                loop.close()
                sp.match_status = "matched_app" if enriched else "matched"

            except (TecDocLimitExceeded, TecDocApiError):
                break
            except Exception:
                sp.match_status = "not_found" if sp.attempts >= 2 else "unmatched"

            sp.attempts = (sp.attempts or 0) + 1
            sp.last_attempt_at = datetime.utcnow()
            db.commit()

    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()
        tecdoc_db.close()


@celery_app.task(bind=True, name="sync_part_tecdoc_articles")
def sync_part_tecdoc_articles(self):
    """Sync Part.tecdoc_article from matched SupplierPrice records."""
    db = SessionLocal()
    tecdoc_db = TecDocSessionLocal()
    try:
        # Find SupplierPrice with valid tecdoc_article that differs from article
        rows = db.query(SupplierPrice).filter(
            SupplierPrice.supplier == "GPL",
            SupplierPrice.tecdoc_article.isnot(None),
            SupplierPrice.tecdoc_article != "",
            SupplierPrice.match_status == "matched",
        ).all()

        updated = 0
        for sp in rows:
            if sp.tecdoc_article == sp.article:
                continue  # same article, no enrichment needed
            part = db.query(Part).filter(
                Part.article == sp.article,
                Part.brand == sp.brand,
            ).first()
            if not part:
                continue
            if part.tecdoc_article != sp.tecdoc_article:
                part.tecdoc_article = sp.tecdoc_article
                updated += 1

        db.commit()
        logger = logging.getLogger(__name__)
        logger.info("sync_part_tecdoc_articles: %s parts updated", updated)
        return {"updated": updated}
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()
        tecdoc_db.close()
