"""requests: shorten process/manage permission labels

Revision ID: 043
Revises: 042
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '043'
down_revision: Union[str, Sequence[str], None] = '042'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


RENAMES = [
    (
        'requests.process',
        'Обработка заявок: взять в работу, назначить, закрыть',
        'Обработка заявок',
    ),
    (
        'requests.manage',
        'Решение по заявкам: одобрение и отклонение, категории',
        'Решение по заявкам',
    ),
]


def upgrade() -> None:
    conn = op.get_bind()
    for codename, _old, new in RENAMES:
        conn.execute(
            sa.text(
                "UPDATE permissions SET description = :description "
                "WHERE codename = :codename"
            ),
            {"codename": codename, "description": new},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for codename, old, _new in RENAMES:
        conn.execute(
            sa.text(
                "UPDATE permissions SET description = :description "
                "WHERE codename = :codename"
            ),
            {"codename": codename, "description": old},
        )
