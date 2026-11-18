import os
import time
import uuid

import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from swolltech.db import normalize_database_url


LOCAL_DEFAULT = "postgresql+asyncpg://postgres:postgres@localhost:54329/swolltech_test"

# Tests never read apps/api/.env. They only run against TEST_DATABASE_URL, which
# must be a disposable local database because the suite drops and rebuilds it.
_database_url = normalize_database_url(os.environ.get("TEST_DATABASE_URL", LOCAL_DEFAULT))
if any(marker in _database_url for marker in ("supabase.co", "supabase.com", "neon.tech")):
    raise RuntimeError("TEST_DATABASE_URL points at a hosted database. Tests rebuild the schema, so use a local one.")
os.environ["DATABASE_URL"] = _database_url
os.environ["DEV_JWT_SECRET"] = os.environ.get("TEST_JWT_SECRET", "test-secret-test-secret-test-secret-12")
os.environ["NEON_AUTH_BASE_URL"] = ""
os.environ["NEON_AUTH_JWKS_URL"] = ""
for _key in ("KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "VERCEL", "VERCEL_ENV", "SWOLLTECH_DEPLOYED"):
    os.environ.pop(_key, None)
os.environ["S3_BUCKET"] = ""
os.environ["DEV_TOKEN_ENABLED"] = "false"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from swolltech.db import dispose_engine, get_engine
from swolltech.main import app
from swolltech.routes import set_storage
from swolltech.storage import MemoryStorage
from tests.schema_loader import apply_schema

PSYCOPG_DSN = _database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
SECRET = os.environ["DEV_JWT_SECRET"]


@pytest.fixture(scope="session", autouse=True)
def _schema():
    apply_schema(PSYCOPG_DSN)


@pytest.fixture(autouse=True)
async def _clean():
    storage = MemoryStorage()
    set_storage(storage)
    yield storage
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(text('delete from neon_auth."user"'))
        await conn.execute(text("delete from public.deleted_accounts"))
        for (uid,) in (await conn.execute(text("select id from public.profiles"))).all():
            await conn.execute(text("select app_private.delete_user_data(:id)"), {"id": uid})
    await dispose_engine()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


async def make_user(email: str | None = None) -> tuple[uuid.UUID, str]:
    """A signed-up user: a row in (the stand-in for) Neon Auth's user table, plus a token.
    The API creates the profile on the first request, as it does in production."""
    user_id = uuid.uuid4()
    address = email or f"{user_id}@swolltech.test"
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            text('insert into neon_auth."user" (id, email, name) values (:id, :email, \'\')'),
            {"id": user_id, "email": address},
        )
        await conn.execute(text("insert into neon_auth.session (\"userId\") values (:id)"), {"id": user_id})
    return user_id, token_for(user_id, email=address)


def token_for(user_id: uuid.UUID, *, expires_in: int = 3600, **extra) -> str:
    now = int(time.time())
    claims = {"sub": str(user_id), "aud": "swolltech-dev", "iat": now, "exp": now + expires_in}
    claims.update(extra)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, SECRET, algorithm="HS256")


def headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
