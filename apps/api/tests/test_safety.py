import ssl

import pytest

from swolltech.db import connect_args_for, normalize_database_url
from tests.schema_loader import apply_schema


NEON_URL = "postgres://neondb_owner:secret@ep-x-123-pooler.c-5.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require"


def test_database_url_accepts_the_neon_url_vercel_sets():
    converted = normalize_database_url(NEON_URL)
    assert converted.startswith("postgresql+asyncpg://")
    assert "secret" in converted
    # libpq-only options are dropped; TLS is configured in connect_args instead.
    assert "sslmode" not in converted and "channel_binding" not in converted


def test_hosted_connections_use_verified_ssl():
    args = connect_args_for(normalize_database_url(NEON_URL))
    assert args["statement_cache_size"] == 0
    assert args["ssl"].verify_mode == ssl.CERT_REQUIRED
    assert args["ssl"].check_hostname is True


def test_local_connections_skip_ssl():
    args = connect_args_for("postgresql+asyncpg://postgres:postgres@localhost:5432/swolltech")
    assert "ssl" not in args


def test_schema_rebuild_refuses_hosted_databases():
    for url in (NEON_URL, "postgresql://postgres:secret@db.example.supabase.co:5432/postgres"):
        with pytest.raises(RuntimeError, match="Refusing to rebuild"):
            apply_schema(url)


def test_engine_accepts_the_url_neon_hands_out(monkeypatch):
    import swolltech.db as db
    from swolltech.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("DATABASE_URL", NEON_URL)
    monkeypatch.setattr(db, "_engine", None)
    try:
        engine = db.get_engine()
        assert engine.url.drivername == "postgresql+asyncpg"
    finally:
        db._engine = None
        db._sessionmaker = None
        get_settings.cache_clear()
