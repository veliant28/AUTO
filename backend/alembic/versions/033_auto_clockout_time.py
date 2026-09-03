"""auto clock-out time setting (site_settings.work_auto_clockout_time)

Revision ID: 033
Revises: 032
Create Date: 2026-09-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '033'
down_revision: Union[str, Sequence[str], None] = '032'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL = прежнее поведение «конец смены + 15 минут»
    op.add_column('site_settings', sa.Column('work_auto_clockout_time', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('site_settings', 'work_auto_clockout_time')
