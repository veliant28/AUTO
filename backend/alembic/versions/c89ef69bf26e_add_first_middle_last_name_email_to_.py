"""add_first_middle_last_name_email_to_sender

Revision ID: c89ef69bf26e
Revises: a57e38f34689
Create Date: 2026-06-19 13:51:50.873412

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c89ef69bf26e'
down_revision: Union[str, Sequence[str], None] = 'a57e38f34689'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('nova_poshta_sender_profiles', sa.Column('first_name', sa.String(length=36), nullable=True))
    op.add_column('nova_poshta_sender_profiles', sa.Column('last_name', sa.String(length=36), nullable=True))
    op.add_column('nova_poshta_sender_profiles', sa.Column('middle_name', sa.String(length=36), nullable=True))
    op.add_column('nova_poshta_sender_profiles', sa.Column('email', sa.String(length=36), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('nova_poshta_sender_profiles', 'email')
    op.drop_column('nova_poshta_sender_profiles', 'middle_name')
    op.drop_column('nova_poshta_sender_profiles', 'last_name')
    op.drop_column('nova_poshta_sender_profiles', 'first_name')
