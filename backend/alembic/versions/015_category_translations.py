"""add name_ua and name_en to part_categories

Revision ID: 015
Revises: 014
Create Date: 2026-06-12

"""

from typing import Union
from alembic import op
import sqlalchemy as sa


revision: str = '015'
down_revision: Union[str, None] = '014'


def upgrade() -> None:
    op.add_column('part_categories', sa.Column('name_ua', sa.String(), nullable=True))
    op.add_column('part_categories', sa.Column('name_en', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('part_categories', 'name_en')
    op.drop_column('part_categories', 'name_ua')
