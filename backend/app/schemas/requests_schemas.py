"""Схемы журнала заявок."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field


class RequestCategorySchema(BaseModel):
    id: int
    name: str
    code: str
    allowed_roles: Optional[List[str]] = None
    description: Optional[str] = None
    response_minutes: Optional[int] = None
    resolve_minutes: Optional[int] = None
    is_active: bool = True
    sort_order: int = 100

    class Config:
        from_attributes = True


class RequestActorInfo(BaseModel):
    user_id: int
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class RequestListItem(BaseModel):
    id: int
    number: str
    category_id: int
    category_name: str
    category_code: str
    status: str
    title: str
    created_at: Optional[datetime] = None
    created_by: Optional[RequestActorInfo] = None
    assignee: Optional[RequestActorInfo] = None
    # Актуальный срок (снимок на заявке) и его состояние
    deadline: Optional[datetime] = None
    deadline_state: str = "ok"  # ok | due_soon | overdue
    minutes_left: Optional[int] = None
    minutes_late: Optional[int] = None


class RequestListResponse(BaseModel):
    items: List[RequestListItem]
    total: int
    page: int
    page_size: int
    # Счётчики по статусам (по текущим фильтрам без фильтра статуса)
    counts: Dict[str, int]
    # Доля решённых, % — для полосы выполнения
    progress: int


class RequestCommentSchema(BaseModel):
    id: int
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    author_group: Optional[str] = None
    text: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RequestEventSchema(BaseModel):
    id: int
    event_type: str
    details: Optional[str] = None
    user_id: Optional[int] = None
    author_name: Optional[str] = None
    author_group: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RequestDetailResponse(BaseModel):
    id: int
    number: str
    category: RequestCategorySchema
    status: str
    title: str
    description: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[RequestActorInfo] = None
    assignee: Optional[RequestActorInfo] = None
    resolved_by: Optional[RequestActorInfo] = None
    response_due_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    deadline: Optional[datetime] = None
    deadline_state: str = "ok"
    minutes_left: Optional[int] = None
    minutes_late: Optional[int] = None
    comments: List[RequestCommentSchema] = []
    events: List[RequestEventSchema] = []


class RequestCreateIn(BaseModel):
    category_id: Optional[int] = None
    category_code: Optional[str] = None
    title: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    payload: Optional[Dict[str, Any]] = None
    assignee_id: Optional[int] = None


class RequestCommentIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


class RequestAssignIn(BaseModel):
    assignee_id: Optional[int] = None  # None — снять исполнителя


class RequestStatusIn(BaseModel):
    status: str  # in_progress | resolved | rejected | new


class RequestDecisionIn(BaseModel):
    """Одобрение/отклонение: необязательный комментарий к решению."""

    note: Optional[str] = Field(None, max_length=2000)


class RequestCategoryUpdateIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    response_minutes: Optional[int] = Field(None, ge=0, le=100000)
    resolve_minutes: Optional[int] = Field(None, ge=0, le=100000)
    is_active: Optional[bool] = None
    allowed_roles: Optional[List[str]] = None
    sort_order: Optional[int] = Field(None, ge=0, le=10000)


class RequestAlertItem(BaseModel):
    id: int
    number: str
    title: str
    category_name: str
    status: str
    deadline: Optional[datetime] = None
    minutes_left: Optional[int] = None
    minutes_late: Optional[int] = None


class RequestAlertsResponse(BaseModel):
    due_soon: List[RequestAlertItem] = []
    overdue: List[RequestAlertItem] = []


class B2BApplicationIn(BaseModel):
    """Публичная заявка на регистрацию B2B-клиента с витрины."""

    company: str = Field(..., min_length=2, max_length=200)
    edrpou: Optional[str] = Field(None, max_length=20)
    contact_name: str = Field(..., min_length=2, max_length=150)
    phone: str = Field(..., min_length=10, max_length=30)
    email: EmailStr
    city: Optional[str] = Field(None, max_length=100)
    comment: Optional[str] = Field(None, max_length=2000)
    locale: Optional[str] = Field(None, max_length=5)


class B2BApplicationResponse(BaseModel):
    ok: bool = True
    request_number: str
