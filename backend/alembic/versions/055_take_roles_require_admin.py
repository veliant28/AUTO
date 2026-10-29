"""request categories: add admin to non-empty take_roles

Revision ID: 055
Revises: 054
Create Date: 2026-10-28
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "055"
down_revision: Union[str, Sequence[str], None] = "054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CATEGORIES = sa.table(
    "request_categories",
    sa.column("id", sa.Integer),
    sa.column("take_roles", sa.JSON),
)


def _add_admin_to_take_roles(conn) -> None:
    rows = conn.execute(sa.select(CATEGORIES.c.id, CATEGORIES.c.take_roles)).all()
    for category_id, raw in rows:
        roles = raw
        if isinstance(roles, str):
            try:
                roles = json.loads(roles)
            except (TypeError, ValueError):
                continue
        if not isinstance(roles, list) or not roles:
            continue
        if "admin" in roles:
            continue
        conn.execute(
            CATEGORIES.update()
            .where(CATEGORIES.c.id == category_id)
            .values(take_roles=[*roles, "admin"])
        )


def upgrade() -> None:
    """Назначать исполнителя может только admin, поэтому его роль должна быть
    в каждом непустом списке «Кто может брать в работу» — иначе категория
    становится неназначаемой.
    """
    _add_admin_to_take_roles(op.get_bind())


def downgrade() -> None:
    # Обратная операция неоднозначна: нельзя отличить admin, добавленного
    # миграцией, от admin, которого выбрал администратор. Не удаляем.
    pass
