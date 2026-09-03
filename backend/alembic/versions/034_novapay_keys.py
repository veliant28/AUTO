"""novapay public key + test-mode flag in site_settings

Revision ID: 034
Revises: 033
Create Date: 2026-09-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '034'
down_revision: Union[str, Sequence[str], None] = '033'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Публичный ключ NovaPay для проверки подписи постбеков (x-sign-v2)
    op.add_column('site_settings', sa.Column('novapay_public_key', sa.Text(), nullable=True))
    # Переключатель среды: тест api-qecom (по умолчанию) / прод api-ecom
    op.add_column('site_settings', sa.Column('novapay_is_test', sa.Boolean(), nullable=False,
                                             server_default=sa.text('true')))


def downgrade() -> None:
    op.drop_column('site_settings', 'novapay_is_test')
    op.drop_column('site_settings', 'novapay_public_key')
