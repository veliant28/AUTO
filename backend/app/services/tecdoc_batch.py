from celery.result import AsyncResult
from app.workers.tasks.tecdoc_tasks import process_tecdoc_batch


class BatchManager:
    _current_task_id: str | None = None

    @classmethod
    def start(cls, article_ids: list[int] = None, batch_size: int = 25) -> dict:
        if cls._current_task_id:
            result = AsyncResult(cls._current_task_id)
            if result.state in ("PENDING", "STARTED", "PROGRESS"):
                return {"ok": False, "message": "Batch already running", "task_id": cls._current_task_id}

        task = process_tecdoc_batch.delay(article_ids, batch_size)
        cls._current_task_id = task.id
        return {"ok": True, "task_id": task.id, "size": batch_size}

    @classmethod
    def stop(cls) -> dict:
        if cls._current_task_id:
            AsyncResult(cls._current_task_id).revoke(terminate=True)
            cls._current_task_id = None
            return {"ok": True}
        return {"ok": False, "message": "No batch running"}

    @classmethod
    def status(cls) -> dict:
        if not cls._current_task_id:
            return {"running": False, "task_id": None, "processed": 0, "total": 0, "size": 25}

        result = AsyncResult(cls._current_task_id)
        running = result.state in ("PENDING", "STARTED", "PROGRESS")
        info = result.info or {} if hasattr(result, "info") else {}
        return {
            "running": running,
            "task_id": cls._current_task_id,
            "processed": info.get("processed", 0),
            "total": info.get("total", 0),
            "size": info.get("total", 25),
        }


batch_manager = BatchManager()
