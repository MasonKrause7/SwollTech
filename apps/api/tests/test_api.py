import uuid
from datetime import datetime, timedelta, timezone

import pytest

from swolltech.main import app
from tests.conftest import headers, make_user

BENCH = "945588d5-76e8-50ff-9b08-5a61982e1c0e"


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["x-request-id"]


@pytest.mark.asyncio
async def test_cross_user_workout_and_set_are_hidden(client):
    _owner, owner_token = await make_user()
    _other, other_token = await make_user()
    created = await client.post("/v1/workouts", json={"name": "Push"}, headers=headers(owner_token))
    assert created.status_code == 201
    workout_id = created.json()["id"]
    added = await client.post(
        f"/v1/workouts/{workout_id}/exercises",
        json={"exercise_id": BENCH},
        headers=headers(owner_token),
    )
    assert added.status_code == 201
    item_id = added.json()["exercises"][0]["id"]
    planned = await client.post(
        f"/v1/workout-exercises/{item_id}/sets",
        json={"kind": "working", "target_reps": 5, "target_weight": 100, "target_unit": "kg"},
        headers=headers(owner_token),
    )
    assert planned.status_code == 201
    set_id = planned.json()["id"]

    assert (await client.get(f"/v1/workouts/{workout_id}", headers=headers(other_token))).status_code == 404
    listed = await client.get("/v1/workouts", headers=headers(other_token))
    assert listed.json() == []
    patched = await client.patch(
        f"/v1/workout-sets/{set_id}",
        json={"target_reps": 3},
        headers=headers(other_token),
    )
    assert patched.status_code == 404


@pytest.mark.asyncio
async def test_session_resolves_percent_and_progress_skips_warmups(client):
    _user, token = await make_user()
    auth = headers(token)
    assert (await client.patch("/v1/me", json={"unit_preference": "kg"}, headers=auth)).status_code == 200
    reference = await client.put(
        f"/v1/exercises/{BENCH}/reference",
        json={"weight": 100, "unit": "kg", "noted_on": "2026-10-01"},
        headers=auth,
    )
    assert reference.status_code == 200
    workout = (await client.post("/v1/workouts", json={"name": "Bench day"}, headers=auth)).json()
    detail = await client.post(f"/v1/workouts/{workout['id']}/exercises", json={"exercise_id": BENCH}, headers=auth)
    item_id = detail.json()["exercises"][0]["id"]
    await client.post(
        f"/v1/workout-exercises/{item_id}/sets",
        json={"kind": "warmup", "target_reps": 8, "target_weight": 60, "target_unit": "kg", "rest_seconds": 60},
        headers=auth,
    )
    await client.post(
        f"/v1/workout-exercises/{item_id}/sets",
        json={"kind": "working", "target_reps": 5, "target_percent": 80, "rest_seconds": 180},
        headers=auth,
    )
    started = await client.post("/v1/sessions", json={"workout_id": workout["id"]}, headers=auth)
    assert started.status_code == 201
    body = started.json()
    sets = body["exercises"][0]["sets"]
    working = next(item for item in sets if item["kind"] == "working")
    warmup = next(item for item in sets if item["kind"] == "warmup")
    assert working["target_percent"] == 80
    assert working["target_weight"] == 80
    assert working["target_unit"] == "kg"
    assert body["exercises"][0]["previous_sets"] == []

    await client.patch(
        f"/v1/session-sets/{warmup['id']}",
        json={"actual_reps": 8, "actual_weight": 60, "actual_unit": "kg", "completed": True},
        headers=auth,
    )
    await client.patch(
        f"/v1/session-sets/{working['id']}",
        json={"actual_reps": 5, "actual_weight": 80, "actual_unit": "kg", "rpe": 8, "completed": True},
        headers=auth,
    )
    finished = await client.patch(f"/v1/sessions/{body['id']}", json={"status": "completed"}, headers=auth)
    assert finished.status_code == 200

    second = await client.post("/v1/sessions", json={"workout_id": workout["id"]}, headers=auth)
    assert second.json()["exercises"][0]["previous_sets"][0]["actual_reps"] in {5, 8}

    progress = await client.get(f"/v1/exercises/{BENCH}/progress", headers=auth)
    assert progress.status_code == 200
    point = progress.json()["points"][0]
    assert point["best_e1rm_kg"] == 93.333333
    assert point["volume_kg"] == 400.0
    assert point["top_set_percent"] == 80.0
    assert progress.json()["reference_source"] == "training_max"


@pytest.mark.asyncio
async def test_sync_is_idempotent_and_reports_conflicts(client):
    _user, token = await make_user()
    auth = headers(token)
    workout_id = str(uuid.uuid4())
    mutation_id = str(uuid.uuid4())
    payload = {"id": workout_id, "name": "Pull", "notes": "", "archived_at": None}
    mutation = {
        "client_mutation_id": mutation_id,
        "entity": "workouts",
        "op": "upsert",
        "entity_id": workout_id,
        "base_updated_at": None,
        "payload": payload,
    }
    first = await client.post("/v1/sync", json={"cursor": 0, "mutations": [mutation]}, headers=auth)
    assert first.status_code == 200
    assert first.json()["applied"][0]["status"] == "applied"
    again = await client.post("/v1/sync", json={"cursor": 0, "mutations": [mutation]}, headers=auth)
    assert again.json()["applied"][0]["status"] == "duplicate"
    listed = await client.get("/v1/workouts", headers=auth)
    assert len(listed.json()) == 1

    current = listed.json()[0]["updated_at"]
    renamed = await client.patch(f"/v1/workouts/{workout_id}", json={"name": "Pull B"}, headers=auth)
    assert renamed.status_code == 200
    stale = {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": "workouts",
        "op": "upsert",
        "entity_id": workout_id,
        "base_updated_at": current,
        "payload": {"id": workout_id, "name": "Stale", "notes": "", "archived_at": None},
    }
    conflict = await client.post("/v1/sync", json={"cursor": 0, "mutations": [stale]}, headers=auth)
    assert conflict.json()["applied"][0]["status"] == "conflict"
    assert conflict.json()["applied"][0]["server_row"]["name"] == "Pull B"
    final = await client.get(f"/v1/workouts/{workout_id}", headers=auth)
    assert final.json()["name"] == "Pull B"


