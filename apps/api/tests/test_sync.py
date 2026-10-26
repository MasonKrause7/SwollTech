import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import headers, make_user

BENCH = "945588d5-76e8-50ff-9b08-5a61982e1c0e"


def upsert(entity: str, payload: dict, base: str | None = None) -> dict:
    return {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": entity,
        "op": "upsert",
        "entity_id": payload["id"],
        "base_updated_at": base,
        "payload": payload,
    }


def delete(entity: str, entity_id: str, base: str | None) -> dict:
    return {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": entity,
        "op": "delete",
        "entity_id": entity_id,
        "base_updated_at": base,
        "payload": {},
    }


async def sync(client, token, mutations, cursor=0):
    response = await client.post("/v1/sync", json={"cursor": cursor, "mutations": mutations}, headers=headers(token))
    assert response.status_code == 200, response.text
    return response.json()


def ids():
    return str(uuid.uuid4())


@pytest.mark.asyncio
async def test_a_phone_can_build_a_whole_plan_offline(client):
    user_id, token = await make_user()
    exercise, reference, workout, item, planned = ids(), ids(), ids(), ids(), ids()
    result = await sync(
        client,
        token,
        [
            upsert("profiles", {"id": str(user_id), "display_name": "Phone", "unit_preference": "kg"}, base=None),
            upsert("exercises", {"id": exercise, "name": "Landmine Press", "primary_muscle": "shoulders", "equipment": "barbell"}),
            upsert("exercise_references", {"id": reference, "exercise_id": BENCH, "weight": 120, "unit": "kg", "noted_on": "2026-10-01"}),
            upsert("workouts", {"id": workout, "name": "Phone plan", "notes": ""}),
            upsert("workout_exercises", {"id": item, "workout_id": workout, "exercise_id": BENCH, "position": 0}),
            upsert("workout_sets", {"id": planned, "workout_exercise_id": item, "position": 0, "kind": "working", "target_reps": 5, "target_percent": 80}),
        ],
    )
    statuses = [entry["status"] for entry in result["applied"]]
    # The profile row already exists, so an upsert without a base is a conflict and returns the server copy.
    assert statuses == ["conflict", "applied", "applied", "applied", "applied", "applied"]
    assert result["applied"][0]["server_row"]["display_name"] != "Phone"
    entities = {change["entity"] for change in result["changes"]}
    assert {"exercises", "exercise_references", "workouts", "workout_exercises", "workout_sets", "profiles"} <= entities
    assert result["cursor"] > 0

    detail = (await client.get(f"/v1/workouts/{workout}", headers=headers(token))).json()
    assert detail["exercises"][0]["sets"][0]["target_percent"] == 80
    started = (await client.post("/v1/sessions", json={"workout_id": workout}, headers=headers(token))).json()
    # 80% of 120 kg, shown in pounds because the profile change above conflicted.
    assert started["exercises"][0]["sets"][0]["target_weight"] == 211.643772
    assert started["exercises"][0]["sets"][0]["target_unit"] == "lb"

    again = await sync(client, token, [], cursor=result["cursor"])
    assert all(change["entity"] != "workouts" for change in again["changes"])


@pytest.mark.asyncio
async def test_profile_updates_with_the_right_base(client):
    user_id, token = await make_user()
    me = (await client.get("/v1/me", headers=headers(token))).json()
    result = await sync(client, token, [upsert("profiles", {"id": str(user_id), "display_name": "Mase", "unit_preference": "kg"}, base=me["updated_at"])])
    assert result["applied"][0]["status"] == "applied"
    assert (await client.get("/v1/me", headers=headers(token))).json()["unit_preference"] == "kg"


@pytest.mark.asyncio
async def test_deletes_cascade_and_show_up_in_the_feed(client):
    _user, token = await make_user()
    workout, item, planned = ids(), ids(), ids()
    created = await sync(
        client,
        token,
        [
            upsert("workouts", {"id": workout, "name": "Gone soon"}),
            upsert("workout_exercises", {"id": item, "workout_id": workout, "exercise_id": BENCH, "position": 0}),
            upsert("workout_sets", {"id": planned, "workout_exercise_id": item, "position": 0, "target_reps": 5}),
        ],
    )
    rows = {entry["server_row"]["id"]: entry["server_row"] for entry in created["applied"]}
    removed = await sync(client, token, [delete("workouts", workout, rows[workout]["updated_at"])], cursor=created["cursor"])
    assert removed["applied"][0]["status"] == "applied"
    deleted = {(change["entity"], change["entity_id"]) for change in removed["changes"] if change["op"] == "delete"}
    assert ("workouts", workout) in deleted
    assert (await client.get(f"/v1/workouts/{workout}", headers=headers(token))).status_code == 404

    twice = await sync(client, token, [delete("workouts", workout, None)])
    assert twice["applied"][0]["status"] == "applied"


