from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ChatMessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    sender_role: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChatConversationOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    user_phone: Optional[str] = None
    user_email: Optional[str] = None
    status: str
    subject: Optional[str] = None
    assigned_to: Optional[int] = None
    assignee_name: Optional[str] = None
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatConversationDetail(BaseModel):
    id: int
    user_id: int
    status: str
    subject: Optional[str] = None
    assigned_to: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    messages: List[ChatMessageOut] = []

    class Config:
        from_attributes = True


class CreateChatRequest(BaseModel):
    subject: str
    message: str


class SendMessageRequest(BaseModel):
    message: str


class UpdateStatusRequest(BaseModel):
    status: str


class AssignRequest(BaseModel):
    assigned_to: Optional[int] = None


class WSMessage(BaseModel):
    type: str  # subscribe, message, typing
    chat_id: Optional[int] = None
    text: Optional[str] = None
    is_typing: Optional[bool] = None
