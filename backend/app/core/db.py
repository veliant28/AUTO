from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from .config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
)

TECDOC_DATABASE_URL = settings.DATABASE_URL.replace("/autoparts", "/tecdoc_db")
tecdoc_engine = create_engine(
    TECDOC_DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db_session = scoped_session(SessionLocal)

TecDocSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=tecdoc_engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tecdoc_db():
    db = TecDocSessionLocal()
    try:
        yield db
    finally:
        db.close()
