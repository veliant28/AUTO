"""manager specific non-view permissions

Revision ID: 2de309654156
Revises: a25a9b21a982
Create Date: 2026-07-13 20:55:49.328940

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '2de309654156'
down_revision: Union[str, Sequence[str], None] = 'a25a9b21a982'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Non-view permissions that manager SHOULD have (in addition to all .view perms)
MANAGER_NON_VIEW = [
    3,   # orders.edit_status
    4,   # orders.delete
    22,  # novaposhta.create
    23,  # novaposhta.edit
    24,  # novaposhta.print
    25,  # novaposhta.tracking
    26,  # novaposhta.delete
    53,  # support.reply
    66,  # waybills.print
    68,  # returns.edit_status
    62,  # loyalty.create
    63,  # loyalty.edit
    64,  # loyalty.delete
]


def upgrade() -> None:
    conn = op.get_bind()
    for pid in MANAGER_NON_VIEW:
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT 4, :pid "
                "WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_id = 4 AND permission_id = :pid2)"
            ),
            {"pid": pid, "pid2": pid},
        )


def downgrade() -> None:
    conn = op.get_bind()
    for pid in MANAGER_NON_VIEW:
        conn.execute(
            sa.text("DELETE FROM role_permissions WHERE role_id = 4 AND permission_id = :pid"),
            {"pid": pid},
        )
