"""replace user_roles M2M with single role_id FK on users

Revision ID: 003
Revises: 002
Create Date: 2026-06-07

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add role_id column to users
    op.add_column(
        'users',
        sa.Column('role_id', sa.Integer(), sa.ForeignKey('roles.id'), nullable=True),
    )

    # Migrate existing user_roles data: pick the highest role_id for each user
    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT user_id, MAX(role_id) as role_id FROM user_roles GROUP BY user_id")
    )
    for user_id, role_id in result.fetchall():
        conn.execute(
            sa.text("UPDATE users SET role_id = :role_id WHERE id = :id"),
            {"role_id": role_id, "id": user_id},
        )

    # Set default role for users without any assignment
    conn.execute(
        sa.text("UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'retail') WHERE role_id IS NULL")
    )

    # Make role_id NOT NULL
    op.alter_column('users', 'role_id', nullable=False)

    # Drop the user_roles table
    op.drop_table('user_roles')


def downgrade() -> None:
    # Re-create user_roles table
    op.create_table(
        'user_roles',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role_id', sa.Integer(), sa.ForeignKey('roles.id'), nullable=False),
        sa.PrimaryKeyConstraint('user_id', 'role_id'),
    )

    # Migrate data back
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT id, role_id FROM users"))
    rows = []
    for user_id, role_id in result.fetchall():
        rows.append({"user_id": user_id, "role_id": role_id})
    if rows:
        conn.execute(
            sa.text("INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, :role_id)"),
            rows,
        )

    # Remove role_id column
    op.drop_column('users', 'role_id')
