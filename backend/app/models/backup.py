from sqlalchemy import Column, Integer, String, DateTime, BigInteger, Text
from sqlalchemy.sql import func
from .vehicles import Base


class BackupRecord(Base):
    __tablename__ = "backup_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String, nullable=False)
    filepath = Column(Text, nullable=False)
    file_size = Column(BigInteger, nullable=False, default=0)
    status = Column(String, nullable=False, default="in_progress")  # in_progress, completed, failed
    type = Column(String, nullable=False, default="full")  # full, tecdoc
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
