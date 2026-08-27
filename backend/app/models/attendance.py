from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .vehicles import Base


class AttendanceSession(Base):
    """Одна сессия фиксации входа/выхода сотрудника.

    В день может быть несколько сессий (например, с перерывом на обед):
    каждая строка — отдельная пара «вход → выход». Часы в табеле —
    сумма пересечений всех сессий дня с рабочим окном из настроек.
    work_date — дата смены в часовом поясе настроек (YYYY-MM-DD),
    clock_in_at/clock_out_at — моменты в naive UTC (как остальной бэкенд).
    """

    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    work_date = Column(String(10), nullable=False, index=True)
    clock_in_at = Column(DateTime, nullable=False)
    clock_out_at = Column(DateTime, nullable=True)
    auto_clock_out = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())

    user = relationship("User")
