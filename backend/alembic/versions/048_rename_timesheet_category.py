"""requests: rename timesheet_manual category to «Табель»

Revision ID: 048
Revises: 047
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '048'
down_revision: Union[str, Sequence[str], None] = '047'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE request_categories SET name = 'Табель' "
        "WHERE code = 'timesheet_manual'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE request_categories SET name = 'Правка часов в табеле' "
        "WHERE code = 'timesheet_manual'"
    )
