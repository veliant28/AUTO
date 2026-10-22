"""attendance: shorten edit permission label

Revision ID: 044
Revises: 043
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '044'
down_revision: Union[str, Sequence[str], None] = '043'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CODENAME = 'attendance.edit'
OLD = 'Редактирование табеля: ручное проставление часов'
NEW = 'Редактирование табеля'


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE permissions SET description = :description "
            "WHERE codename = :codename"
        ).bindparams(description=NEW, codename=CODENAME)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE permissions SET description = :description "
            "WHERE codename = :codename"
        ).bindparams(description=OLD, codename=CODENAME)
    )