@pytest.mark.asyncio
async def test_offline_batch_replays_a_logged_session(client):
    _user, token = await make_user()
    auth = headers(token)
    session_id = str(uuid.uuid4())
    exercise_row = str(uuid.uuid4())
    set_id = str(uuid.uuid4())
    started = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    completed = datetime.now(timezone.utc).isoformat()
    mutations = [
        {
            "client_mutation_id": str(uuid.uuid4()),
            "entity": "sessions",
            "op": "upsert",
            "entity_id": session_id,
            "base_updated_at": None,
            "payload": {
                "id": session_id,
                "workout_id": None,
                "name": "Garage",
                "status": "completed",
                "started_at": started,
                "ended_at": completed,
                "notes": "offline",
            },
        },
        {
            "client_mutation_id": str(uuid.uuid4()),
            "entity": "session_exercises",
            "op": "upsert",
            "entity_id": exercise_row,
            "base_updated_at": None,
            "payload": {"id": exercise_row, "session_id": session_id, "exercise_id": BENCH, "position": 0, "notes": ""},
        },
        {
            "client_mutation_id": str(uuid.uuid4()),
            "entity": "session_sets",
            "op": "upsert",
            "entity_id": set_id,
            "base_updated_at": None,
            "payload": {
                "id": set_id,
                "session_exercise_id": exercise_row,
                "position": 0,
                "kind": "working",
                "actual_reps": 5,
                "actual_weight": 225,
                "actual_unit": "lb",
                "notes": "",
                "skipped": False,
                "completed_at": completed,
                "rest_seconds": 180,
            },
        },
    ]
    synced = await client.post("/v1/sync", json={"cursor": 0, "mutations": mutations}, headers=auth)
    assert synced.status_code == 200
    assert [item["status"] for item in synced.json()["applied"]] == ["applied", "applied", "applied"]
    loaded = await client.get(f"/v1/sessions/{session_id}", headers=auth)
    assert loaded.status_code == 200
    performed = loaded.json()["exercises"][0]["sets"][0]
    assert performed["actual_reps"] == 5
    assert performed["weight_kg"] == 102.058283


@pytest.mark.asyncio
async def test_media_presign_is_owner_only(client, _clean):
    _owner, owner_token = await make_user()
    _other, other_token = await make_user()
    auth = headers(owner_token)
    workout = (await client.post("/v1/workouts", json={"name": "Video"}, headers=auth)).json()
    detail = await client.post(f"/v1/workouts/{workout['id']}/exercises", json={"exercise_id": BENCH}, headers=auth)
    item_id = detail.json()["exercises"][0]["id"]
    await client.post(
        f"/v1/workout-exercises/{item_id}/sets",
        json={"kind": "working", "target_reps": 3, "target_weight": 100, "target_unit": "lb"},
        headers=auth,
    )
    started = await client.post("/v1/sessions", json={"workout_id": workout["id"]}, headers=auth)
    set_id = started.json()["exercises"][0]["sets"][0]["id"]
    denied = await client.post(
        f"/v1/session-sets/{set_id}/media/upload-url",
        json={"content_type": "video/mp4", "byte_size": 4},
        headers=headers(other_token),
    )
    assert denied.status_code == 404
    upload = await client.post(
        f"/v1/session-sets/{set_id}/media/upload-url",
        json={"content_type": "video/mp4", "byte_size": 4},
        headers=auth,
    )
    assert upload.status_code == 200
    key = upload.json()["storage_key"]
    assert key.startswith(f"users/")
    _clean.put_bytes(key, b"test", "video/mp4")
    confirmed = await client.post(f"/v1/session-sets/{set_id}/media/confirm", json={}, headers=auth)
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "ready"
    assert confirmed.json()["playback_url"]
    bad = await client.post(
        f"/v1/session-sets/{set_id}/media/upload-url",
        json={"content_type": "text/plain", "byte_size": 4},
        headers=auth,
    )
    assert bad.status_code == 400


def test_openapi_covers_the_contract():
    paths = app.openapi()["paths"]
    expected = [
        "/health",
        "/v1/me",
        "/v1/catalog",
        "/v1/exercises",
        "/v1/exercises/{exercise_id}/progress",
        "/v1/workouts",
        "/v1/workouts/{workout_id}",
        "/v1/sessions",
        "/v1/sessions/{session_id}",
        "/v1/session-sets/{set_id}",
        "/v1/session-sets/{set_id}/media/upload-url",
        "/v1/session-sets/{set_id}/media/confirm",
        "/v1/sync",
    ]
    for path in expected:
        assert path in paths
