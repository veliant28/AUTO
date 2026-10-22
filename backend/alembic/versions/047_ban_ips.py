"""protection: block all known IPs of a banned user

Revision ID: 047
Revises: 046
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '047'
down_revision: Union[str, Sequence[str], None] = '046'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ban_ips",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ban_id", sa.Integer(), nullable=False),
        sa.Column("ip_address", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["ban_id"], ["ban_records.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ban_id", "ip_address", name="uq_ban_ips_ban_ip"),
    )
    op.create_index("ix_ban_ips_ban_id", "ban_ips", ["ban_id"])
    op.create_index("ix_ban_ips_ip_address", "ban_ips", ["ip_address"])

    # Бэкфилл для уже активных банов: все известные IP пользователя + IP,
    # сохранённый в самом бане, + IP из событий защиты по user_id/email.
    op.execute(
        """
        INSERT INTO ban_ips (ban_id, ip_address, created_at)
        SELECT b.id, c.ip, now()
        FROM ban_records b
        JOIN client_ips c ON c.client_key = 'u' || b.user_id::text
        WHERE b.is_active = true AND b.user_id IS NOT NULL
          AND c.ip IS NOT NULL
        ON CONFLICT (ban_id, ip_address) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO ban_ips (ban_id, ip_address, created_at)
        SELECT b.id, b.ip_address, now()
        FROM ban_records b
        WHERE b.is_active = true AND b.ip_address IS NOT NULL
        ON CONFLICT (ban_id, ip_address) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO ban_ips (ban_id, ip_address, created_at)
        SELECT DISTINCT b.id, e.ip_address, now()
        FROM ban_records b
        JOIN protection_events e
          ON (e.user_id = b.user_id OR (b.email IS NOT NULL AND e.email = b.email))
        WHERE b.is_active = true AND e.ip_address IS NOT NULL
        ON CONFLICT (ban_id, ip_address) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("ban_ips")
