"""Sync must never get stuck or lose a change because of one bad value, a name clash,
a huge history or a hiccup fetching Neon Auth's keys."""

import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import jwt
import pytest

from swolltech import auth
from swolltech.services import syncing
from tests.conftest import headers, make_user, token_for
from tests.test_auth_neon import JWKS_URL, neon, sign  # noqa: F401  (fixture)
from tests.test_sync import BENCH, ids, sync, upsert


def started() -> str:
    return datetime.now(timezone.utc).isoformat()


async def session_tree(client, token):
    session, item = ids(), ids()
    result = await sync(
        client,
        token,
        [
            upsert("sessions", {"id": session, "name": "Garage", "status": "in_progress", "started_at": started()}),
            upsert("session_exercises", {"id": item, "session_id": session, "exercise_id": BENCH, "position": 0}),
        ],
    )
    assert [entry["status"] for entry in result["applied"]] == ["applied", "applied"]
    return session, item


def a_set(item: str, **values) -> dict:
    return {"id": ids(), "session_exercise_id": item, "position": 0, "kind": "working", **values}


@pytest.mark.asyncio
async def test_out_of_range_values_are_refused_per_change_not_per_request(client):
    _user, token = await make_user()
    _session, item = await session_tree(client, token)
    bad = [
        a_set(item, actual_weight=1e9, actual_unit="lb", actual_reps=5),
        a_set(item, actual_weight=100, actual_unit="kg", actual_reps=100_000),
        a_set(item, actual_weight=100, actual_unit="kg", actual_reps=5, rpe=11),
        a_set(item, rest_seconds=86_400),
        a_set(item, target_percent=500),
        a_set(item, notes="x" * 2001),
        a_set(item, position=2**40),
    ]
    good = a_set(item, actual_weight=2000, actual_unit="lb", actual_reps=1)
    result = await sync(client, token, [upsert("session_sets", row) for row in bad] + [upsert("session_sets", good)])
    statuses = [entry["status"] for entry in result["applied"]]
    assert statuses == ["error"] * len(bad) + ["applied"]
    assert all(entry["detail"].startswith("Invalid") for entry in result["applied"][:-1])
    # 2000 lb still fits weight_kg numeric(12, 6).
    assert result["applied"][-1]["server_row"]["weight_kg"] == pytest.approx(907.18474)


@pytest.mark.asyncio
async def test_rest_endpoints_have_the_same_bounds(client):
    _user, token = await make_user()
    auth_headers = headers(token)
    workout = (await client.post("/v1/workouts", json={"name": "Push"}, headers=auth_headers)).json()
    assert (await client.post("/v1/workouts", json={"name": "Notes", "notes": "x" * 2001}, headers=auth_headers)).status_code == 422
    item = (await client.post(f"/v1/workouts/{workout['id']}/exercises", json={"exercise_id": BENCH}, headers=auth_headers)).json()["exercises"][0]
    too_heavy = await client.post(f"/v1/workout-exercises/{item['id']}/sets", json={"target_weight": 99999, "target_unit": "kg"}, headers=auth_headers)
    assert too_heavy.status_code == 422
    too_long_rest = await client.post(f"/v1/workout-exercises/{item['id']}/sets", json={"rest_seconds": 99999}, headers=auth_headers)
    assert too_long_rest.status_code == 422


@pytest.mark.asyncio
async def test_a_database_refusal_is_one_error_and_the_rest_of_the_batch_lands(client):
    _user, token = await make_user()
    _session, item = await session_tree(client, token)
    # Passes validation but breaks a check constraint (a target weight needs a unit) ...
    constraint = a_set(item, target_weight=100)
    # ... and text Postgres cannot store at all (a NUL byte), which is a DataError.
    nul = a_set(item, notes="bad\x00byte")
    good = a_set(item, actual_weight=60, actual_unit="kg", actual_reps=8)
    result = await sync(client, token, [upsert("session_sets", constraint), upsert("session_sets", nul), upsert("session_sets", good)])
    assert [entry["status"] for entry in result["applied"]] == ["error", "error", "applied"]
    assert result["applied"][0]["detail"] == "Could not save that change"
    # The next sync is not poisoned.
    again = await sync(client, token, [upsert("session_sets", a_set(item, actual_weight=70, actual_unit="kg", actual_reps=5))], cursor=result["cursor"])
    assert again["applied"][0]["status"] == "applied"


@pytest.mark.asyncio
async def test_unexpected_database_errors_are_reported_per_change(client, monkeypatch):
    from sqlalchemy.exc import DataError

    _user, token = await make_user()
    real = syncing.apply_upsert

    async def flaky(db, user_id, mutation):
        if mutation.payload.get("name") == "Boom":
            raise DataError("insert", {}, Exception("numeric field overflow"))
        return await real(db, user_id, mutation)

    monkeypatch.setattr(syncing, "apply_upsert", flaky)
    boom = upsert("workouts", {"id": ids(), "name": "Boom"})
    fine = upsert("workouts", {"id": ids(), "name": "Fine"})
    result = await sync(client, token, [boom, fine])
    assert [entry["status"] for entry in result["applied"]] == ["error", "applied"]


