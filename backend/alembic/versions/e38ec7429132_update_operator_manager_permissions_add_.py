"""update operator/manager permissions, add returns.delete

Revision ID: e38ec7429132
Revises: 1f7116462c04
Create Date: 2026-07-13 21:11:27.085866

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e38ec7429132'
down_revision: Union[str, Sequence[str], None] = '1f7116462c04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── New permission ──────────────────────────────────────────────────────────
RETURNS_DELETE = {'id': 72, 'codename': 'returns.delete',
                  'description': 'Удаление возврата', 'group_name': 'Returns'}

# ── Operator (role 3) – full replacement set ────────────────────────────────
OPERATOR_PERMS = [
    1,   # dashboard.view
    2,   # orders.view
    3,   # orders.edit_status
    5,   # users.view
    9,   # catalog.view
    13,  # roles.view
    18,  # tecdoc.view
    21,  # novaposhta.view
    22,  # novaposhta.create
    23,  # novaposhta.edit
    24,  # novaposhta.print
    25,  # novaposhta.tracking
    26,  # novaposhta.delete
    27,  # products.view
    31,  # brands.view
    33,  # categories.view
    37,  # pricing.view
    40,  # suppliers.view
    44,  # protection.view
    47,  # imports.view
    52,  # support.view
    53,  # support.reply
    54,  # backup.view
    58,  # workers.view
    60,  # staff.view
    61,  # loyalty.view
    62,  # loyalty.create
    65,  # waybills.view
    66,  # waybills.print
    67,  # returns.view
    68,  # returns.edit_status
]

# ── Manager (role 4) – full replacement set ─────────────────────────────────
# All .view permissions + all Orders/NovaPoshta/Support/Waybills/Returns/Loyalty non-view
MANAGER_PERMS = [
    1,   # dashboard.view
    2,   # orders.view
    3,   # orders.edit_status
    4,   # orders.delete
    5,   # users.view
    9,   # catalog.view
    13,  # roles.view
    18,  # tecdoc.view
    21,  # novaposhta.view
    22,  # novaposhta.create
    23,  # novaposhta.edit
    24,  # novaposhta.print
    25,  # novaposhta.tracking
    26,  # novaposhta.delete
    27,  # products.view
    31,  # brands.view
    33,  # categories.view
    37,  # pricing.view
    40,  # suppliers.view
    44,  # protection.view
    47,  # imports.view
    52,  # support.view
    53,  # support.reply
    54,  # backup.view
    58,  # workers.view
    60,  # staff.view
    61,  # loyalty.view
    62,  # loyalty.create
    65,  # waybills.view
    66,  # waybills.print
    67,  # returns.view
    68,  # returns.edit_status
    72,  # returns.delete
]


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Add returns.delete (id=72) ──────────────────────────────────────
    op.bulk_insert(
        sa.table('permissions',
                 sa.Column('id', sa.Integer),
                 sa.Column('codename', sa.String),
                 sa.Column('description', sa.String),
                 sa.Column('group_name', sa.String)),
        [RETURNS_DELETE],
    )
    # Assign to admin (5) and manager (4)
    conn.execute(
        sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (5, 72)")
    )
    conn.execute(
        sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (4, 72)")
    )

    # ── 2. Replace operator (role 3) permissions ────────────────────────────
    conn.execute(sa.text("DELETE FROM role_permissions WHERE role_id = 3"))
    for pid in OPERATOR_PERMS:
        conn.execute(
            sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (3, :pid)"),
            {"pid": pid},
        )

    # ── 3. Replace manager (role 4) permissions ─────────────────────────────
    conn.execute(sa.text("DELETE FROM role_permissions WHERE role_id = 4"))
    for pid in MANAGER_PERMS:
        conn.execute(
            sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (4, :pid)"),
            {"pid": pid},
        )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    conn = op.get_bind()

    # ── Manager (role 4) – restore previous state ───────────────────────────
    # The state BEFORE this migration for manager (role 4) was:
    # All .view permissions + non-view perms that existed at that point.
    # At that point 63 (loyalty.edit) and 64 (loyalty.delete) were already
    # removed, so they are not included.
    conn.execute(sa.text("DELETE FROM role_permissions WHERE role_id = 4"))
    PREV_MANAGER = [
        1, 2, 3, 4, 5, 9, 13, 18, 21, 22, 23, 24, 25, 26, 27, 31, 33, 37,
        40, 44, 47, 52, 53, 54, 58, 60, 61, 62, 65, 66, 67, 68,
    ]
    for pid in PREV_MANAGER:
        conn.execute(
            sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (4, :pid)"),
            {"pid": pid},
        )

    # ── Operator (role 3) – restore previous state ──────────────────────────
    # Before this migration operator had a mix from earlier revisions.
    # The most complete previous authoritative set came from bdd49bc48194
    # (which assigned all perms in 27-68 range) plus earlier perms.
    # We restore what we previously set plus any legacy perms that we know
    # operator had (like tecdoc.view/batch from bdd49bc48194).
    conn.execute(sa.text("DELETE FROM role_permissions WHERE role_id = 3"))
    PREV_OPERATOR = [
        1, 2, 3, 5, 9, 13, 18, 19, 21, 22, 23, 24, 25, 26, 27, 31, 33, 37,
        40, 44, 47, 52, 53, 54, 58, 60, 61, 62, 65, 66, 67, 68,
    ]
    for pid in PREV_OPERATOR:
        conn.execute(
            sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (3, :pid)"),
            {"pid": pid},
        )

    # ── Remove returns.delete (id=72) from everyone ─────────────────────────
    conn.execute(sa.text("DELETE FROM role_permissions WHERE permission_id = 72"))
    conn.execute(sa.text("DELETE FROM permissions WHERE id = 72"))

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
