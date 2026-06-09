"""add supplier_configs + price_imports tables

Revision ID: 008
Revises: 007
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'supplier_configs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('supplier', sa.String(), nullable=False, unique=True),
        sa.Column('login', sa.String(), nullable=False),
        sa.Column('password_encrypted', sa.Text(), nullable=True),
        sa.Column('api_url', sa.String(), nullable=True),
        sa.Column('token', sa.Text(), nullable=True),
        sa.Column('token_expires_at', sa.DateTime(), nullable=True),
        sa.Column('refresh_token', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'price_imports',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('supplier', sa.String(), nullable=False),
        sa.Column('format', sa.String(), nullable=False, server_default='xlsx'),
        sa.Column('status', sa.String(), nullable=False, server_default='in_queue'),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_items', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('matched_items', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('file_path', sa.String(), nullable=True),
        sa.Column('filters', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('external_id', sa.String(), nullable=True),
        sa.Column('external_token', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
    )

    # Seed GPL + UTR supplier configs
    conn = op.get_bind()
    conn.execute(sa.text(
        "INSERT INTO supplier_configs (supplier, login, api_url) VALUES "
        "('GPL', '', 'https://online.gpl.ua')"
        "ON CONFLICT (supplier) DO NOTHING"
    ))
    conn.execute(sa.text(
        "INSERT INTO supplier_configs (supplier, login, api_url) VALUES "
        "('UTR', '', 'https://order24-api.utr.ua')"
        "ON CONFLICT (supplier) DO NOTHING"
    ))

    # Seed GPL + UTR in suppliers table
    for sname in ["GPL", "UTR"]:
        existing = conn.execute(
            sa.text("SELECT id FROM suppliers WHERE name = :name"),
            {"name": sname}
        ).fetchone()
        if not existing:
            conn.execute(
                sa.text("INSERT INTO suppliers (name) VALUES (:name)"),
                {"name": sname}
            )


def downgrade():
    op.drop_table('price_imports')
    op.drop_table('supplier_configs')
