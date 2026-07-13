from pydantic import BaseModel
from datetime import datetime


class BackupRecordResponse(BaseModel):
    id: int
    filename: str
    file_size: int
    status: str  # in_progress, completed, failed
    type: str  # full, tecdoc
    created_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class BackupConfigResponse(BaseModel):
    run_at_time: str = "02:00"


class BackupConfigUpdate(BaseModel):
    run_at_time: str
