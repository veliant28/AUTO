"""manager read-only: remove non-view permissions from role 4, add missing delete/edit perms

Revision ID: a25a9b21a982
Revises: 18d7ec272636
Create Date: 2026-07-13 20:46:29.416906

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a25a9b21a982'
down_revision: Union[str, Sequence[str], None] = '18d7ec272636'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_PERMS = [
    {'id': 69, 'codename': 'backup.delete', 'description': 'Удаление бэкапа', 'group_name': 'Backup'},
    {'id': 70, 'codename': 'imports.edit', 'description': 'Редактирование импорта', 'group_name': 'Imports'},
    {'id': 71, 'codename': 'protection.edit', 'description': 'Редактирование защиты', 'group_name': 'Protection'},
]


def upgrade() -> None:
    conn = op.get_bind()

    # Add missing permissions, assign to admin (role 5) only
    perms_table = sa.table(
        'permissions',
        sa.Column('id', sa.Integer),
        sa.Column('codename', sa.String),
        sa.Column('description', sa.String),
        sa.Column('group_name', sa.String),
    )
    op.bulk_insert(perms_table, NEW_PERMS)

    rp_table = sa.table(
        'role_permissions',
        sa.Column('role_id', sa.Integer),
        sa.Column('permission_id', sa.Integer),
    )
    op.bulk_insert(rp_table, [
        {'role_id': 5, 'permission_id': p['id']} for p in NEW_PERMS
    ])

    # Remove all non-view permissions from manager (role 4)
    conn.execute(
        sa.text(
            "DELETE FROM role_permissions "
            "WHERE role_id = 4 "
            "AND permission_id IN ("
            "  SELECT id FROM permissions "
            "  WHERE codename NOT LIKE '%.view'"
            ")"
        ),
    )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()

    # Re-add non-view permissions to manager (role 4)
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT 4, id FROM permissions "
            "WHERE codename NOT LIKE '%.view' "
            "AND id NOT IN ("
            "  SELECT permission_id FROM role_permissions WHERE role_id = 4"
            ")"
        ),
    )

    # Remove new permissions from admin and delete them
    for p in NEW_PERMS:
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_id = :pid"),
            {"pid": p['id']},
        )
        conn.execute(
            sa.text("DELETE FROM permissions WHERE id = :id"),
            {"id": p['id']},
        )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
