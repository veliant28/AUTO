"""Celery tasks for downloading product images from external URLs to local storage."""

import os
import logging
import httpx
from sqlalchemy.orm import Session
from app.core.db import SessionLocal
from app.models.parts import Part
from app.workers import celery_app

logger = logging.getLogger(__name__)

MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "media")
PRODUCTS_DIR = os.path.join(MEDIA_DIR, "products")
BACKEND_URL = os.environ.get("AUTO_PARTS_BACKEND_URL", "http://localhost:8080")


def _local_path(part_id: int) -> str:
    """Return local file path for a part image."""
    return os.path.join(PRODUCTS_DIR, f"{part_id}.jpg")


def _local_url(part_id: int) -> str:
    """Return the full public URL for a part image."""
    return f"{BACKEND_URL}/media/products/{part_id}.jpg"


@celery_app.task(bind=True, name="download_product_images")
def download_product_images(self):
    """Download all product images that have an external URL but no local file yet."""
    os.makedirs(PRODUCTS_DIR, exist_ok=True)
    db: Session = SessionLocal()
    try:
        parts = db.query(Part).filter(
            Part.image_url.isnot(None),
            Part.image_url != "",
        ).all()

        total = len(parts)
        downloaded = 0
        skipped = 0
        errors = 0

        for idx, part in enumerate(parts):
            local_file = _local_path(part.id)
            url = part.image_url

            # Already local — skip (not an error)
            if not url or url.startswith('/media/'):
                skipped += 1
                self.update_state(state='PROGRESS', meta={
                    'current': idx + 1, 'total': total,
                    'downloaded': downloaded, 'skipped': skipped, 'errors': errors,
                })
                continue

            if not url.startswith("http"):
                errors += 1
                self.update_state(state='PROGRESS', meta={
                    'current': idx + 1, 'total': total,
                    'downloaded': downloaded, 'skipped': skipped, 'errors': errors,
                })
                continue

            if os.path.exists(local_file):
                # File already exists — just update URL to local path
                part.image_url = _local_url(part.id)
                skipped += 1
                if (idx + 1) % 100 == 0:
                    db.commit()
                self.update_state(state='PROGRESS', meta={
                    'current': idx + 1, 'total': total,
                    'downloaded': downloaded, 'skipped': skipped, 'errors': errors,
                })
                continue

            try:
                resp = httpx.get(url, timeout=30, follow_redirects=True)
                if resp.status_code == 200 and resp.content:
                    with open(local_file, "wb") as f:
                        f.write(resp.content)
                    # Update DB with local URL
                    part.image_url = _local_url(part.id)
                    downloaded += 1
                else:
                    logger.warning("Image download failed for part %s: HTTP %s", part.id, resp.status_code)
                    errors += 1
            except Exception as e:
                logger.error("Image download error for part %s (%s): %s", part.id, url, e)
                errors += 1

            # Batch commit every 100 parts; update progress
            if (idx + 1) % 100 == 0:
                db.commit()
                self.update_state(state='PROGRESS', meta={
                    'current': idx + 1, 'total': total,
                    'downloaded': downloaded, 'skipped': skipped, 'errors': errors,
                })
                logger.info("Image download progress: %s/%s (downloaded=%s skipped=%s errors=%s)",
                          idx + 1, total, downloaded, skipped, errors)

        db.commit()
        logger.info("Image download complete: total=%s downloaded=%s skipped=%s errors=%s",
                   total, downloaded, skipped, errors)
        return {"total": total, "downloaded": downloaded, "skipped": skipped, "errors": errors}

    except Exception as e:
        logger.error("Image download task failed: %s", e)
        raise
    finally:
        db.close()
