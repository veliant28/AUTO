"""requests: rename support_edit category to tech support

Revision ID: 050
Revises: 049
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '050'
down_revision: Union[str, Sequence[str], None] = '049'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE request_categories SET name = 'Тех. поддержка' "
        "WHERE code = 'support_edit'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE request_categories "
        "SET name = 'Редактирование сообщения в поддержке' "
        "WHERE code = 'support_edit'"
    )
