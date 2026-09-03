"""Редактирование сообщений чата поддержки (support.edit, только админ-сообщения)."""
import pytest
from sqlalchemy.orm import Session

from app.models import User
from app.models.support import ChatConversation, ChatMessage, ChatStatus, SenderRole


def _admin(db: Session) -> User:
    return db.query(User).filter(User.email == "admin@example.com").first()


def _make_chat(db: Session, user: User) -> ChatConversation:
    chat = ChatConversation(
        user_id=user.id,
        status=ChatStatus.ACTIVE,
    )
    db.add(chat)
    db.flush()
    return chat


def _make_msg(
    db: Session, chat: ChatConversation, sender: User, role: SenderRole, text: str
) -> ChatMessage:
    msg = ChatMessage(
        conversation_id=chat.id,
        sender_id=sender.id,
        sender_role=role,
        message=text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def _patch(client, headers, message_id: int, text: str):
    return client.patch(
        f"/api/v1/admin/support/messages/{message_id}",
        headers=headers,
        json={"message": text},
    )


def test_requires_support_edit_permission(
    client, test_user, auth_headers, admin_headers, db: Session
):
    """Без права support.edit правка недоступна (403)."""
    chat = _make_chat(db, test_user)
    msg = _make_msg(db, chat, _admin(db), SenderRole.ADMIN, "hello")
    # у обычного (retail) пользователя прав нет вовсе
    assert _patch(client, auth_headers, msg.id, "edited").status_code == 403


def test_edit_works_and_sets_edited_at(
    client, test_user, admin_headers, db: Session
):
    chat = _make_chat(db, test_user)
    msg = _make_msg(db, chat, _admin(db), SenderRole.ADMIN, "Первая версия")

    r = _patch(client, admin_headers, msg.id, "  Вторая версия  ")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["message"] == "Вторая версия"  # обрезано
    assert body["edited_at"] is not None
    assert body["id"] == msg.id

    db.refresh(msg)
    assert msg.message == "Вторая версия"
    assert msg.edited_at is not None

    # повторная правка обновляет edited_at
    r2 = _patch(client, admin_headers, msg.id, "Третья версия")
    assert r2.status_code == 200
    assert r2.json()["message"] == "Третья версия"
    db.refresh(msg)
    assert msg.edited_at is not None


def test_cannot_edit_client_message(
    client, test_user, admin_headers, db: Session
):
    """Сообщения клиента (даже если их писал админ с витрины) не редактируются."""
    chat = _make_chat(db, test_user)
    admin = _admin(db)
    # сообщение «с витрины»: sender_role = user
    msg_user = _make_msg(db, chat, admin, SenderRole.USER, "вопрос с витрины")
    msg_client = _make_msg(db, chat, test_user, SenderRole.USER, "вопрос клиента")

    assert _patch(client, admin_headers, msg_user.id, "хак").status_code == 400
    assert _patch(client, admin_headers, msg_client.id, "хак").status_code == 400

    db.refresh(msg_user)
    assert msg_user.message == "вопрос с витрины"


def test_edit_validation(
    client, test_user, admin_headers, db: Session
):
    chat = _make_chat(db, test_user)
    msg = _make_msg(db, chat, _admin(db), SenderRole.ADMIN, "ok")

    assert _patch(client, admin_headers, 999999, "x").status_code == 404
    assert _patch(client, admin_headers, msg.id, "   ").status_code == 400
    assert _patch(client, admin_headers, msg.id, "x" * 4001).status_code == 400
