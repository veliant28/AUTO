"""add missing admin page permissions

Revision ID: bdd49bc48194
Revises: 2db168de1889
Create Date: 2026-07-13 19:57:44.507640

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'bdd49bc48194'
down_revision: Union[str, Sequence[str], None] = '2db168de1889'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PERMISSIONS = [
    # Products
    {'id': 27, 'codename': 'products.view', 'description': 'Просмотр товаров', 'group_name': 'Products'},
    {'id': 28, 'codename': 'products.create', 'description': 'Создание товаров', 'group_name': 'Products'},
    {'id': 29, 'codename': 'products.edit', 'description': 'Редактирование товаров', 'group_name': 'Products'},
    {'id': 30, 'codename': 'products.delete', 'description': 'Удаление товаров', 'group_name': 'Products'},
    # Brands
    {'id': 31, 'codename': 'brands.view', 'description': 'Просмотр брендов', 'group_name': 'Brands'},
    {'id': 32, 'codename': 'brands.edit', 'description': 'Редактирование брендов', 'group_name': 'Brands'},
    # Categories
    {'id': 33, 'codename': 'categories.view', 'description': 'Просмотр категорий', 'group_name': 'Categories'},
    {'id': 34, 'codename': 'categories.create', 'description': 'Создание категорий', 'group_name': 'Categories'},
    {'id': 35, 'codename': 'categories.edit', 'description': 'Редактирование категорий', 'group_name': 'Categories'},
    {'id': 36, 'codename': 'categories.delete', 'description': 'Удаление категорий', 'group_name': 'Categories'},
    # Pricing
    {'id': 37, 'codename': 'pricing.view', 'description': 'Просмотр наценок', 'group_name': 'Pricing'},
    {'id': 38, 'codename': 'pricing.edit', 'description': 'Редактирование наценок', 'group_name': 'Pricing'},
    {'id': 39, 'codename': 'pricing.apply', 'description': 'Применение наценок', 'group_name': 'Pricing'},
    # Suppliers
    {'id': 40, 'codename': 'suppliers.view', 'description': 'Просмотр поставщиков', 'group_name': 'Suppliers'},
    {'id': 41, 'codename': 'suppliers.create', 'description': 'Создание поставщиков', 'group_name': 'Suppliers'},
    {'id': 42, 'codename': 'suppliers.edit', 'description': 'Редактирование поставщиков', 'group_name': 'Suppliers'},
    {'id': 43, 'codename': 'suppliers.delete', 'description': 'Удаление поставщиков', 'group_name': 'Suppliers'},
    # Protection
    {'id': 44, 'codename': 'protection.view', 'description': 'Просмотр защиты', 'group_name': 'Protection'},
    {'id': 45, 'codename': 'protection.ban', 'description': 'Бан пользователя', 'group_name': 'Protection'},
    {'id': 46, 'codename': 'protection.unban', 'description': 'Разбан пользователя', 'group_name': 'Protection'},
    # Imports
    {'id': 47, 'codename': 'imports.view', 'description': 'Просмотр импортов', 'group_name': 'Imports'},
    {'id': 48, 'codename': 'imports.create', 'description': 'Запуск импорта', 'group_name': 'Imports'},
    {'id': 49, 'codename': 'imports.delete', 'description': 'Удаление импорта', 'group_name': 'Imports'},
    # TecDoc (tecdoc.view id=18, tecdoc.batch id=19 already exist)
    {'id': 50, 'codename': 'tecdoc.sync', 'description': 'Синхронизация TecDoc', 'group_name': 'TecDoc'},
    {'id': 51, 'codename': 'tecdoc.settings', 'description': 'Настройки TecDoc', 'group_name': 'TecDoc'},
    # Support
    {'id': 52, 'codename': 'support.view', 'description': 'Просмотр обращений', 'group_name': 'Support'},
    {'id': 53, 'codename': 'support.reply', 'description': 'Ответ на обращение', 'group_name': 'Support'},
    # Backup
    {'id': 54, 'codename': 'backup.view', 'description': 'Просмотр бэкапов', 'group_name': 'Backup'},
    {'id': 55, 'codename': 'backup.run', 'description': 'Запуск бэкапа', 'group_name': 'Backup'},
    {'id': 56, 'codename': 'backup.download', 'description': 'Скачивание бэкапа', 'group_name': 'Backup'},
    {'id': 57, 'codename': 'backup.config', 'description': 'Настройка бэкапа', 'group_name': 'Backup'},
    # Workers
    {'id': 58, 'codename': 'workers.view', 'description': 'Просмотр воркеров', 'group_name': 'Workers'},
    {'id': 59, 'codename': 'workers.restart', 'description': 'Перезапуск воркера', 'group_name': 'Workers'},
    # Staff
    {'id': 60, 'codename': 'staff.view', 'description': 'Просмотр сотрудников', 'group_name': 'Staff'},
    # Loyalty
    {'id': 61, 'codename': 'loyalty.view', 'description': 'Просмотр лояльности', 'group_name': 'Loyalty'},
    {'id': 62, 'codename': 'loyalty.create', 'description': 'Создание промокода', 'group_name': 'Loyalty'},
    {'id': 63, 'codename': 'loyalty.edit', 'description': 'Редактирование промокода', 'group_name': 'Loyalty'},
    {'id': 64, 'codename': 'loyalty.delete', 'description': 'Удаление промокода', 'group_name': 'Loyalty'},
    # Waybills
    {'id': 65, 'codename': 'waybills.view', 'description': 'Просмотр ТТН', 'group_name': 'Waybills'},
    {'id': 66, 'codename': 'waybills.print', 'description': 'Печать ТТН', 'group_name': 'Waybills'},
    # Returns
    {'id': 67, 'codename': 'returns.view', 'description': 'Просмотр возвратов', 'group_name': 'Returns'},
    {'id': 68, 'codename': 'returns.edit_status', 'description': 'Смена статуса возврата', 'group_name': 'Returns'},
]

# Existing permission IDs that should also be assigned to all roles
EXISTING_IDS = [18, 19]  # tecdoc.view, tecdoc.batch

# Role IDs: 3 = operator, 4 = manager, 5 = admin
ASSIGN_ROLES = [3, 4, 5]


def upgrade() -> None:
    # Insert new permissions
    permissions_table = sa.table(
        'permissions',
        sa.Column('id', sa.Integer),
        sa.Column('codename', sa.String),
        sa.Column('description', sa.String),
        sa.Column('group_name', sa.String),
    )
    op.bulk_insert(permissions_table, PERMISSIONS)

    # Assign new permissions to all roles
    rp_table = sa.table(
        'role_permissions',
        sa.Column('role_id', sa.Integer),
        sa.Column('permission_id', sa.Integer),
    )
    first_id = PERMISSIONS[0]['id']
    last_id = PERMISSIONS[-1]['id']
    rows = []
    for role_id in ASSIGN_ROLES:
        for pid in range(first_id, last_id + 1):
            rows.append({'role_id': role_id, 'permission_id': pid})
    op.bulk_insert(rp_table, rows)

    # Also assign existing tecdoc permissions (18, 19) to manager and operator
    conn = op.get_bind()
    for role_id in ASSIGN_ROLES:
        for pid in EXISTING_IDS:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission_id) "
                    "SELECT :role_id, :pid "
                    "WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_id = :role_id2 AND permission_id = :pid2)"
                ),
                {"role_id": role_id, "pid": pid, "role_id2": role_id, "pid2": pid},
            )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")


def downgrade() -> None:
    first_id = PERMISSIONS[0]['id']
    last_id = PERMISSIONS[-1]['id']

    for role_id in ASSIGN_ROLES:
        for pid in range(first_id, last_id + 1):
            op.execute(
                sa.text("DELETE FROM role_permissions WHERE role_id = :role_id AND permission_id = :pid"),
                {"role_id": role_id, "pid": pid},
            )

    for pid in range(first_id, last_id + 1):
        op.execute(
            sa.text("DELETE FROM permissions WHERE id = :id"),
            {"id": pid},
        )

    op.execute("SELECT setval('permissions_id_seq', (SELECT MAX(id) FROM permissions))")
