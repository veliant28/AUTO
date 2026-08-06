from sqlalchemy.orm import Session
from typing import List

from app.models import Permission, RolePermission


def role_permission_codenames(db: Session, role_id: int) -> List[str]:
    """Codename'ы всех прав роли (для /users/me и /auth/login)."""
    rows = (
        db.query(Permission.codename)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role_id == role_id)
        .all()
    )
    return [r[0] for r in rows]
