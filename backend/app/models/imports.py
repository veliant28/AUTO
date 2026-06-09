from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy.sql import func
from .vehicles import Base


class SupplierConfig(Base):
    __tablename__ = "supplier_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier = Column(String, nullable=False, unique=True)
    login = Column(String, nullable=False, default="")
    password_encrypted = Column(Text, nullable=True)
    api_url = Column(String, nullable=True)
    token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    refresh_token = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class PriceImport(Base):
    __tablename__ = "price_imports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier = Column(String, nullable=False)
    format = Column(String, nullable=False, default="xlsx")
    status = Column(String, nullable=False, default="in_queue")
    progress = Column(Integer, nullable=False, default=0)
    total_items = Column(Integer, nullable=False, default=0)
    matched_items = Column(Integer, nullable=False, default=0)
    file_size = Column(Integer, nullable=True)
    file_path = Column(String, nullable=True)
    filters = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    external_id = Column(String, nullable=True)
    external_token = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime, nullable=True)


class ImportSchedule(Base):
    __tablename__ = "import_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    supplier = Column(String, nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, default=False)
    run_at_time = Column(String, nullable=False, default="04:00")
    last_run_at = Column(DateTime, nullable=True)
    last_import_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
