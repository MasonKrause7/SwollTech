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
if "supabase.co" in _database_url or "pooler.supabase.com" in _database_url:
    raise RuntimeError("TEST_DATABASE_URL points at Supabase. Tests rebuild the schema, so use a local database.")
os.environ["DATABASE_URL"] = _database_url
os.environ["SUPABASE_JWT_SECRET"] = os.environ.get("TEST_JWT_SECRET", "test-secret-test-secret-test-secret-12")
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_JWKS_URL"] = ""
os.environ["SERVICE_ROLE_KEY"] = ""
os.environ["S3_BUCKET"] = ""
os.environ["DEV_TOKEN_ENABLED"] = "false"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

from swolltech.db import dispose_engine, get_engine
from swolltech.main import app
from swolltech.routes import set_storage
from swolltech.storage import MemoryStorage
from tests.schema_loader import apply_schema

PSYCOPG_DSN = _database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
SECRET = os.environ["SUPABASE_JWT_SECRET"]


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
        await conn.execute(text("delete from auth.users"))
    await dispose_engine()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


async def make_user(email: str | None = None) -> tuple[uuid.UUID, str]:
    user_id = uuid.uuid4()
    address = email or f"{user_id}@swolltech.test"
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "insert into auth.users (id, email, raw_user_meta_data) "
                "values (:id, :email, '{}'::jsonb)"
            ),
            {"id": user_id, "email": address},
        )
    return user_id, token_for(user_id)


def token_for(user_id: uuid.UUID, *, expires_in: int = 3600, **extra) -> str:
    claims = {"sub": str(user_id), "aud": "authenticated", "role": "authenticated", "exp": int(time.time()) + expires_in}
    claims.update(extra)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, SECRET, algorithm="HS256")


def headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
