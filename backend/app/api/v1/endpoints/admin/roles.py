from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.schemas.admin_schemas import (
    RoleResponse, RoleCreate, RoleUpdate, PermissionResponse,
)
from app.models import User, Role, Permission, RolePermission
from datetime import datetime

router = APIRouter()


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Список всех ролей с разрешениями."""
    roles = db.query(Role).options(joinedload(Role.permissions)).order_by(Role.id).all()
    return [
        RoleResponse(
            id=r.id,
            name=r.name,
            description=r.description,
            is_system=r.is_system,
            created_at=r.created_at,
            updated_at=r.updated_at,
            permissions=[
                PermissionResponse(
                    id=p.id,
                    codename=p.codename,
                    description=p.description,
                    group_name=p.group_name,
                )
                for p in r.permissions
            ],
        )
        for r in roles
    ]


@router.post("/roles", response_model=RoleResponse)
async def create_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Создать новую роль с разрешениями."""
    existing = db.query(Role).filter(Role.name == data.name).first()
    if existing:
        raise HTTPException(400, "Role already exists")
    
    role = Role(name=data.name, description=data.description, is_system=False)
    db.add(role)
    db.flush()

    if data.permission_ids:
        permissions = db.query(Permission).filter(Permission.id.in_(data.permission_ids)).all()
        for perm in permissions:
            db.add(RolePermission(role_id=role.id, permission_id=perm.id))
    
    db.commit()
    db.refresh(role)
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role.id).first()

    return RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        created_at=role.created_at,
        updated_at=role.updated_at,
        permissions=[
            PermissionResponse(
                id=p.id,
                codename=p.codename,
                description=p.description,
                group_name=p.group_name,
            )
            for p in role.permissions
        ],
    )


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Обновить роль (название, описание, разрешения)."""
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(404, "Role not found")
    
    if data.name is not None:
        existing = db.query(Role).filter(Role.name == data.name, Role.id != role_id).first()
        if existing:
            raise HTTPException(400, "Role name already in use")
        role.name = data.name
    if data.description is not None:
        role.description = data.description
    if data.permission_ids is not None:
        db.query(RolePermission).filter(RolePermission.role_id == role_id).delete()
        permissions = db.query(Permission).filter(Permission.id.in_(data.permission_ids)).all()
        for perm in permissions:
            db.add(RolePermission(role_id=role_id, permission_id=perm.id))
    
    role.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(role)
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role.id).first()

    return RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        created_at=role.created_at,
        updated_at=role.updated_at,
        permissions=[
            PermissionResponse(
                id=p.id,
                codename=p.codename,
                description=p.description,
                group_name=p.group_name,
            )
            for p in role.permissions
        ],
    )


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Удалить роль (кроме системной)."""
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(404, "Role not found")
    if role.is_system:
        raise HTTPException(400, "Cannot delete system role")
    db.delete(role)
    db.commit()
    return {"message": "Role deleted"}


@router.get("/permissions", response_model=list[PermissionResponse])
async def list_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Список всех разрешений."""
    permissions = db.query(Permission).order_by(Permission.group_name, Permission.id).all()
    return [
        PermissionResponse(
            id=p.id,
            codename=p.codename,
            description=p.description,
            group_name=p.group_name,
        )
        for p in permissions
    ]