@pytest.mark.asyncio
async def test_session_round_trip_and_set_delete(client):
    _user, token = await make_user()
    session, item, first, second = ids(), ids(), ids(), ids()
    now = datetime.now(timezone.utc)
    result = await sync(
        client,
        token,
        [
            upsert("sessions", {"id": session, "name": "Garage", "status": "in_progress", "started_at": (now - timedelta(minutes=20)).isoformat()}),
            upsert("session_exercises", {"id": item, "session_id": session, "exercise_id": BENCH, "position": 0}),
            upsert("session_sets", {"id": first, "session_exercise_id": item, "position": 0, "actual_reps": 5, "actual_weight": 100, "actual_unit": "kg", "completed_at": now.isoformat()}),
            upsert("session_sets", {"id": second, "session_exercise_id": item, "position": 1, "actual_reps": 5, "actual_weight": 100, "actual_unit": "kg", "skipped": True, "completed_at": now.isoformat()}),
        ],
    )
    rows = {entry["server_row"]["id"]: entry["server_row"] for entry in result["applied"]}
    assert rows[second]["completed_at"] is None
    finish = await sync(
        client,
        token,
        [
            upsert("sessions", {"id": session, "name": "Garage", "status": "completed", "started_at": rows[session]["started_at"], "ended_at": now.isoformat()}, base=rows[session]["updated_at"]),
            delete("session_sets", second, rows[second]["updated_at"]),
        ],
    )
    assert [entry["status"] for entry in finish["applied"]] == ["applied", "applied"]
    loaded = (await client.get(f"/v1/sessions/{session}", headers=headers(token))).json()
    assert loaded["status"] == "completed"
    assert [item["id"] for item in loaded["exercises"][0]["sets"]] == [first]


@pytest.mark.asyncio
async def test_bad_changes_are_reported_one_by_one(client):
    _user, token = await make_user()
    _other, other_token = await make_user()
    foreign = ids()
    await sync(client, other_token, [upsert("workouts", {"id": foreign, "name": "Theirs"})])
    good = ids()
    result = await sync(
        client,
        token,
        [
            {"client_mutation_id": ids(), "entity": "nonsense", "op": "upsert", "entity_id": ids(), "base_updated_at": None, "payload": {}},
            upsert("workouts", {"id": foreign, "name": "Hijack"}),
            delete("workouts", foreign, None),
            upsert("workout_exercises", {"id": ids(), "workout_id": foreign, "exercise_id": BENCH, "position": 0}),
            upsert("session_sets", {"id": ids(), "session_exercise_id": ids(), "position": 0}),
            upsert("workouts", {"id": ids(), "name": ""}),
            upsert("session_sets", {"id": ids(), "session_exercise_id": ids(), "position": "first"}),
            delete("profiles", ids(), None),
            upsert("workouts", {"id": good, "name": "Mine"}),
        ],
    )
    statuses = [entry["status"] for entry in result["applied"]]
    assert statuses == ["error"] * 8 + ["applied"]
    assert all(entry.get("detail") for entry in result["applied"][:8])
    theirs = (await client.get(f"/v1/workouts/{foreign}", headers=headers(other_token))).json()
    assert theirs["name"] == "Theirs"
    assert (await client.get(f"/v1/workouts/{good}", headers=headers(token))).status_code == 200


@pytest.mark.asyncio
async def test_custom_exercise_and_reference_lifecycle(client):
    _user, token = await make_user()
    exercise, reference = ids(), ids()
    made = await sync(
        client,
        token,
        [
            upsert("exercises", {"id": exercise, "name": "Belt Squat", "primary_muscle": "quads"}),
            upsert("exercise_references", {"id": reference, "exercise_id": exercise, "weight": 300, "unit": "lb", "noted_on": "2026-10-01"}),
        ],
    )
    rows = {entry["server_row"]["id"]: entry["server_row"] for entry in made["applied"]}
    assert rows[reference]["weight_kg"] == 136.077711
    renamed = await sync(client, token, [upsert("exercises", {"id": exercise, "name": "Belt Squat Machine", "primary_muscle": "quads"}, base=rows[exercise]["updated_at"])])
    assert renamed["applied"][0]["server_row"]["name"] == "Belt Squat Machine"
    gone = await sync(
        client,
        token,
        [
            delete("exercise_references", reference, rows[reference]["updated_at"]),
            delete("exercises", exercise, renamed["applied"][0]["server_row"]["updated_at"]),
        ],
    )
    assert [entry["status"] for entry in gone["applied"]] == ["applied", "applied"]
    names = [item["name"] for item in (await client.get("/v1/exercises", headers=headers(token))).json()]
    assert "Belt Squat Machine" not in names
