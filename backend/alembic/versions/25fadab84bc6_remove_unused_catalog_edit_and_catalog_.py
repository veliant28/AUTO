"""remove unused catalog.edit and catalog.sync, assign catalog.view to all roles

Revision ID: 25fadab84bc6
Revises: bdd49bc48194
Create Date: 2026-07-13 20:34:33.459493

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '25fadab84bc6'
down_revision: Union[str, Sequence[str], None] = 'bdd49bc48194'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Delete role_permissions for catalog.edit (id=10) and catalog.sync (id=11)
    for pid in [10, 11]:
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE permission_id = :pid"),
            {"pid": pid},
        )

    # Delete the permissions themselves
    for pid in [10, 11]:
        conn.execute(
            sa.text("DELETE FROM permissions WHERE id = :id"),
            {"id": pid},
        )

    # Assign catalog.view (id=9) to operator (role 3) if not already assigned
    conn.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT 3, 9 "
            "WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_id = 3 AND permission_id = 9)"
        ),
    )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()

    # Remove operator's catalog.view
    conn.execute(
        sa.text("DELETE FROM role_permissions WHERE role_id = 3 AND permission_id = 9"),
    )

    # Re-insert catalog.edit and catalog.sync
    permissions_table = sa.table(
        'permissions',
        sa.Column('id', sa.Integer),
        sa.Column('codename', sa.String),
        sa.Column('description', sa.String),
        sa.Column('group_name', sa.String),
    )
    op.bulk_insert(permissions_table, [
        {'id': 10, 'codename': 'catalog.edit', 'description': 'Редактирование каталога', 'group_name': 'Catalog'},
        {'id': 11, 'codename': 'catalog.sync', 'description': 'Синхронизация каталога', 'group_name': 'Catalog'},
    ])

    # Re-assign to admin only
    rp_table = sa.table(
        'role_permissions',
        sa.Column('role_id', sa.Integer),
        sa.Column('permission_id', sa.Integer),
    )
    op.bulk_insert(rp_table, [
        {'role_id': 5, 'permission_id': 10},
        {'role_id': 5, 'permission_id': 11},
    ])

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
