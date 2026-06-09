"""add site_settings table + settings.edit permission

Revision ID: 007
Revises: 006
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    # Create site_settings table
    op.create_table(
        'site_settings',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('brand_name', sa.String(), nullable=False, server_default='AutoParts'),
    )

    # Seed default row
    conn = op.get_bind()
    conn.execute(
        sa.text("INSERT INTO site_settings (brand_name) VALUES ('AutoParts')")
    )

    # Add settings.edit permission (id=20)
    permissions_table = sa.table(
        'permissions',
        sa.Column('id', sa.Integer),
        sa.Column('codename', sa.String),
        sa.Column('description', sa.String),
        sa.Column('group_name', sa.String),
    )
    op.bulk_insert(permissions_table, [
        {'id': 20, 'codename': 'settings.edit', 'description': 'Редактирование настроек', 'group_name': 'Settings'},
    ])

    # Assign to admin role (id=5)
    rp_table = sa.table(
        'role_permissions',
        sa.Column('role_id', sa.Integer),
        sa.Column('permission_id', sa.Integer),
    )
    op.bulk_insert(rp_table, [
        {'role_id': 5, 'permission_id': 20},
    ])


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM role_permissions WHERE permission_id = 20"))
    conn.execute(sa.text("DELETE FROM permissions WHERE id = 20"))
    op.drop_table('site_settings')
