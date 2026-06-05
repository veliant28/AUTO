"""initial

Revision ID: 001
Revises: 
Create Date: 2026-06-04

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # vehicle_brands
    op.create_table(
        'vehicle_brands',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('tecdoc_id', sa.Integer(), nullable=True),
        sa.Column('group', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vehicle_brands_name'), 'vehicle_brands', ['name'])
    op.create_index(op.f('ix_vehicle_brands_tecdoc_id'), 'vehicle_brands', ['tecdoc_id'], unique=True)

    # vehicle_models
    op.create_table(
        'vehicle_models',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('brand_id', sa.Integer(), sa.ForeignKey('vehicle_brands.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('tecdoc_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vehicle_models_name'), 'vehicle_models', ['name'])
    op.create_index(op.f('ix_vehicle_models_tecdoc_id'), 'vehicle_models', ['tecdoc_id'], unique=True)

    # vehicle_modifications
    op.create_table(
        'vehicle_modifications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('model_id', sa.Integer(), sa.ForeignKey('vehicle_models.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('tecdoc_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vehicle_modifications_tecdoc_id'), 'vehicle_modifications', ['tecdoc_id'], unique=True)

    # part_categories
    op.create_table(
        'part_categories',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('parent_id', sa.Integer(), sa.ForeignKey('part_categories.id'), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('tecdoc_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_part_categories_tecdoc_id'), 'part_categories', ['tecdoc_id'], unique=True)

    # parts
    op.create_table(
        'parts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('article', sa.String(), nullable=False),
        sa.Column('brand_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('category_id', sa.Integer(), sa.ForeignKey('part_categories.id'), nullable=True),
        sa.Column('tecdoc_id', sa.Integer(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_parts_article'), 'parts', ['article'], unique=True)
    op.create_index(op.f('ix_parts_tecdoc_id'), 'parts', ['tecdoc_id'], unique=True)

    # part_applicability
    op.create_table(
        'part_applicability',
        sa.Column('part_id', sa.Integer(), sa.ForeignKey('parts.id'), nullable=False),
        sa.Column('mod_id', sa.Integer(), sa.ForeignKey('vehicle_modifications.id'), nullable=False),
        sa.PrimaryKeyConstraint('part_id', 'mod_id'),
    )

    # suppliers
    op.create_table(
        'suppliers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('tecdoc_id', sa.Integer(), nullable=True),
        sa.Column('contact_info', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_suppliers_tecdoc_id'), 'suppliers', ['tecdoc_id'], unique=True)

    # supplier_offers
    op.create_table(
        'supplier_offers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('part_id', sa.Integer(), sa.ForeignKey('parts.id'), nullable=False),
        sa.Column('supplier_id', sa.Integer(), sa.ForeignKey('suppliers.id'), nullable=False),
        sa.Column('price', sa.Numeric(10, 2), nullable=False),
        sa.Column('currency', sa.String(), nullable=False, server_default='RUB'),
        sa.Column('quantity', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('delivery_days', sa.Integer(), nullable=True, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_supplier_offers_part_id'), 'supplier_offers', ['part_id'])

    # users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=True),
        sa.Column('role', sa.Enum('retail', 'b2b', 'manager', 'admin', name='userrole'), nullable=False, server_default='retail'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # user_garage
    op.create_table(
        'user_garage',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('mod_id', sa.Integer(), sa.ForeignKey('vehicle_modifications.id'), nullable=False),
        sa.Column('added_at', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # cart_items
    op.create_table(
        'cart_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('part_id', sa.Integer(), sa.ForeignKey('parts.id'), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('supplier_offer_id', sa.Integer(), sa.ForeignKey('supplier_offers.id'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # password_resets
    op.create_table(
        'password_resets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_password_resets_token'), 'password_resets', ['token'], unique=True)

    # oauth_accounts
    op.create_table(
        'oauth_accounts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('provider_user_id', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # favorites
    op.create_table(
        'favorites',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('part_id', sa.Integer(), sa.ForeignKey('parts.id'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # orders
    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.Enum('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', name='orderstatus'), nullable=False, server_default='pending'),
        sa.Column('total', sa.Numeric(10, 2), nullable=False),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # order_items
    op.create_table(
        'order_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('part_id', sa.Integer(), sa.ForeignKey('parts.id'), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('price', sa.Numeric(10, 2), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('order_items')
    op.drop_table('orders')
    op.drop_table('favorites')
    op.drop_table('oauth_accounts')
    op.drop_table('password_resets')
    op.drop_table('cart_items')
    op.drop_table('user_garage')
    op.drop_table('users')
    op.execute('DROP TYPE IF EXISTS userrole')
    op.drop_table('supplier_offers')
    op.drop_table('suppliers')
    op.drop_table('part_applicability')
    op.drop_table('parts')
    op.drop_table('part_categories')
    op.drop_table('vehicle_modifications')
    op.drop_table('vehicle_models')
    op.drop_table('vehicle_brands')
    op.execute('DROP TYPE IF EXISTS orderstatus')
