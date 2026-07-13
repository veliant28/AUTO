"""remove unused brands.edit permission

Revision ID: 18d7ec272636
Revises: 25fadab84bc6
Create Date: 2026-07-13 20:43:40.322601

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '18d7ec272636'
down_revision: Union[str, Sequence[str], None] = '25fadab84bc6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BRANDS_EDIT_ID = 32


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM role_permissions WHERE permission_id = :pid"),
        {"pid": BRANDS_EDIT_ID},
    )
    conn.execute(
        sa.text("DELETE FROM permissions WHERE id = :id"),
        {"id": BRANDS_EDIT_ID},
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO permissions (id, codename, description, group_name) "
            "VALUES (:id, 'brands.edit', 'Редактирование брендов', 'Brands')"
        ),
        {"id": BRANDS_EDIT_ID},
    )
    for role_id in [3, 4, 5]:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "VALUES (:role_id, :pid)"
            ),
            {"role_id": role_id, "pid": BRANDS_EDIT_ID},
        )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
