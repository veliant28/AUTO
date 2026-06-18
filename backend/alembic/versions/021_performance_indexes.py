"""add performance indexes

Revision ID: 021
Revises: 56071044aa35
Create Date: 2026-06-18 12:00:00.000000
"""
from alembic import op

revision = "021"
down_revision = "56071044aa35"


def upgrade():
    op.create_index("idx_user_email_active", "users", ["email", "is_active"])
    op.create_index(op.f("ix_users_is_active"), "users", ["is_active"])
    op.create_index(op.f("ix_users_created_at"), "users", ["created_at"])
    op.create_index("idx_order_user_status", "orders", ["user_id", "status"])
    op.create_index("idx_order_status_created", "orders", ["status", "created_at"])
    op.create_index(op.f("ix_orders_created_at"), "orders", ["created_at"])
    op.create_index("idx_part_article_brand", "parts", ["article", "brand"])
    op.create_index(op.f("ix_parts_brand"), "parts", ["brand"])
    op.create_index(op.f("ix_parts_brand_id"), "parts", ["brand_id"])
    op.create_index(op.f("ix_parts_category_id"), "parts", ["category_id"])
    op.create_index(op.f("ix_vehicle_brands_group"), "vehicle_brands", ["group"])
    op.create_index(op.f("ix_order_items_part_id"), "order_items", ["part_id"])


def downgrade():
    op.drop_index("idx_user_email_active", table_name="users")
    op.drop_index("ix_users_is_active", table_name="users")
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_index("idx_order_user_status", table_name="orders")
    op.drop_index("idx_order_status_created", table_name="orders")
    op.drop_index("ix_orders_created_at", table_name="orders")
    op.drop_index("idx_part_article_brand", table_name="parts")
    op.drop_index("ix_parts_brand", table_name="parts")
    op.drop_index("ix_parts_brand_id", table_name="parts")
    op.drop_index("ix_parts_category_id", table_name="parts")
    op.drop_index("ix_vehicle_brands_group", table_name="vehicle_brands")
    op.drop_index("ix_order_items_part_id", table_name="order_items")
