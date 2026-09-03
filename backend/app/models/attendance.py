from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
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


class TimesheetOverride(Base):
    """Ручная правка часов в табеле (ставит администратор).

    Значение дня в табеле = override, если строка есть, иначе авторасчёт
    из сессий фиксации. Сессии/авто-фиксация никогда не пишут сюда, поэтому
    ручные часы не затираются фиксацией. one row per (user_id, work_date).
    """

    __tablename__ = "timesheet_overrides"
    __table_args__ = (
        UniqueConstraint("user_id", "work_date", name="uq_timesheet_override_user_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    work_date = Column(String(10), nullable=False, index=True)
    minutes = Column(Integer, nullable=False)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())


class TimesheetOverrideLog(Base):
    """История ручных правок табеля: кто (админ), когда, что было → стало.

    minutes_before == NULL — до правки день считался автоматически;
    minutes_after == NULL — правка сброшена, день снова на авторасчёте.
    changed_at — naive UTC (как остальной бэкенд).
    """

    __tablename__ = "timesheet_override_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    work_date = Column(String(10), nullable=False, index=True)
    minutes_before = Column(Integer, nullable=True)
    minutes_after = Column(Integer, nullable=True)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    changed_at = Column(DateTime, nullable=False, default=func.now())
