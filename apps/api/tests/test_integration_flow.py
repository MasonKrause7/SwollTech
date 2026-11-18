"""End-to-end API flows: one lifter's whole life in the app, through the real routes and database.

Unit-style tests elsewhere check each route on its own. These walk the flows a real user
takes, with the web client (REST) and the phone (offline sync) writing into the same
account, and check that every read model (history, summary, progress, overview, the
analytics log, the sync feed) agrees afterwards.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import headers, make_user

BENCH = "945588d5-76e8-50ff-9b08-5a61982e1c0e"
SQUAT = "df00b70c-0d32-5048-8e57-2e8af0f85e22"


def upsert(entity: str, payload: dict, base: str | None = None) -> dict:
    return {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": entity,
        "op": "upsert",
        "entity_id": payload["id"],
        "base_updated_at": base,
        "payload": payload,
    }


async def ok(response, status=200):
    assert response.status_code == status, f"{response.request.method} {response.request.url}: {response.status_code} {response.text}"
    return response.json() if response.status_code != 204 else None


async def web_workout(client, auth, name, exercise, sets):
    """Plans a workout the way the web editor does: create, add an exercise, add each set."""
    workout = await ok(await client.post("/v1/workouts", json={"name": name}, headers=auth), 201)
    detail = await ok(await client.post(f"/v1/workouts/{workout['id']}/exercises", json={"exercise_id": exercise}, headers=auth), 201)
    item = detail["exercises"][-1]["id"]
    await ok(await client.post(f"/v1/workout-exercises/{item}/sets", json={"kind": "warmup", "target_reps": 8, "target_weight": 40, "target_unit": "kg"}, headers=auth), 201)
    for reps, weight in sets:
        await ok(await client.post(f"/v1/workout-exercises/{item}/sets", json={"kind": "working", "target_reps": reps, "target_weight": weight, "target_unit": "kg"}, headers=auth), 201)
    return workout["id"]


async def web_session(client, auth, workout_id, performed, *, finish=True):
    """Starts from a workout and logs sets the way the guided web session does."""
    started = await ok(await client.post("/v1/sessions", json={"workout_id": workout_id}, headers=auth), 201)
    sets = [item for item in started["exercises"][0]["sets"] if item["kind"] == "working"]
    for target, (reps, weight) in zip(sets, performed):
        await ok(
            await client.patch(
                f"/v1/session-sets/{target['id']}",
                json={"actual_reps": reps, "actual_weight": weight, "actual_unit": "kg", "completed": True},
                headers=auth,
            )
        )
    if finish:
        await ok(await client.patch(f"/v1/sessions/{started['id']}", json={"status": "completed"}, headers=auth))
    return started


@pytest.mark.asyncio
async def test_plan_train_review_across_web_and_phone(client):
    _user, token = await make_user("flow@swolltech.test")
    auth = headers(token)

    # Profile and units.
    me = await ok(await client.get("/v1/me", headers=auth))
    assert me["unit_preference"] == "lb"
    await ok(await client.patch("/v1/me", json={"unit_preference": "kg"}, headers=auth))

    # Plan a workout on the web and put it on the calendar.
    push = await web_workout(client, auth, "Push", BENCH, [(5, 100), (5, 100), (5, 100)])
    today = datetime.now(timezone.utc).date()
    planned = await ok(await client.post("/v1/schedule", json={"workout_id": push, "scheduled_on": today.isoformat(), "repeat_weeks": 1}, headers=auth), 201)
    assert len(planned) == 2

    # Session 1 on the web: the guided session is prefilled from the plan, warmups included.
    first = await web_session(client, auth, push, [(5, 100), (5, 100), (5, 100)])
    kinds = [item["kind"] for item in first["exercises"][0]["sets"]]
    assert kinds == ["warmup", "working", "working", "working"]
    assert first["exercises"][0]["sets"][1]["target_weight"] == 100
    summary = await ok(await client.get(f"/v1/sessions/{first['id']}/summary", headers=auth))
    assert summary["sets"] == 3 and summary["volume_kg"] == 1500.0 and summary["records"] == []

    # Session 2 on the web beats it: a record.
    second = await web_session(client, auth, push, [(5, 110), (5, 110), (4, 110)])
    summary = await ok(await client.get(f"/v1/sessions/{second['id']}/summary", headers=auth))
    assert [record["exercise_name"] for record in summary["records"]] == ["Bench Press"]

    # Session 3 is logged on a phone in the garage with no signal, then synced.
    session_id, item_id = str(uuid.uuid4()), str(uuid.uuid4())
    when = datetime.now(timezone.utc) - timedelta(hours=2)
    phone = [
        upsert("sessions", {"id": session_id, "name": "Garage squats", "status": "in_progress", "started_at": when.isoformat()}),
        upsert("session_exercises", {"id": item_id, "session_id": session_id, "exercise_id": SQUAT, "position": 0}),
    ]
    for position, (reps, weight) in enumerate([(5, 140), (5, 140), (5, 140)]):
        phone.append(
            upsert(
                "session_sets",
                {"id": str(uuid.uuid4()), "session_exercise_id": item_id, "position": position, "kind": "working", "actual_reps": reps, "actual_weight": weight, "actual_unit": "kg", "completed_at": (when + timedelta(minutes=3 * position)).isoformat()},
            )
        )
    result = await ok(await client.post("/v1/sync", json={"cursor": 0, "mutations": phone}, headers=auth))
    assert {entry["status"] for entry in result["applied"]} == {"applied"}
    session_row = next(entry["server_row"] for entry in result["applied"] if entry["server_row"]["id"] == session_id)
    finished = await ok(
        await client.post(
            "/v1/sync",
            json={"cursor": result["cursor"], "mutations": [upsert("sessions", {"id": session_id, "name": "Garage squats", "status": "completed", "started_at": session_row["started_at"], "ended_at": (when + timedelta(minutes=40)).isoformat()}, base=session_row["updated_at"])]},
            headers=auth,
        )
    )
    assert finished["applied"][0]["status"] == "applied"

    # An unfinished session never counts.
    await web_session(client, auth, push, [(1, 500)], finish=False)

    # History lists all three finished sessions plus the one in progress.
    history = await ok(await client.get("/v1/sessions", headers=auth))
    assert sorted(row["status"] for row in history) == ["completed", "completed", "completed", "in_progress"]
    assert len(await ok(await client.get("/v1/sessions", params={"status": "completed"}, headers=auth))) == 3

    # Every read model agrees on what was trained.
    overview = await ok(await client.get("/v1/stats/overview", params={"tz": "UTC"}, headers=auth))
    assert overview["totals"]["sessions"] == 3
    assert overview["totals"]["sets"] == 9
    assert overview["totals"]["records"] == 1
    assert overview["totals"]["volume_kg"] == pytest.approx(1500 + 110 * 14 + 140 * 15)
    assert {row["exercise_name"] for row in overview["exercises"]} == {"Bench Press", "Back Squat"}

    log = await ok(await client.get("/v1/stats/log", headers=auth))
    assert len(log["sessions"]) == 3
    assert len(log["sets"]) == 9
    assert all(row["weight_kg"] < 500 for row in log["sets"]), "warmups and unfinished sessions stay out"
    assert sum(row["weight_kg"] * row["reps"] for row in log["sets"]) == pytest.approx(overview["totals"]["volume_kg"])
    assert {row["id"] for row in log["sessions"]} == {first["id"], second["id"], session_id}

    progress = await ok(await client.get(f"/v1/exercises/{BENCH}/progress", headers=auth))
    assert [point["top_set_weight_kg"] for point in progress["points"]] == [100, 110]
    assert progress["reference_source"] == "estimated"

    # A training max changes what "% of max" is measured against.
    await ok(await client.put(f"/v1/exercises/{BENCH}/reference", json={"weight": 130, "unit": "kg", "noted_on": today.isoformat()}, headers=auth))
    progress = await ok(await client.get(f"/v1/exercises/{BENCH}/progress", headers=auth))
    assert progress["reference_source"] == "training_max"
    assert progress["points"][-1]["top_set_percent"] == pytest.approx(110 / 130 * 100)

    # The phone catches up on everything the web did through the sync feed.
    feed = await ok(await client.post("/v1/sync", json={"cursor": 0, "mutations": []}, headers=auth))
    entities = {change["entity"] for change in feed["changes"]}
    assert {"workouts", "sessions", "session_sets"} <= entities

    # Deleting a session on the web takes it out of every read model.
    await ok(await client.delete(f"/v1/sessions/{second['id']}", headers=auth), 204)
    overview = await ok(await client.get("/v1/stats/overview", headers=auth))
    assert overview["totals"]["sessions"] == 2
    assert overview["totals"]["records"] == 0
    log = await ok(await client.get("/v1/stats/log", headers=auth))
    assert second["id"] not in {row["id"] for row in log["sessions"]}
    assert len(log["sets"]) == 6

    # Closing the account removes the lifter entirely.
    await ok(await client.delete("/v1/me", headers=auth), 204)
    assert (await client.get("/v1/stats/log", headers=auth)).status_code == 401


@pytest.mark.asyncio
async def test_two_lifters_never_mix_through_any_flow(client):
    _a, token_a = await make_user()
    _b, token_b = await make_user()
    a, b = headers(token_a), headers(token_b)
    push = await web_workout(client, a, "Push", BENCH, [(5, 100)])
    started = await web_session(client, a, push, [(5, 100)])

    # Nothing of A's can be read, changed, scheduled, started, summarized or synced by B.
    assert (await client.get(f"/v1/workouts/{push}", headers=b)).status_code == 404
    assert (await client.post("/v1/sessions", json={"workout_id": push}, headers=b)).status_code == 404
    assert (await client.post("/v1/schedule", json={"workout_id": push, "scheduled_on": "2026-12-01"}, headers=b)).status_code == 404
    assert (await client.get(f"/v1/sessions/{started['id']}/summary", headers=b)).status_code == 404
    assert (await client.patch(f"/v1/session-sets/{started['exercises'][0]['sets'][1]['id']}", json={"actual_reps": 99}, headers=b)).status_code == 404
    assert (await client.delete(f"/v1/sessions/{started['id']}", headers=b)).status_code == 404
    hijack = await ok(
        await client.post(
            "/v1/sync",
            json={"cursor": 0, "mutations": [upsert("session_exercises", {"id": str(uuid.uuid4()), "session_id": started["id"], "exercise_id": BENCH, "position": 1})]},
            headers=b,
        )
    )
    assert hijack["applied"][0]["status"] != "applied"

    assert (await ok(await client.get("/v1/stats/log", headers=b))) == {"sessions": [], "sets": []}
    assert (await ok(await client.get("/v1/stats/overview", headers=b)))["totals"]["sessions"] == 0
    feed = await ok(await client.post("/v1/sync", json={"cursor": 0, "mutations": []}, headers=b))
    assert all(change["entity"] not in {"workouts", "sessions", "session_sets"} for change in feed["changes"])

    # And A's data is untouched by B's attempts.
    log = await ok(await client.get("/v1/stats/log", headers=a))
    assert [row["reps"] for row in log["sets"]] == [5]


@pytest.mark.asyncio
async def test_long_history_stays_fast_and_complete(client):
    """A year and a half of training (about the seeded demo account) through the analytics feed."""
    _user, token = await make_user()
    auth = headers(token)
    start = datetime.now(timezone.utc) - timedelta(weeks=78)
    mutations = []
    expected_sets = 0
    for week in range(78):
        for day in (0, 2, 4):
            session_id, item_id = str(uuid.uuid4()), str(uuid.uuid4())
            when = start + timedelta(weeks=week, days=day)
            mutations.append(upsert("sessions", {"id": session_id, "name": "Lift", "status": "completed", "started_at": when.isoformat(), "ended_at": (when + timedelta(hours=1)).isoformat()}))
            mutations.append(upsert("session_exercises", {"id": item_id, "session_id": session_id, "exercise_id": BENCH, "position": 0}))
            for position in range(4):
                expected_sets += 1
                mutations.append(upsert("session_sets", {"id": str(uuid.uuid4()), "session_exercise_id": item_id, "position": position, "kind": "working", "actual_reps": 5, "actual_weight": 80 + week * 0.5, "actual_unit": "kg", "completed_at": when.isoformat()}))
    ordered = [m for m in mutations if m["entity"] == "sessions"] + [m for m in mutations if m["entity"] == "session_exercises"] + [m for m in mutations if m["entity"] == "session_sets"]
    for chunk in range(0, len(ordered), 200):
        result = await ok(await client.post("/v1/sync", json={"cursor": 0, "mutations": ordered[chunk : chunk + 200]}, headers=auth))
        assert {entry["status"] for entry in result["applied"]} == {"applied"}

    began = datetime.now()
    log = await ok(await client.get("/v1/stats/log", headers=auth))
    elapsed = (datetime.now() - began).total_seconds()
    assert len(log["sessions"]) == 78 * 3
    assert len(log["sets"]) == expected_sets
    assert elapsed < 2.0, f"stats/log took {elapsed:.2f}s for 18 months"
    overview = await ok(await client.get("/v1/stats/overview", headers=auth))
    assert overview["totals"]["sessions"] == 78 * 3