@pytest.mark.asyncio
async def test_a_custom_exercise_made_twice_offline_merges_into_the_first(client):
    _user, token = await make_user()
    first, second, session, item = ids(), ids(), ids(), ids()
    made = await sync(client, token, [upsert("exercises", {"id": first, "name": "Cable Fly", "primary_muscle": "chest"})])
    assert made["applied"][0]["status"] == "applied"

    # A second phone made the same exercise offline and logged a session with it.
    result = await sync(
        client,
        token,
        [
            upsert("exercises", {"id": second, "name": "  cable fly ", "primary_muscle": "chest"}),
            upsert("sessions", {"id": session, "name": "Chest", "status": "in_progress", "started_at": started()}),
            upsert("session_exercises", {"id": item, "session_id": session, "exercise_id": second, "position": 0}),
        ],
    )
    merged, _session, logged = result["applied"]
    assert merged["status"] == "merged"
    assert merged["server_row"]["id"] == first
    # Later changes in the same batch follow the merge instead of failing with "Not found".
    assert logged["status"] == "applied"
    assert logged["server_row"]["exercise_id"] == first
    # Replaying the merged change is a duplicate, not a new error.
    replay = await sync(client, token, [{**upsert("exercises", {"id": second, "name": "Cable Fly"}), "client_mutation_id": merged["client_mutation_id"]}])
    assert replay["applied"][0]["status"] == "duplicate"


@pytest.mark.asyncio
async def test_a_custom_exercise_named_like_a_catalog_one_resolves_to_the_catalog(client):
    _user, token = await make_user()
    result = await sync(client, token, [upsert("exercises", {"id": ids(), "name": "bench press"})])
    assert result["applied"][0]["status"] == "merged"
    assert result["applied"][0]["server_row"]["id"] == BENCH


@pytest.mark.asyncio
async def test_pull_pages_through_a_long_history_without_missing_a_row(client):
    _user, token = await make_user()
    workouts = [ids() for _ in range(7)]
    first = await sync(client, token, [upsert("workouts", {"id": workout, "name": f"Plan {n}"}) for n, workout in enumerate(workouts)])
    # Edit an early row again so its latest change is newer than the others.
    renamed = first["applied"][0]["server_row"]
    await sync(client, token, [upsert("workouts", {"id": workouts[0], "name": "Plan zero"}, base=renamed["updated_at"])])

    seen: dict[str, dict] = {}
    cursor, pages = 0, 0
    while True:
        response = await client.post("/v1/sync", json={"cursor": cursor, "mutations": [], "limit": 3}, headers=headers(token))
        assert response.status_code == 200
        body = response.json()
        pages += 1
        assert len(body["changes"]) <= 3
        for change in body["changes"]:
            if change["entity"] == "workouts":
                seen[change["entity_id"]] = change["row"]
        assert body["cursor"] >= cursor
        cursor = body["cursor"]
        if not body["has_more"]:
            break
        assert pages < 10
    assert pages >= 3
    assert set(seen) == set(workouts)
    assert seen[workouts[0]]["name"] == "Plan zero"
    # Caught up: nothing more, and the cursor stays put.
    done = await sync(client, token, [], cursor=cursor)
    assert done["changes"] == [] and done["cursor"] == cursor and done["has_more"] is False


@pytest.mark.asyncio
async def test_clients_that_send_no_limit_get_everything_in_one_go(client):
    _user, token = await make_user()
    await sync(client, token, [upsert("workouts", {"id": ids(), "name": f"Plan {n}"}) for n in range(5)])
    body = await sync(client, token, [])
    assert len([change for change in body["changes"] if change["entity"] == "workouts"]) == 5
    assert body["has_more"] is False


@pytest.mark.asyncio
async def test_a_jwks_outage_is_a_503_not_a_sign_out(client, neon, monkeypatch):  # noqa: F811
    private_key, _settings = neon

    class Down:
        def get_signing_key_from_jwt(self, token):
            raise jwt.PyJWKClientConnectionError("Fail to fetch data from the url, err: timed out")

    monkeypatch.setitem(auth._jwks_clients, JWKS_URL, Down())
    response = await client.get("/v1/me", headers=headers(sign(private_key, uuid.uuid4())))
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_an_unknown_signing_key_is_still_a_401(client, neon):  # noqa: F811
    private_key, _settings = neon
    response = await client.get("/v1/me", headers=headers(sign(private_key, uuid.uuid4(), kid="someone-else")))
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_a_phone_clock_a_little_behind_is_tolerated(client, neon):  # noqa: F811
    private_key, _settings = neon
    expired_90s_ago = int(time.time()) - 90
    assert (await client.get("/v1/me", headers=headers(sign(private_key, uuid.uuid4(), exp=expired_90s_ago)))).status_code == 200
    long_gone = int(time.time()) - 600
    assert (await client.get("/v1/me", headers=headers(sign(private_key, uuid.uuid4(), exp=long_gone)))).status_code == 401


@pytest.mark.asyncio
async def test_dev_tokens_get_the_same_clock_slack(client):
    user, _token = await make_user()
    assert (await client.get("/v1/me", headers=headers(token_for(user, expires_in=-90)))).status_code == 200
    assert (await client.get("/v1/me", headers=headers(token_for(user, expires_in=-600)))).status_code == 401


def test_docs_are_hidden_on_a_deployed_host_but_the_schema_still_builds():
    script = (
        "import json; from swolltech.main import app; "
        "print(json.dumps({'docs': app.docs_url, 'redoc': app.redoc_url, 'openapi': app.openapi_url, 'paths': len(app.openapi()['paths'])}))"
    )
    api_dir = Path(__file__).resolve().parents[1]
    base = {key: value for key, value in os.environ.items() if key not in ("VERCEL", "VERCEL_ENV", "SWOLLTECH_DEPLOYED")}

    def run(extra: dict) -> dict:
        output = subprocess.run([sys.executable, "-c", script], cwd=api_dir, env={**base, **extra}, capture_output=True, text=True, check=True)
        return json.loads(output.stdout.strip().splitlines()[-1])

    deployed = run({"VERCEL": "1", "VERCEL_ENV": "production"})
    assert deployed["docs"] is None and deployed["redoc"] is None and deployed["openapi"] is None
    assert deployed["paths"] > 10
    local = run({})
    assert local["docs"] == "/docs" and local["openapi"] == "/openapi.json"
