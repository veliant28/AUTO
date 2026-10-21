"""requests: статус CLOSED для авто-закрытия после решения

Revision ID: 038
Revises: 037
Create Date: 2026-10-21
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '038'
down_revision: Union[str, Sequence[str], None] = '037'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLAlchemy Enum хранит имена членов перечисления (NEW, IN_PROGRESS, ...)
    op.execute("ALTER TYPE requeststatus ADD VALUE IF NOT EXISTS 'CLOSED'")


def downgrade() -> None:
    # PostgreSQL не умеет удалять значение из enum — пересоздаём тип,
    # предварительно переводя закрытые заявки обратно в решённые.
    op.execute("UPDATE requests SET status = 'RESOLVED' WHERE status = 'CLOSED'")
    op.execute("ALTER TYPE requeststatus RENAME TO requeststatus_old")
    op.execute(
        "CREATE TYPE requeststatus AS ENUM "
        "('NEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED')"
    )
    op.execute(
        "ALTER TABLE requests ALTER COLUMN status TYPE requeststatus "
        "USING status::text::requeststatus"
    )
    op.execute("DROP TYPE requeststatus_old")
