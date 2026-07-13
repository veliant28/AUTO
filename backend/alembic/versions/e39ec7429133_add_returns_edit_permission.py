"""add returns.edit permission

Revision ID: e39ec7429133
Revises: e38ec7429132
Create Date: 2026-07-13 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e39ec7429133'
down_revision: Union[str, Sequence[str], None] = 'e38ec7429132'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


RETURNS_EDIT = {'id': 73, 'codename': 'returns.edit',
                'description': 'Редактирование возврата', 'group_name': 'Returns'}


def upgrade() -> None:
    conn = op.get_bind()

    # ── Add returns.edit (id=73) ──────────────────────────────────────────
    op.bulk_insert(
        sa.table('permissions',
                 sa.Column('id', sa.Integer),
                 sa.Column('codename', sa.String),
                 sa.Column('description', sa.String),
                 sa.Column('group_name', sa.String)),
        [RETURNS_EDIT],
    )
    # Assign to admin (5) and manager (4) — NOT to operator (3)
    conn.execute(
        sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (5, 73)")
    )
    conn.execute(
        sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (4, 73)")
    )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()

    # Remove returns.edit (id=73) from everyone
    conn.execute(sa.text("DELETE FROM role_permissions WHERE permission_id = 73"))
    conn.execute(sa.text("DELETE FROM permissions WHERE id = 73"))

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
