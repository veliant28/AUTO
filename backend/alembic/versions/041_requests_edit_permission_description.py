"""requests: clarify edit permission description for admins

Revision ID: 041
Revises: 040
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '041'
down_revision: Union[str, Sequence[str], None] = '040'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


OLD = 'Редактирование заявок до взятия в работу или назначения исполнителя'
NEW = (
    'Редактирование заявок: администратор — до решения, '
    'остальные — до взятия в работу или назначения исполнителя'
)


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE permissions SET description = :description "
            "WHERE codename = 'requests.edit'"
        ).bindparams(description=NEW)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE permissions SET description = :description "
            "WHERE codename = 'requests.edit'"
        ).bindparams(description=OLD)
    )
