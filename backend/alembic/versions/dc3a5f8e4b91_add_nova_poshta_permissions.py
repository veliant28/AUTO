"""add nova poshta permissions

Revision ID: dc3a5f8e4b91
Revises: 0e83660433d8
Create Date: 2026-06-25

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'dc3a5f8e4b91'
down_revision: Union[str, Sequence[str], None] = '0e83660433d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    permissions_table = sa.table(
        'permissions',
        sa.Column('id', sa.Integer),
        sa.Column('codename', sa.String),
        sa.Column('description', sa.String),
        sa.Column('group_name', sa.String),
    )
    op.bulk_insert(permissions_table, [
        {'id': 21, 'codename': 'novaposhta.view', 'description': 'Просмотр ТТН', 'group_name': 'Nova Poshta'},
        {'id': 22, 'codename': 'novaposhta.create', 'description': 'Создание ТТН', 'group_name': 'Nova Poshta'},
        {'id': 23, 'codename': 'novaposhta.edit', 'description': 'Редактирование ТТН', 'group_name': 'Nova Poshta'},
        {'id': 24, 'codename': 'novaposhta.print', 'description': 'Печать ТТН', 'group_name': 'Nova Poshta'},
        {'id': 25, 'codename': 'novaposhta.tracking', 'description': 'Трекинг ТТН', 'group_name': 'Nova Poshta'},
        {'id': 26, 'codename': 'novaposhta.delete', 'description': 'Удаление ТТН', 'group_name': 'Nova Poshta'},
    ])

    # Assign all 6 nova poshta permissions to admin (5), manager (4), operator (3)
    rp_table = sa.table(
        'role_permissions',
        sa.Column('role_id', sa.Integer),
        sa.Column('permission_id', sa.Integer),
    )
    rows = []
    for role_id in [3, 4, 5]:
        for pid in range(21, 27):
            rows.append({'role_id': role_id, 'permission_id': pid})
    op.bulk_insert(rp_table, rows)

    # Fix sequences after bulk insert
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    # Remove nova poshta role_permissions
    for role_id in [3, 4, 5]:
        for pid in range(21, 27):
            op.execute(
                sa.text("DELETE FROM role_permissions WHERE role_id = :role_id AND permission_id = :pid"),
                {"role_id": role_id, "pid": pid},
            )

    # Remove nova poshta permissions
    for pid in range(21, 27):
        op.execute(
            sa.text("DELETE FROM permissions WHERE id = :id"),
            {"id": pid},
        )

    # Fix sequences
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
