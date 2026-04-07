from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_async_engine(
    str(settings.DATABASE_URL),
    echo=False,  # Set to True for SQL query debugging
    future=True,
    pool_pre_ping=True,
    pool_recycle=250,
    pool_size=3,
    max_overflow=2,
    connect_args={
        "command_timeout": 15,
        "server_settings": {
            "tcp_keepalives_idle": "60",
            "tcp_keepalives_interval": "10",
            "tcp_keepalives_count": "5",
        }
    }
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
