"""add monitor tables: presence_sessions, product_views, cart_items session columns

Revision ID: 023
Revises: 022
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '023'
down_revision: Union[str, Sequence[str], None] = '022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Сессии присутствия (мониторинг онлайн-клиентов)
    op.create_table(
        'presence_sessions',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('session_id', sa.String(64), nullable=True),
        sa.Column('ip', sa.String(64), nullable=True),
        sa.Column('first_seen', sa.DateTime(), nullable=False),
        sa.Column('last_seen', sa.DateTime(), nullable=False),
        sa.Column('offline_at', sa.DateTime(), nullable=True),
        sa.Column('is_online', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )
    op.create_index('ix_presence_sessions_user_id', 'presence_sessions', ['user_id'])
    op.create_index('ix_presence_sessions_session_id', 'presence_sessions', ['session_id'])
    op.create_index('ix_presence_sessions_first_seen', 'presence_sessions', ['first_seen'])
    op.create_index('ix_presence_sessions_is_online', 'presence_sessions', ['is_online'])

    # Просмотры товаров (последние 100 на клиента)
    op.create_table(
        'product_views',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('session_id', sa.String(64), nullable=True),
        sa.Column('part_id', sa.Integer(), sa.ForeignKey('parts.id'), nullable=False),
        sa.Column('supplier_offer_id', sa.Integer(), sa.ForeignKey('supplier_offers.id'), nullable=True),
        sa.Column('viewed_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_product_views_user_id', 'product_views', ['user_id'])
    op.create_index('ix_product_views_session_id', 'product_views', ['session_id'])
    op.create_index('ix_product_views_part_id', 'product_views', ['part_id'])
    op.create_index('ix_product_views_viewed_at', 'product_views', ['viewed_at'])
    op.create_index('ix_product_views_user_time', 'product_views', ['user_id', 'viewed_at'])
    op.create_index('ix_product_views_session_time', 'product_views', ['session_id', 'viewed_at'])

    # Корзина: поддержка анонимов (session_id) + даты
    op.alter_column('cart_items', 'user_id', existing_type=sa.Integer(), nullable=True)
    op.create_index('ix_cart_items_user_id', 'cart_items', ['user_id'])
    op.add_column('cart_items', sa.Column('session_id', sa.String(64), nullable=True))
    op.create_index('ix_cart_items_session_id', 'cart_items', ['session_id'])
    op.add_column('cart_items', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.add_column('cart_items', sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))


def downgrade() -> None:
    op.drop_index('ix_cart_items_session_id', table_name='cart_items')
    op.drop_column('cart_items', 'updated_at')
    op.drop_column('cart_items', 'created_at')
    op.drop_column('cart_items', 'session_id')
    op.drop_index('ix_cart_items_user_id', table_name='cart_items')
    op.alter_column('cart_items', 'user_id', existing_type=sa.Integer(), nullable=False)

    op.drop_index('ix_product_views_session_time', table_name='product_views')
    op.drop_index('ix_product_views_user_time', table_name='product_views')
    op.drop_index('ix_product_views_viewed_at', table_name='product_views')
    op.drop_index('ix_product_views_part_id', table_name='product_views')
    op.drop_index('ix_product_views_session_id', table_name='product_views')
    op.drop_index('ix_product_views_user_id', table_name='product_views')
    op.drop_table('product_views')

    op.drop_index('ix_presence_sessions_is_online', table_name='presence_sessions')
    op.drop_index('ix_presence_sessions_first_seen', table_name='presence_sessions')
    op.drop_index('ix_presence_sessions_session_id', table_name='presence_sessions')
    op.drop_index('ix_presence_sessions_user_id', table_name='presence_sessions')
    op.drop_table('presence_sessions')
