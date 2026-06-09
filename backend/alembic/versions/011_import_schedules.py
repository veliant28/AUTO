"""add import_schedules table

Revision ID: 011
Revises: 010
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'import_schedules',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('supplier', sa.String(), nullable=False, unique=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('FALSE')),
        sa.Column('run_at_time', sa.String(), nullable=False, server_default='04:00'),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('last_import_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )

    conn = op.get_bind()
    for sname in ["GPL", "UTR"]:
        existing = conn.execute(
            sa.text("SELECT id FROM import_schedules WHERE supplier = :name"),
            {"name": sname}
        ).fetchone()
        if not existing:
            conn.execute(
                sa.text("INSERT INTO import_schedules (supplier, enabled, run_at_time) VALUES (:name, FALSE, '04:00')"),
                {"name": sname}
            )


def downgrade():
    op.drop_table('import_schedules')
