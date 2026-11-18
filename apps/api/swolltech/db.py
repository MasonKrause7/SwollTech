import ssl
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
import logging

from swolltech.config import get_settings

logger = logging.getLogger("swolltech.db")

_engine = None
_sessionmaker = None


LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "db", "test-db", "postgres"}
# libpq options that asyncpg does not take as URL parameters. TLS is set in connect_args.
DROPPED_PARAMS = {"sslmode", "channel_binding", "sslrootcert", "options"}


def normalize_database_url(url: str) -> str:
    """Turn the URL Neon/Vercel hands out (postgres://...?sslmode=require&channel_binding=require)
    into one SQLAlchemy's asyncpg driver accepts."""
    for prefix in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            url = "postgresql+asyncpg://" + url[len(prefix) :]
            break
    else:
        return url
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in DROPPED_PARAMS]
    return urlunsplit(parts._replace(query=urlencode(query)))


def is_local_url(url: str) -> bool:
    return (urlsplit(url).hostname or "") in LOCAL_HOSTS


def connect_args_for(url: str, root_cert: str = "", command_timeout: float | None = None) -> dict:
    # statement_cache_size=0 keeps asyncpg working behind Neon's PgBouncer (transaction mode).
    args: dict = {"statement_cache_size": 0}
    if command_timeout:
        args["command_timeout"] = command_timeout
    if not is_local_url(url):
        # Hosted databases always use verified TLS. Neon's certificates chain to public roots.
        args["ssl"] = ssl.create_default_context(cafile=root_cert or None)
    return args


def get_engine():
    global _engine, _sessionmaker
    if _engine is None:
        settings = get_settings()
        if not settings.database_url:
            raise RuntimeError("Set DATABASE_URL to the Neon pooled Postgres connection string.")
        url = normalize_database_url(settings.database_url)
        # A small bounded pool: reuses TLS connections and caps how many this instance can
        # hold, so a burst of traffic queues briefly instead of exhausting Neon's connection limit.
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
