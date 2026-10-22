"""requests: remove title, move payload comments to RequestComment

Revision ID: 039
Revises: 038
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '039'
down_revision: Union[str, Sequence[str], None] = '038'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Комментарий из payload заявки становится обычным комментарием
    op.execute(
        """
        INSERT INTO request_comments
            (request_id, user_id, author_name, author_group, text, created_at)
        SELECT
            id,
            NULL,
            COALESCE(
                NULLIF(payload->>'contact_name', ''),
                NULLIF(
                    TRIM(CONCAT_WS(
                        ' ',
                        payload->>'contact_last_name',
                        payload->>'contact_first_name'
                    )),
                    ''
                ),
                'Клиент'
            ),
            NULL,
            payload->>'comment',
            created_at
        FROM requests
        WHERE payload->>'comment' IS NOT NULL
          AND payload->>'comment' <> ''
        """
    )

    # Описание дублировало комментарий — оставляем его пустым
    op.execute(
        """
        UPDATE requests
        SET description = NULL
        WHERE payload->>'comment' IS NOT NULL
          AND description = payload->>'comment'
        """
    )

    # Убираем комментарий из payload
    op.execute(
        """
        UPDATE requests
        SET payload = (payload::jsonb - 'comment')::json
        WHERE payload->>'comment' IS NOT NULL
        """
    )

    # Темы заявки больше нет
    op.drop_column("requests", "title")


def downgrade() -> None:
    # Восстанавливаем только колонку; комментарии обратно в payload не переносим
    op.add_column(
        "requests",
        sa.Column("title", sa.String(length=200), nullable=True),
    )
