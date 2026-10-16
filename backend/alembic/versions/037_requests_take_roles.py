"""requests: категории — роли, которые могут брать заявки в работу

Revision ID: 037
Revises: 036
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '037'
down_revision: Union[str, Sequence[str], None] = '036'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Роли, которые могут взять заявку этой категории в работу
    # (None/пустой список — любой сотрудник с правом requests.process)
    op.add_column(
        "request_categories",
        sa.Column("take_roles", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("request_categories", "take_roles")
