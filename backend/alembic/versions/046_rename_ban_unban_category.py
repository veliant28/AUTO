"""requests: rename ban_unban category to «Защита»

Revision ID: 046
Revises: 045
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '046'
down_revision: Union[str, Sequence[str], None] = '045'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE request_categories SET name = 'Защита' WHERE code = 'ban_unban'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE request_categories SET name = 'Бан / разбан клиента' "
        "WHERE code = 'ban_unban'"
    )
