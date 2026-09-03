from pydantic import BaseModel, Field
from typing import Dict, List, Optional


class AttendanceRecordItem(BaseModel):
    """Сессия фиксации (одна пара вход/выход) с данными пользователя."""
    id: int
    user_id: int
    work_date: str
    clock_in_at: Optional[str] = None
    clock_out_at: Optional[str] = None
    auto_clock_out: bool = False
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str = ""


class AttendanceRecordListResponse(BaseModel):
    items: List[AttendanceRecordItem]
    total: int
    page: int
    page_size: int


class AttendanceTodayItem(BaseModel):
    clock_in_at: Optional[str] = None
    clock_out_at: Optional[str] = None
    auto_clock_out: bool = False


class AttendanceTodayResponse(BaseModel):
    """Сессии текущего пользователя за сегодня + открытая (незакрытая) сессия."""
    sessions: List[AttendanceTodayItem] = []
    open_session: Optional[AttendanceTodayItem] = None


class AttendanceTimesheetUser(BaseModel):
    user_id: int
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str = ""
    # Эффективные минуты дня: ручная правка администрации, если есть, иначе авторасчёт
    days: Dict[str, int] = {}
    # Только дни с ручной правкой (для подсветки на клиенте)
    manual_days: Dict[str, int] = {}
    # Авторасчёт из сессий (до ручных правок) — для предпросмотра сброса правки
    auto_days: Dict[str, int] = {}
    total_minutes: int = 0


class AttendanceTimesheetResponse(BaseModel):
    month: str
    work_start: str
    work_end: str
    days: List[str]
    users: List[AttendanceTimesheetUser]


class TimesheetManualEntryIn(BaseModel):
    """Одна правка табеля: minutes=None означает «вернуть авторасчёт»."""
    user_id: int
    work_date: str  # YYYY-MM-DD
    minutes: Optional[int] = Field(None, ge=0, le=1440)


class TimesheetManualUpdateIn(BaseModel):
    entries: List[TimesheetManualEntryIn] = []


class TimesheetActorInfo(BaseModel):
    user_id: int
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str = ""


class TimesheetManualHistoryItem(BaseModel):
    id: int
    work_date: str
    minutes_before: Optional[int] = None
    minutes_after: Optional[int] = None
    changed_at: str  # naive UTC ISO
    employee: TimesheetActorInfo
    changed_by: TimesheetActorInfo


class TimesheetManualHistoryResponse(BaseModel):
    month: str
    items: List[TimesheetManualHistoryItem] = []
