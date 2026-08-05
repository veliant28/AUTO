"""add updated_at to price_imports (watchdog liveness heartbeat)

Revision ID: 022
Revises: bb1b3b878585
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '022'
down_revision: Union[str, Sequence[str], None] = 'bb1b3b878585'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'price_imports',
        sa.Column(
            'updated_at',
            sa.DateTime(),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_column('price_imports', 'updated_at')
