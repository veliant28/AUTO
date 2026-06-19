"""add_nova_poshta_models

Revision ID: a57e38f34689
Revises: 021
Create Date: 2026-06-19 11:23:03.457402

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a57e38f34689'
down_revision: Union[str, Sequence[str], None] = '021'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── Nova Poshta Sender Profiles ─────────────────────────────────────
    op.create_table('nova_poshta_sender_profiles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('sender_type', sa.String(length=32), nullable=False),
        sa.Column('api_token', sa.String(length=255), nullable=False),
        sa.Column('counterparty_ref', sa.String(length=36), nullable=True),
        sa.Column('contact_ref', sa.String(length=36), nullable=True),
        sa.Column('address_ref', sa.String(length=36), nullable=True),
        sa.Column('city_ref', sa.String(length=36), nullable=True),
        sa.Column('phone', sa.String(length=32), nullable=True),
        sa.Column('contact_name', sa.String(length=255), nullable=True),
        sa.Column('organization_name', sa.String(length=255), nullable=True),
        sa.Column('edrpou', sa.String(length=32), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=True),
        sa.Column('last_validated_at', sa.DateTime(), nullable=True),
        sa.Column('last_validation_ok', sa.Boolean(), nullable=True),
        sa.Column('last_validation_message', sa.String(length=500), nullable=True),
        sa.Column('last_validation_payload', sa.JSON(), nullable=True),
        sa.Column('raw_meta', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('np_sender_act_def', 'nova_poshta_sender_profiles', ['is_active', 'is_default'])
    op.create_index('np_sender_type', 'nova_poshta_sender_profiles', ['sender_type'])

    # ── Nova Poshta Waybills (TTN) ──────────────────────────────────────
    op.create_table('order_nova_poshta_waybills',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('sender_profile_id', sa.Integer(), nullable=False),
        sa.Column('np_ref', sa.String(length=36), nullable=True),
        sa.Column('np_number', sa.String(length=64), nullable=True),
        sa.Column('status_code', sa.String(length=64), nullable=True),
        sa.Column('status_text', sa.String(length=255), nullable=True),
        sa.Column('status_synced_at', sa.DateTime(), nullable=True),
        sa.Column('payer_type', sa.String(length=32), nullable=True),
        sa.Column('payment_method', sa.String(length=32), nullable=True),
        sa.Column('service_type', sa.String(length=32), nullable=True),
        sa.Column('cargo_type', sa.String(length=32), nullable=True),
        sa.Column('cost', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('weight', sa.Numeric(precision=10, scale=3), nullable=True),
        sa.Column('seats_amount', sa.Integer(), nullable=True),
        sa.Column('afterpayment_amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('recipient_city_ref', sa.String(length=36), nullable=True),
        sa.Column('recipient_city_label', sa.String(length=255), nullable=True),
        sa.Column('recipient_address_ref', sa.String(length=36), nullable=True),
        sa.Column('recipient_address_label', sa.String(length=255), nullable=True),
        sa.Column('recipient_counterparty_ref', sa.String(length=36), nullable=True),
        sa.Column('recipient_contact_ref', sa.String(length=36), nullable=True),
        sa.Column('recipient_name', sa.String(length=255), nullable=True),
        sa.Column('recipient_phone', sa.String(length=32), nullable=True),
        sa.Column('recipient_street_ref', sa.String(length=36), nullable=True),
        sa.Column('recipient_street_label', sa.String(length=255), nullable=True),
        sa.Column('recipient_house', sa.String(length=32), nullable=True),
        sa.Column('recipient_apartment', sa.String(length=32), nullable=True),
        sa.Column('description_snapshot', sa.String(length=255), nullable=True),
        sa.Column('additional_information_snapshot', sa.String(length=255), nullable=True),
        sa.Column('raw_request_json', sa.JSON(), nullable=True),
        sa.Column('raw_response_json', sa.JSON(), nullable=True),
        sa.Column('raw_last_tracking_json', sa.JSON(), nullable=True),
        sa.Column('error_codes', sa.JSON(), nullable=True),
        sa.Column('warning_codes', sa.JSON(), nullable=True),
        sa.Column('info_codes', sa.JSON(), nullable=True),
        sa.Column('print_url_html', sa.String(length=1024), nullable=True),
        sa.Column('print_url_pdf', sa.String(length=1024), nullable=True),
        sa.Column('can_edit', sa.Boolean(), nullable=True),
        sa.Column('last_sync_error', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ),
        sa.ForeignKeyConstraint(['sender_profile_id'], ['nova_poshta_sender_profiles.id'], ),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_order_nova_poshta_waybills_order_id', 'order_nova_poshta_waybills', ['order_id'])
    op.create_index('np_wb_number', 'order_nova_poshta_waybills', ['np_number'])
    op.create_index('np_wb_order_del', 'order_nova_poshta_waybills', ['order_id', 'is_deleted'])
    op.create_index('np_wb_status', 'order_nova_poshta_waybills', ['status_code'])

    # ── Nova Poshta Waybill Events ──────────────────────────────────────
    op.create_table('order_nova_poshta_waybill_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('waybill_id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=32), nullable=False),
        sa.Column('message', sa.String(length=500), nullable=True),
        sa.Column('status_code', sa.String(length=64), nullable=True),
        sa.Column('status_text', sa.String(length=255), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('raw_response', sa.JSON(), nullable=True),
        sa.Column('errors', sa.JSON(), nullable=True),
        sa.Column('warnings', sa.JSON(), nullable=True),
        sa.Column('info', sa.JSON(), nullable=True),
        sa.Column('error_codes', sa.JSON(), nullable=True),
        sa.Column('warning_codes', sa.JSON(), nullable=True),
        sa.Column('info_codes', sa.JSON(), nullable=True),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ),
        sa.ForeignKeyConstraint(['waybill_id'], ['order_nova_poshta_waybills.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('np_wbe_order_type', 'order_nova_poshta_waybill_events', ['order_id', 'event_type'])
    op.create_index('np_wbe_wb_created', 'order_nova_poshta_waybill_events', ['waybill_id', 'created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('np_wbe_wb_created', table_name='order_nova_poshta_waybill_events')
    op.drop_index('np_wbe_order_type', table_name='order_nova_poshta_waybill_events')
    op.drop_table('order_nova_poshta_waybill_events')
    op.drop_index('np_wb_status', table_name='order_nova_poshta_waybills')
    op.drop_index('np_wb_order_del', table_name='order_nova_poshta_waybills')
    op.drop_index('np_wb_number', table_name='order_nova_poshta_waybills')
    op.drop_index('ix_order_nova_poshta_waybills_order_id', table_name='order_nova_poshta_waybills')
    op.drop_table('order_nova_poshta_waybills')
    op.drop_index('np_sender_type', table_name='nova_poshta_sender_profiles')
    op.drop_index('np_sender_act_def', table_name='nova_poshta_sender_profiles')
    op.drop_table('nova_poshta_sender_profiles')
