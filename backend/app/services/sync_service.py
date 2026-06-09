import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from app.services.tecdoc_client import tecdoc_client
from app.models import VehicleBrand, VehicleModel, VehicleModification, PartCategory, Part, PartApplicability
from app.core.constants import DEFAULT_VEHICLE_GROUP

class SyncService:
    @staticmethod
    async def sync_brands(db: Session, group: str = DEFAULT_VEHICLE_GROUP):
        """
        Syncs brands from TecDoc using PostgreSQL bulk upsert.
        """
        data = await tecdoc_client.get_makes(group=group)
        if not data:
            return 0
        
        # Prepare data for bulk insert
        values = [
            {"name": item["name"], "tecdoc_id": item["id"], "group": group}
            for item in data
        ]
        
        # PostgreSQL Bulk Upsert
        stmt = insert(VehicleBrand).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["tecdoc_id"],
            set_={"name": stmt.excluded.name, "group": stmt.excluded.group}
        )
        
        db.execute(stmt)
        db.commit()
        return len(values)

    @staticmethod
    async def sync_models(db: Session, group: str = DEFAULT_VEHICLE_GROUP):
        """
        Syncs models for all brands.
        """
        brands = db.query(VehicleBrand).filter(VehicleBrand.group == group).all()
        total_synced = 0
        
        for brand in brands:
            data = await tecdoc_client.get_models(make_id=brand.tecdoc_id, group=group)
            if not data:
                continue
                
            values = [
                {"brand_id": brand.id, "name": item["name"], "tecdoc_id": item["id"]}
                for item in data
            ]
            
            stmt = insert(VehicleModel).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["tecdoc_id"],
                set_={"name": stmt.excluded.name, "brand_id": stmt.excluded.brand_id}
            )
            
            db.execute(stmt)
            total_synced += len(values)
            
        db.commit()
        return total_synced

    @staticmethod
    async def sync_modifications(db: Session, group: str = DEFAULT_VEHICLE_GROUP):
        """
        Syncs modifications for all models.
        """
        models = db.query(VehicleModel).all()
        total_synced = 0
        
        for model in models:
            data = await tecdoc_client.get_modifications(model_id=model.tecdoc_id, group=group)
            if not data:
                continue
                
            values = [
                {"model_id": model.id, "name": item["name"], "tecdoc_id": item["id"]}
                for item in data
            ]
            
            stmt = insert(VehicleModification).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["tecdoc_id"],
                set_={"name": stmt.excluded.name, "model_id": stmt.excluded.model_id}
            )
            
            db.execute(stmt)
            total_synced += len(values)
            
        db.commit()
        return total_synced

    @staticmethod
    async def sync_sections(db: Session, mod_id: int, group: str = DEFAULT_VEHICLE_GROUP):
        """
        Syncs sections for a specific modification.
        """
        data = await tecdoc_client.get_sections(mod_id=mod_id, group=group)
        if not data:
            return 0
            
        values = [
            {"name": item["name"], "tecdoc_id": item["id"]}
            for item in data
        ]
        
        stmt = insert(PartCategory).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["tecdoc_id"],
            set_={"name": stmt.excluded.name}
        )
        
        db.execute(stmt)
        db.commit()
        return len(values)

    @staticmethod
    async def sync_parts_for_section(db: Session, mod_id: int, sec_id: int, group: str = DEFAULT_VEHICLE_GROUP):
        """
        Syncs parts for a specific section and modification.
        """
        data = await tecdoc_client.get_section_parts(mod_id=mod_id, sec_id=sec_id, group=group)
        if not data:
            return 0
            
        parts_synced = 0
        for item in data:
            # 1. Upsert Part
            part_stmt = insert(Part).values({
                "article": item["article"],
                "brand_id": item["brand_id"],
                "name": item["name"],
                "tecdoc_id": item["id"]
            })
            part_stmt = part_stmt.on_conflict_do_update(
                index_elements=["article", sa.text("COALESCE(brand, '')")],
                set_={"name": part_stmt.excluded.name, "tecdoc_id": part_stmt.excluded.tecdoc_id}
            )
            db.execute(part_stmt)
            db.flush()

            part_id = db.query(Part).filter(Part.article == item["article"]).scalar()
            
            # 2. Upsert Applicability
            local_mod = db.query(VehicleModification).filter(VehicleModification.tecdoc_id == mod_id).first()
            if local_mod:
                app_stmt = insert(PartApplicability).values({
                    "part_id": part_id,
                    "mod_id": local_mod.id
                })
                app_stmt = app_stmt.on_conflict_do_nothing()
                db.execute(app_stmt)
                parts_synced += 1
        
        db.commit()
        return parts_synced

    async def full_vehicle_sync(self, db: Session):
        """
        Full sequential sync of the vehicle tree.
        """
        b_count = await self.sync_brands(db)
        m_count = await self.sync_models(db)
        mod_count = await self.sync_modifications(db)
        
        return {
            "brands": b_count,
            "models": m_count,
            "modifications": mod_count
        }

sync_service = SyncService()
