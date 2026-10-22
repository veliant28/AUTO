"""requests: rename pricing_change category to price

Revision ID: 051
Revises: 050
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '051'
down_revision: Union[str, Sequence[str], None] = '050'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE request_categories SET name = 'Цена' "
        "WHERE code = 'pricing_change'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE request_categories "
        "SET name = 'Изменение цен и наценок' "
        "WHERE code = 'pricing_change'"
    )
