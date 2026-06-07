"""add roles and permissions system

Revision ID: 002
Revises: 001
Create Date: 2026-06-07

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create roles table
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('is_system', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_roles_name'), 'roles', ['name'], unique=True)

    # Create permissions table
    op.create_table(
        'permissions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('codename', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('group_name', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_permissions_codename'), 'permissions', ['codename'], unique=True)

    # Create role_permissions join table
    op.create_table(
        'role_permissions',
        sa.Column('role_id', sa.Integer(), sa.ForeignKey('roles.id'), nullable=False),
        sa.Column('permission_id', sa.Integer(), sa.ForeignKey('permissions.id'), nullable=False),
        sa.PrimaryKeyConstraint('role_id', 'permission_id'),
    )

    # Create user_roles join table
    op.create_table(
        'user_roles',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role_id', sa.Integer(), sa.ForeignKey('roles.id'), nullable=False),
        sa.PrimaryKeyConstraint('user_id', 'role_id'),
    )

    # Seed roles
    roles_table = sa.table(
        'roles',
        sa.Column('id', sa.Integer),
        sa.Column('name', sa.String),
        sa.Column('description', sa.String),
        sa.Column('is_system', sa.Boolean),
    )
    op.bulk_insert(roles_table, [
        {'id': 1, 'name': 'retail', 'description': 'Розничный покупатель', 'is_system': True},
        {'id': 2, 'name': 'b2b', 'description': 'Корпоративный клиент', 'is_system': True},
        {'id': 3, 'name': 'operator', 'description': 'Оператор (просмотр заказов)', 'is_system': True},
        {'id': 4, 'name': 'manager', 'description': 'Менеджер (управление заказами)', 'is_system': True},
        {'id': 5, 'name': 'admin', 'description': 'Администратор (полный доступ)', 'is_system': True},
    ])

    # Seed permissions
    permissions_table = sa.table(
        'permissions',
        sa.Column('id', sa.Integer),
        sa.Column('codename', sa.String),
        sa.Column('description', sa.String),
        sa.Column('group_name', sa.String),
    )
    op.bulk_insert(permissions_table, [
        {'id': 1, 'codename': 'dashboard.view', 'description': 'Просмотр дашборда', 'group_name': 'Dashboard'},
        {'id': 2, 'codename': 'orders.view', 'description': 'Просмотр заказов', 'group_name': 'Orders'},
        {'id': 3, 'codename': 'orders.edit_status', 'description': 'Изменение статуса заказа', 'group_name': 'Orders'},
        {'id': 4, 'codename': 'orders.delete', 'description': 'Удаление заказа', 'group_name': 'Orders'},
        {'id': 5, 'codename': 'users.view', 'description': 'Просмотр пользователей', 'group_name': 'Users'},
        {'id': 6, 'codename': 'users.create', 'description': 'Создание пользователей', 'group_name': 'Users'},
        {'id': 7, 'codename': 'users.edit', 'description': 'Редактирование пользователей', 'group_name': 'Users'},
        {'id': 8, 'codename': 'users.delete', 'description': 'Удаление пользователей', 'group_name': 'Users'},
        {'id': 9, 'codename': 'catalog.view', 'description': 'Просмотр каталога', 'group_name': 'Catalog'},
        {'id': 10, 'codename': 'catalog.edit', 'description': 'Редактирование каталога', 'group_name': 'Catalog'},
        {'id': 11, 'codename': 'catalog.sync', 'description': 'Синхронизация каталога', 'group_name': 'Catalog'},
        {'id': 12, 'codename': 'footer.edit', 'description': 'Редактирование футера', 'group_name': 'Content'},
        {'id': 13, 'codename': 'roles.view', 'description': 'Просмотр ролей', 'group_name': 'Roles'},
        {'id': 14, 'codename': 'roles.create', 'description': 'Создание ролей', 'group_name': 'Roles'},
        {'id': 15, 'codename': 'roles.edit', 'description': 'Редактирование ролей', 'group_name': 'Roles'},
        {'id': 16, 'codename': 'roles.delete', 'description': 'Удаление ролей', 'group_name': 'Roles'},
        {'id': 17, 'codename': 'roles.assign', 'description': 'Назначение ролей пользователям', 'group_name': 'Roles'},
    ])

    # Seed role_permissions (admin gets all, manager/operator get subset)
    rp_table = sa.table(
        'role_permissions',
        sa.Column('role_id', sa.Integer),
        sa.Column('permission_id', sa.Integer),
    )
    rows = []
    # admin = id 5 → all permissions (1-17)
    for pid in range(1, 18):
        rows.append({'role_id': 5, 'permission_id': pid})
    # manager = id 4 → dashboard, orders, catalog view/sync
    for pid in [1, 2, 3, 9, 11]:
        rows.append({'role_id': 4, 'permission_id': pid})
    # operator = id 3 → dashboard, orders view, orders edit_status
    for pid in [1, 2, 3]:
        rows.append({'role_id': 3, 'permission_id': pid})
    op.bulk_insert(rp_table, rows)

    # Migrate existing users from role enum to user_roles
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT id, role FROM users"))
    users = result.fetchall()

    # Old enum values: retail → id 1, b2b → id 2, manager → id 4, admin → id 5
    role_map = {
        'retail': 1,
        'b2b': 2,
        'manager': 4,
        'admin': 5,
    }
    ur_table = sa.table(
        'user_roles',
        sa.Column('user_id', sa.Integer),
        sa.Column('role_id', sa.Integer),
    )
    ur_rows = []
    for user_id, old_role in users:
        new_role_id = role_map.get(old_role, 1)  # default to retail
        ur_rows.append({'user_id': user_id, 'role_id': new_role_id})
    if ur_rows:
        op.bulk_insert(ur_table, ur_rows)

    # Fix sequences after bulk insert
    op.execute("SELECT setval('roles_id_seq', (SELECT MAX(id) FROM roles))")
    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")

    # Drop the old role column and enum type
    op.drop_column('users', 'role')
    op.execute('DROP TYPE IF EXISTS userrole')


def downgrade() -> None:
    # Restore the old role column
    op.add_column(
        'users',
        sa.Column('role', sa.Enum('retail', 'b2b', 'manager', 'admin', name='userrole'),
                  server_default='retail', nullable=False),
    )

    # Migrate user_roles back to the old column (pick first role)
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT DISTINCT ON (user_id) user_id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id"))
    for user_id, role_name in result.fetchall():
        conn.execute(
            sa.text("UPDATE users SET role = :role WHERE id = :id"),
            {"role": role_name, "id": user_id},
        )

    op.drop_table('user_roles')
    op.drop_table('role_permissions')
    op.drop_table('permissions')
    op.drop_table('roles')
