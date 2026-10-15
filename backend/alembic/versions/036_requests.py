"""requests journal: categories, requests, comments, events + settings + permissions

Revision ID: 036
Revises: 035
Create Date: 2026-10-15
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '036'
down_revision: Union[str, Sequence[str], None] = '035'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Готовые категории заявок: (id, code, name, allowed_roles, response_min, resolve_min, sort)
# allowed_roles = None — категорию могут создать все сотрудники с requests.create
CATEGORIES = [
    (1, 'b2b_registration', 'Регистрация B2B-клиента', None, 120, 1440, 10),
    (2, 'timesheet_manual', 'Правка часов в табеле', None, 120, 1440, 20),
    (3, 'ban_unban', 'Бан / разбан клиента', ['admin', 'manager'], 60, 480, 30),
    (4, 'order_final_status', 'Изменение заказа в финальном статусе', None, 60, 240, 40),
    (5, 'order_delete', 'Удаление заказа', None, 60, 240, 50),
    (6, 'return_change', 'Изменение или удаление возврата', None, 60, 480, 60),
    (7, 'pricing_change', 'Изменение цен и наценок', None, 240, 1440, 70),
    (8, 'support_edit', 'Редактирование сообщения в поддержке', None, 30, 120, 80),
    (9, 'imports_suppliers', 'Поставщики и импорт', None, 240, 1440, 90),
    (10, 'protection_change', 'Изменение защиты (белый список)', None, 60, 480, 100),
    (11, 'other', 'Прочее', None, 240, 1440, 999),
]

# Права журнала: codename -> (описание, роли)
PERMISSIONS = [
    ('requests.view', 'Просмотр журнала заявок', ['admin', 'manager', 'operator']),
    ('requests.create', 'Создание заявок', ['admin', 'manager', 'operator']),
    ('requests.comment', 'Комментарии к заявкам', ['admin', 'manager', 'operator']),
    ('requests.process', 'Обработка заявок: взять в работу, назначить, закрыть', ['admin', 'manager', 'operator']),
    ('requests.manage', 'Решение по заявкам: одобрение и отклонение, категории', ['admin']),
    ('requests.delete', 'Удаление заявок', ['admin']),
]


def upgrade() -> None:
    # ── Категории заявок ────────────────────────────────────────────────────
    op.create_table(
        'request_categories',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('allowed_roles', sa.JSON(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('response_minutes', sa.Integer(), nullable=True),
        sa.Column('resolve_minutes', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_request_categories_code', 'request_categories', ['code'], unique=True)

    # ── Заявки ──────────────────────────────────────────────────────────────
    op.create_table(
        'requests',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('number', sa.String(20), nullable=True),
        sa.Column('category_id', sa.Integer(), sa.ForeignKey('request_categories.id'), nullable=False),
        sa.Column('status', sa.Enum('NEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED',
                                    name='requeststatus'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('assignee_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('response_due_at', sa.DateTime(), nullable=True),
        sa.Column('due_at', sa.DateTime(), nullable=True),
        sa.Column('overdue_notified_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_requests_number', 'requests', ['number'], unique=True)
    op.create_index('ix_requests_category_id', 'requests', ['category_id'])
    op.create_index('ix_requests_status', 'requests', ['status'])
    op.create_index('ix_requests_created_by_id', 'requests', ['created_by_id'])
    op.create_index('ix_requests_assignee_id', 'requests', ['assignee_id'])
    op.create_index('ix_requests_created_at', 'requests', ['created_at'])
    op.create_index('idx_request_status_created', 'requests', ['status', 'created_at'])
    op.create_index('idx_request_assignee_status', 'requests', ['assignee_id', 'status'])

    # ── Комментарии ─────────────────────────────────────────────────────────
    op.create_table(
        'request_comments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('request_id', sa.Integer(), sa.ForeignKey('requests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('author_name', sa.String(), nullable=True),
        sa.Column('author_group', sa.String(), nullable=True),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_request_comments_request_id', 'request_comments', ['request_id'])
    op.create_index('ix_request_comments_created_at', 'request_comments', ['created_at'])

    # ── События (аудит-таймлайн) ────────────────────────────────────────────
    op.create_table(
        'request_events',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('request_id', sa.Integer(), sa.ForeignKey('requests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('author_name', sa.String(), nullable=True),
        sa.Column('author_group', sa.String(), nullable=True),
        sa.Column('event_type', sa.String(40), nullable=False),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_request_events_request_id', 'request_events', ['request_id'])
    op.create_index('ix_request_events_created_at', 'request_events', ['created_at'])

    # ── Настройки для фирменных писем ───────────────────────────────────────
    op.add_column('site_settings', sa.Column('site_url', sa.String(), nullable=True))
    op.add_column('site_settings', sa.Column('contact_phone', sa.String(), nullable=True))

    conn = op.get_bind()

    # ── Сид готовых категорий ───────────────────────────────────────────────
    for cid, code, name, allowed, response_min, resolve_min, sort in CATEGORIES:
        conn.execute(
            sa.text(
                "INSERT INTO request_categories "
                "(id, name, code, allowed_roles, response_minutes, resolve_minutes, is_active, sort_order, created_at) "
                "SELECT :cid, CAST(:name AS VARCHAR), CAST(:code AS VARCHAR), "
                "CAST(:allowed AS JSON), :resp, :resolve, true, :sort, now() "
                "WHERE NOT EXISTS (SELECT 1 FROM request_categories WHERE code = CAST(:code AS VARCHAR))"
            ),
            {
                "cid": cid,
                "name": name,
                "code": code,
                "allowed": json.dumps(allowed) if allowed is not None else None,
                "resp": response_min,
                "resolve": resolve_min,
                "sort": sort,
            },
        )
    op.execute("SELECT setval('request_categories_id_seq', (SELECT MAX(id) FROM request_categories))")

    # ── Права журнала ───────────────────────────────────────────────────────
    for codename, description, roles in PERMISSIONS:
        conn.execute(
            sa.text(
                "INSERT INTO permissions (id, codename, description, group_name) "
                "SELECT COALESCE((SELECT MAX(id) FROM permissions), 0) + 1, "
                "CAST(:codename AS VARCHAR), CAST(:description AS VARCHAR), 'Заявки' "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE codename = CAST(:codename AS VARCHAR))"
            ),
            {"codename": codename, "description": description},
        )
        for role_name in roles:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission_id) "
                    "SELECT r.id, p.id FROM roles r, permissions p "
                    "WHERE r.name = CAST(:role_name AS VARCHAR) "
                    "AND p.codename = CAST(:codename AS VARCHAR) "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM role_permissions x "
                    "  WHERE x.role_id = r.id AND x.permission_id = p.id"
                    ")"
                ),
                {"role_name": role_name, "codename": codename},
            )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()
    for codename, _description, _roles in PERMISSIONS:
        conn.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE permission_id IN "
                "(SELECT id FROM permissions WHERE codename = :codename)"
            ),
            {"codename": codename},
        )
        conn.execute(sa.text("DELETE FROM permissions WHERE codename = :codename"), {"codename": codename})
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")

    op.drop_column('site_settings', 'contact_phone')
    op.drop_column('site_settings', 'site_url')

    op.drop_index('ix_request_events_created_at', table_name='request_events')
    op.drop_index('ix_request_events_request_id', table_name='request_events')
    op.drop_table('request_events')

    op.drop_index('ix_request_comments_created_at', table_name='request_comments')
    op.drop_index('ix_request_comments_request_id', table_name='request_comments')
    op.drop_table('request_comments')

    op.drop_index('idx_request_assignee_status', table_name='requests')
    op.drop_index('idx_request_status_created', table_name='requests')
    op.drop_index('ix_requests_created_at', table_name='requests')
    op.drop_index('ix_requests_assignee_id', table_name='requests')
    op.drop_index('ix_requests_created_by_id', table_name='requests')
    op.drop_index('ix_requests_status', table_name='requests')
    op.drop_index('ix_requests_category_id', table_name='requests')
    op.drop_index('ix_requests_number', table_name='requests')
    op.drop_table('requests')
    op.execute("DROP TYPE IF EXISTS requeststatus")

    op.drop_index('ix_request_categories_code', table_name='request_categories')
    op.drop_table('request_categories')
