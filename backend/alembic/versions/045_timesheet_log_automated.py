"""attendance: mark automated timesheet overrides

Revision ID: 045
Revises: 044
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '045'
down_revision: Union[str, Sequence[str], None] = '044'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "timesheet_override_log",
        sa.Column(
            "is_automated",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("timesheet_override_log", "is_automated")
