"""Safeguards that keep a production deploy from running in an unsafe or broken state."""

import gzip
import ssl
import uuid

import pytest

from swolltech.config import Settings, get_settings
from swolltech.db import connect_args_for
from tests.conftest import headers, make_user

LOCAL_DB = "postgresql+asyncpg://postgres:postgres@localhost:54329/swolltech_dev"
HOSTED_DB = "postgresql+asyncpg://neondb_owner:secret@ep-test-123-pooler.us-west-2.aws.neon.tech/neondb"
AUTH_URL = "https://ep-test-123.neonauth.us-west-2.aws.neon.tech/neondb/auth"


def settings(**values) -> Settings:
    base = {"database_url": LOCAL_DB, "neon_auth_base_url": AUTH_URL, "dev_jwt_secret": "", "cors_origins": "https://app.swolltech.com"}
    base.update(values)
    return Settings(_env_file=None, **base)


@pytest.fixture
def deployed(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("VERCEL_ENV", "production")


@pytest.fixture
def local(monkeypatch):
    for key in ("VERCEL", "VERCEL_ENV", "SWOLLTECH_DEPLOYED"):
        monkeypatch.delenv(key, raising=False)


def test_vercel_is_recognised_as_deployed(local, monkeypatch):
    assert not settings().is_deployed
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("VERCEL_ENV", "preview")
    assert settings().is_deployed
    monkeypatch.setenv("VERCEL_ENV", "development")  # `vercel dev` on a laptop
    assert not settings().is_deployed
    monkeypatch.delenv("VERCEL_ENV")
    assert settings().is_deployed
    monkeypatch.delenv("VERCEL")
    monkeypatch.setenv("SWOLLTECH_DEPLOYED", "1")
    assert settings().is_deployed


def test_a_deploy_needs_neon_auth_and_no_dev_secret(deployed):
    assert any("NEON_AUTH_BASE_URL" in problem for problem in settings(database_url=HOSTED_DB, neon_auth_base_url="", dev_jwt_secret="x" * 40).problems())
    assert any("DEV_JWT_SECRET" in problem for problem in settings(database_url=HOSTED_DB, dev_jwt_secret="x" * 40).problems())


def test_a_deploy_without_redis_warns(deployed):
    assert any("Upstash" in warning for warning in settings(database_url=HOSTED_DB).warnings())
    assert settings(database_url=HOSTED_DB, kv_rest_api_url="https://x.upstash.io", kv_rest_api_token="t").warnings() == []


def test_a_good_production_config_has_no_problems(deployed):
    assert settings(database_url=HOSTED_DB).problems() == []


def test_dev_tokens_work_only_locally_against_a_local_database(local, monkeypatch):
    assert settings(dev_token_enabled=True, dev_jwt_secret="x" * 40).dev_tokens_allowed
    assert settings(dev_token_enabled=True, dev_jwt_secret="x" * 40).problems() == []
    hosted = settings(dev_token_enabled=True, dev_jwt_secret="x" * 40, database_url=HOSTED_DB)
    assert not hosted.dev_tokens_allowed
    assert any("DEV_TOKEN_ENABLED" in problem for problem in hosted.problems())
    monkeypatch.setenv("VERCEL", "1")
    on_vercel = settings(dev_token_enabled=True, dev_jwt_secret="x" * 40)
    assert not on_vercel.dev_tokens_allowed
    assert any("DEV_TOKEN_ENABLED" in problem for problem in on_vercel.problems())


def test_startup_refuses_missing_database_or_token_verification(local):
    assert "DATABASE_URL is not set" in settings(database_url="").problems()
    assert any("verify tokens" in problem for problem in settings(neon_auth_base_url="", dev_jwt_secret="").problems())


def test_a_deploy_must_name_its_web_origin(deployed):
    assert any("CORS_ORIGINS" in problem for problem in settings(database_url=HOSTED_DB, cors_origins="http://localhost:5173").problems())
    assert any("CORS_ORIGINS" in problem for problem in settings(database_url=HOSTED_DB, cors_origins="").problems())


def test_missing_ca_file_is_reported(local):
    assert any("DATABASE_SSL_ROOT_CERT" in problem for problem in settings(database_ssl_root_cert="/nope/ca.crt").problems())


def test_hosted_database_tls_is_always_verified():
    args = connect_args_for(HOSTED_DB, command_timeout=15)
    assert args["command_timeout"] == 15
    assert args["ssl"].verify_mode == ssl.CERT_REQUIRED
    assert args["ssl"].check_hostname is True


@pytest.mark.asyncio
async def test_dev_token_route_stays_closed_against_a_hosted_database(client, local):
    from swolltech.main import app

    app.dependency_overrides[get_settings] = lambda: settings(dev_token_enabled=True, dev_jwt_secret="x" * 40, database_url=HOSTED_DB)
    try:
        response = await client.post("/v1/dev/token", json={"email": "victim@example.com"})
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_settings, None)


