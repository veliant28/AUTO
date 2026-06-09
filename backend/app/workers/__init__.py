from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "autoparts",
    broker=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    backend=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
)

import app.workers.tasks.tecdoc_tasks  # noqa: F401
import app.workers.tasks.import_tasks  # noqa: F401

celery_app.conf.beat_schedule = {
    'scheduler-tick': {
        'task': 'scheduler_tick',
        'schedule': 60.0,
    },
}

