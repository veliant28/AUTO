"""add city_label and address_label to sender profiles

Revision ID: 9787d25996a1
Revises: 760e9bbe7a53
Create Date: 2026-06-22 12:41:44.601247

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9787d25996a1'
down_revision: Union[str, Sequence[str], None] = '760e9bbe7a53'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('nova_poshta_sender_profiles', sa.Column('city_label', sa.String(length=255), nullable=True))
    op.add_column('nova_poshta_sender_profiles', sa.Column('address_label', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('nova_poshta_sender_profiles', 'address_label')
    op.drop_column('nova_poshta_sender_profiles', 'city_label')
