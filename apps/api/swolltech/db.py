import ssl
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from swolltech.config import get_settings

_engine = None
_sessionmaker = None


def normalize_database_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    return url


def connect_args_for(url: str) -> dict:
    args: dict = {"statement_cache_size": 0}
    if "supabase.co" in url or "pooler.supabase.com" in url:
        # The direct Supabase host presents a self-signed certificate.
        # sslmode=require encrypts without verifying that chain.
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        args["ssl"] = context
    return args


def get_engine():
    global _engine, _sessionmaker
    if _engine is None:
        settings = get_settings()
        if not settings.database_url:
            raise RuntimeError("Set DATABASE_URL to the Supabase Postgres connection string.")
        url = normalize_database_url(settings.database_url)
        _engine = create_async_engine(
            url,
            poolclass=NullPool,
            connect_args=connect_args_for(url),
        )
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def get_db() -> AsyncIterator[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    async with _sessionmaker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _sessionmaker = None