@pytest.mark.asyncio
async def test_closed_accounts_lose_access_on_every_route(client):
    _user, token = await make_user()
    auth = headers(token)
    created = await client.post("/v1/workouts", json={"name": "Push"}, headers=auth)
    assert created.status_code == 201
    assert (await client.delete("/v1/me", headers=auth)).status_code == 204
    for method, path, body in [
        ("GET", "/v1/workouts", None),
        ("POST", "/v1/workouts", {"name": "Ghost"}),
        ("GET", "/v1/stats/log", None),
        ("GET", "/v1/stats/overview", None),
        ("POST", "/v1/sync", {"cursor": 0, "mutations": []}),
    ]:
        response = await client.request(method, path, json=body, headers=auth)
        assert response.status_code == 401, f"{method} {path} -> {response.status_code}"


@pytest.mark.asyncio
async def test_large_responses_are_gzipped(client):
    _user, token = await make_user()
    response = await client.get("/v1/catalog", headers={**headers(token), "Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"
    # httpx decodes it for us; the body is still the full catalog.
    assert len(response.json()["exercises"]) > 10
    assert gzip  # imported for clarity: the transport handles decompression


@pytest.mark.asyncio
async def test_upload_urls_are_locked_to_the_declared_size_and_bad_uploads_are_removed(client, _clean):
    _user, token = await make_user()
    auth = headers(token)
    workout = (await client.post("/v1/workouts", json={"name": "Clip"}, headers=auth)).json()
    detail = (await client.post(f"/v1/workouts/{workout['id']}/exercises", json={"exercise_id": "945588d5-76e8-50ff-9b08-5a61982e1c0e"}, headers=auth)).json()
    item = detail["exercises"][0]["id"]
    await client.post(f"/v1/workout-exercises/{item}/sets", json={"kind": "working", "target_reps": 3, "target_weight": 100, "target_unit": "lb"}, headers=auth)
    started = (await client.post("/v1/sessions", json={"workout_id": workout["id"]}, headers=auth)).json()
    set_id = started["exercises"][0]["sets"][0]["id"]

    upload = (await client.post(f"/v1/session-sets/{set_id}/media/upload-url", json={"content_type": "video/mp4", "byte_size": 4}, headers=auth)).json()
    assert "size=4" in upload["upload_url"]
    key = upload["storage_key"]
    _clean.put_bytes(key, b"far more than four bytes", "video/mp4")
    confirmed = await client.post(f"/v1/session-sets/{set_id}/media/confirm", json={}, headers=auth)
    assert confirmed.status_code == 400
    assert key not in _clean.objects


@pytest.mark.asyncio
async def test_a_fresh_phone_pulls_a_large_history_in_one_request(client):
    _user, token = await make_user()
    auth = headers(token)
    session_id, item_id = str(uuid.uuid4()), str(uuid.uuid4())

    def upsert(entity, payload):
        return {"client_mutation_id": str(uuid.uuid4()), "entity": entity, "op": "upsert", "entity_id": payload["id"], "base_updated_at": None, "payload": payload}

    batch = [
        upsert("sessions", {"id": session_id, "name": "Big", "status": "in_progress", "started_at": "2026-10-01T12:00:00+00:00"}),
        upsert("session_exercises", {"id": item_id, "session_id": session_id, "exercise_id": "945588d5-76e8-50ff-9b08-5a61982e1c0e", "position": 0}),
    ]
    batch += [upsert("session_sets", {"id": str(uuid.uuid4()), "session_exercise_id": item_id, "position": index, "actual_reps": 5, "actual_weight": 100, "actual_unit": "kg"}) for index in range(150)]
    assert (await client.post("/v1/sync", json={"cursor": 0, "mutations": batch}, headers=auth)).status_code == 200
    await client.delete(f"/v1/sessions/{session_id}", headers=auth)

    pulled = (await client.post("/v1/sync", json={"cursor": 0, "mutations": []}, headers=auth)).json()
    by_entity = {}
    for change in pulled["changes"]:
        by_entity.setdefault(change["entity"], set()).add(change["op"])
    # The deleted session and everything under it arrive as deletes, with no stale rows.
    assert by_entity["sessions"] == {"delete"}
    assert by_entity["session_sets"] == {"delete"}
    assert all(change["row"] is None for change in pulled["changes"] if change["op"] == "delete")
    assert any(change["entity"] == "profiles" and change["row"] for change in pulled["changes"])


@pytest.mark.asyncio
async def test_startup_refuses_an_unsafe_config(monkeypatch, deployed):
    import swolltech.main as main

    monkeypatch.setattr(main, "get_settings", lambda: settings(database_url=HOSTED_DB, dev_token_enabled=True))
    with pytest.raises(RuntimeError, match="Refusing to start: DEV_TOKEN_ENABLED"):
        async with main.lifespan(main.app):
            pass


@pytest.mark.asyncio
async def test_startup_accepts_a_good_config(monkeypatch, deployed):
    import swolltech.main as main

    monkeypatch.setattr(main, "get_settings", lambda: settings(database_url=HOSTED_DB))
    monkeypatch.setattr(main, "dispose_engine", lambda: _noop())
    async with main.lifespan(main.app):
        pass


async def _noop():
    return None
