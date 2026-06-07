"""add TecDoc gateway tables: config, rate_logs, supplier_prices

Revision ID: 004
Revises: 003
Create Date: 2026-06-07

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tecdoc_config',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('api_url', sa.String(), nullable=False, server_default='https://auto-db.pro/api/v1/'),
        sa.Column('auth_user', sa.String(), nullable=False, server_default=''),
        sa.Column('auth_pass', sa.String(), nullable=False, server_default=''),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.bulk_insert(
        sa.table('tecdoc_config',
            sa.Column('id', sa.Integer),
            sa.Column('api_url', sa.String),
            sa.Column('auth_user', sa.String),
            sa.Column('auth_pass', sa.String),
        ),
        [{'id': 1, 'api_url': 'https://auto-db.pro/api/v1/', 'auth_user': '', 'auth_pass': ''}],
    )

    op.create_table(
        'tecdoc_rate_logs',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('called_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('endpoint', sa.String(), nullable=False),
        sa.Column('article', sa.String(), nullable=True),
        sa.Column('brand_id', sa.Integer(), nullable=True),
        sa.Column('success', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('response_ms', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tecdoc_rate_logs_called_at', 'tecdoc_rate_logs', ['called_at'])

    op.create_table(
        'supplier_prices',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('supplier', sa.String(), nullable=False),
        sa.Column('article', sa.String(), nullable=False),
        sa.Column('brand', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('price', sa.Numeric(10, 2), nullable=True),
        sa.Column('currency', sa.String(), nullable=True),
        sa.Column('stock_total', sa.Integer(), server_default='0', nullable=False),
        sa.Column('stock_regions', sa.JSON(), nullable=True),
        sa.Column('tecdoc_article', sa.String(), nullable=True),
        sa.Column('tecdoc_brand_id', sa.Integer(), nullable=True),
        sa.Column('match_status', sa.String(), server_default='pending', nullable=False),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_attempt_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_supplier_prices_match_status', 'supplier_prices', ['match_status'])
    op.create_index('ix_supplier_prices_article', 'supplier_prices', ['article'])
    op.create_index('ix_supplier_prices_supplier', 'supplier_prices', ['supplier'])
    op.create_index('uq_supplier_prices_article_supplier', 'supplier_prices', ['article', 'brand', 'supplier'], unique=True)


def downgrade() -> None:
    op.drop_table('supplier_prices')
    op.drop_table('tecdoc_rate_logs')
    op.drop_table('tecdoc_config')
