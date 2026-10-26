import ssl

import pytest

from swolltech.db import connect_args_for, normalize_database_url
from tests.schema_loader import apply_schema


def test_database_url_accepts_libpq_scheme():
    converted = normalize_database_url("postgresql://postgres:secret@db.example.supabase.co:5432/postgres")
    assert converted.startswith("postgresql+asyncpg://")
    assert "secret" in converted


def test_hosted_connections_use_ssl():
    args = connect_args_for("postgresql+asyncpg://postgres:secret@db.example.supabase.co:5432/postgres")
    assert args["statement_cache_size"] == 0
    assert args["ssl"].verify_mode == ssl.CERT_NONE
    assert args["ssl"].check_hostname is False


def test_local_connections_skip_ssl():
    args = connect_args_for("postgresql+asyncpg://postgres:postgres@localhost:5432/swolltech")
    assert "ssl" not in args


def test_schema_rebuild_refuses_supabase():
    with pytest.raises(RuntimeError, match="Refusing to rebuild"):
        apply_schema("postgresql://postgres:secret@db.example.supabase.co:5432/postgres")


def test_engine_accepts_the_url_supabase_copies(monkeypatch):
    import swolltech.db as db
    from swolltech.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres.ref:secret@aws-0-us-west-2.pooler.supabase.com:5432/postgres")
    monkeypatch.setattr(db, "_engine", None)
    try:
        engine = db.get_engine()
        assert engine.url.drivername == "postgresql+asyncpg"
    finally:
        db._engine = None
        db._sessionmaker = None
        get_settings.cache_clear()
