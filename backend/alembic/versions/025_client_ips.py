"""add client_ips table (long-term IP history for monitor)

Revision ID: 025
Revises: 024
Create Date: 2026-08-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '025'
down_revision: Union[str, Sequence[str], None] = '024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'client_ips',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('client_key', sa.String(80), nullable=False),
        sa.Column('ip', sa.String(64), nullable=False),
        sa.Column('first_seen', sa.DateTime(), nullable=False),
        sa.Column('last_seen', sa.DateTime(), nullable=False),
        sa.Column('visits', sa.Integer(), nullable=False, server_default='1'),
        sa.UniqueConstraint('client_key', 'ip', name='uq_client_ips_key_ip'),
    )
    op.create_index('ix_client_ips_client_key', 'client_ips', ['client_key'])

    # Бэкфилл из существующих presence_sessions: ключ u{user_id}/s{session_id},
    # visits = число сессий, first/last = MIN/MAX по времени захода.
    op.execute(
        """
        INSERT INTO client_ips (client_key, ip, first_seen, last_seen, visits)
        SELECT
            CASE
                WHEN user_id IS NOT NULL THEN 'u' || user_id
                ELSE 's' || session_id
            END,
            ip,
            MIN(first_seen),
            MAX(first_seen),
            COUNT(*)
        FROM presence_sessions
        WHERE ip IS NOT NULL
          AND (user_id IS NOT NULL OR session_id IS NOT NULL)
        GROUP BY
            CASE
                WHEN user_id IS NOT NULL THEN 'u' || user_id
                ELSE 's' || session_id
            END,
            ip
        """
    )


def downgrade() -> None:
    op.drop_index('ix_client_ips_client_key', table_name='client_ips')
    op.drop_table('client_ips')
