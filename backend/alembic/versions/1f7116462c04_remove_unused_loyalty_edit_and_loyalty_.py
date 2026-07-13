"""remove unused loyalty.edit and loyalty.delete

Revision ID: 1f7116462c04
Revises: 2de309654156
Create Date: 2026-07-13 20:57:59.514719

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '1f7116462c04'
down_revision: Union[str, Sequence[str], None] = '2de309654156'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UNUSED_IDS = [63, 64]  # loyalty.edit, loyalty.delete


def upgrade() -> None:
    conn = op.get_bind()
    for pid in UNUSED_IDS:
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_id = :pid"),
            {"pid": pid},
        )
        conn.execute(
            sa.text("DELETE FROM permissions WHERE id = :id"),
            {"id": pid},
        )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    op.bulk_insert(
        sa.table('permissions', sa.Column('id', sa.Integer), sa.Column('codename', sa.String),
                  sa.Column('description', sa.String), sa.Column('group_name', sa.String)),
        [
            {'id': 63, 'codename': 'loyalty.edit', 'description': 'Редактирование промокода', 'group_name': 'Loyalty'},
            {'id': 64, 'codename': 'loyalty.delete', 'description': 'Удаление промокода', 'group_name': 'Loyalty'},
        ],
    )
    # Re-assign to admin only (was never on manager before my migration)
    op.bulk_insert(
        sa.table('role_permissions', sa.Column('role_id', sa.Integer), sa.Column('permission_id', sa.Integer)),
        [
            {'role_id': 5, 'permission_id': 63},
            {'role_id': 5, 'permission_id': 64},
        ],
    )
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
