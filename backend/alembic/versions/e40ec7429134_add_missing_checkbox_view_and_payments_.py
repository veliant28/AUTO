"""add missing checkbox.view and payments.view permissions

Revision ID: e40ec7429134
Revises: e39ec7429133
Create Date: 2026-07-13 21:31:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e40ec7429134'
down_revision: Union[str, Sequence[str], None] = 'e39ec7429133'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add checkbox.view (id=74)
    op.bulk_insert(
        sa.table('permissions',
                 sa.Column('id', sa.Integer),
                 sa.Column('codename', sa.String),
                 sa.Column('description', sa.String),
                 sa.Column('group_name', sa.String)),
        [{'id': 74, 'codename': 'checkbox.view',
          'description': 'Просмотр чеков', 'group_name': 'Checkbox'}],
    )
    conn.execute(
        sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (5, 74)")
    )
    conn.execute(
        sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (4, 74)")
    )

    # Add payments.view (id=75)
    op.bulk_insert(
        sa.table('permissions',
                 sa.Column('id', sa.Integer),
                 sa.Column('codename', sa.String),
                 sa.Column('description', sa.String),
                 sa.Column('group_name', sa.String)),
        [{'id': 75, 'codename': 'payments.view',
          'description': 'Просмотр платежей', 'group_name': 'Payments'}],
    )
    conn.execute(
        sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (5, 75)")
    )
    conn.execute(
        sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (4, 75)")
    )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()

    for perm_id in [74, 75]:
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_id = :pid"),
            {"pid": perm_id},
        )
        conn.execute(
            sa.text("DELETE FROM permissions WHERE id = :pid"),
            {"pid": perm_id},
        )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
