import ssl
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
import logging

from swolltech.config import get_settings

logger = logging.getLogger("swolltech.db")

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


def connect_args_for(url: str, root_cert: str = "", command_timeout: float | None = None) -> dict:
    # statement_cache_size=0 keeps asyncpg working behind Supabase's transaction pooler.
    args: dict = {"statement_cache_size": 0}
    if command_timeout:
        args["command_timeout"] = command_timeout
    if "supabase.co" in url or "pooler.supabase.com" in url:
        if root_cert:
            # Full verification against Supabase's own root CA.
            args["ssl"] = ssl.create_default_context(cafile=root_cert)
        else:
            # Supabase signs with its own CA, so without that file the chain cannot be checked.
            # The link is still encrypted. Set DATABASE_SSL_ROOT_CERT in production.
            logger.warning("Database TLS is not verified. Set DATABASE_SSL_ROOT_CERT to Supabase's root CA.")
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
        # A small bounded pool: reuses TLS connections and caps how many this instance can
        # hold, so a burst of traffic queues briefly instead of exhausting Supabase's limit.
        _engine = create_async_engine(
            url,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=10,
            pool_recycle=1800,
            pool_pre_ping=True,
            connect_args=connect_args_for(url, settings.database_ssl_root_cert, settings.db_command_timeout_seconds),
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
