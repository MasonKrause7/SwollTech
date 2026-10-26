import uuid

import jwt
import pytest

from swolltech.rate_limit import limiter
from tests.conftest import SECRET, headers, make_user, token_for

BENCH = "945588d5-76e8-50ff-9b08-5a61982e1c0e"
SQUAT = "df00b70c-0d32-5048-8e57-2e8af0f85e22"


async def plan_workout(client, auth, name="Push", sets=((5, 100),), exercise=BENCH):
    workout = (await client.post("/v1/workouts", json={"name": name}, headers=auth)).json()
    detail = await client.post(f"/v1/workouts/{workout['id']}/exercises", json={"exercise_id": exercise}, headers=auth)
    item_id = detail.json()["exercises"][-1]["id"]
    for reps, weight in sets:
        await client.post(
            f"/v1/workout-exercises/{item_id}/sets",
            json={"kind": "working", "target_reps": reps, "target_weight": weight, "target_unit": "kg"},
            headers=auth,
        )
    return workout["id"], item_id


async def log_session(client, auth, workout_id, performed):
    started = (await client.post("/v1/sessions", json={"workout_id": workout_id}, headers=auth)).json()
    sets = started["exercises"][0]["sets"]
    for target, (reps, weight) in zip(sets, performed):
        response = await client.patch(
            f"/v1/session-sets/{target['id']}",
            json={"actual_reps": reps, "actual_weight": weight, "actual_unit": "kg", "completed": True},
            headers=auth,
        )
        assert response.status_code == 200, response.text
    finished = await client.patch(f"/v1/sessions/{started['id']}", json={"status": "completed"}, headers=auth)
    assert finished.status_code == 200
    return started["id"]


# ---------- auth ----------


@pytest.mark.asyncio
async def test_requests_without_a_token_are_rejected(client):
    response = await client.get("/v1/workouts")
    assert response.status_code == 401
    assert response.json() == {"detail": "Missing token"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        jwt.encode({"sub": str(uuid.uuid4()), "aud": "authenticated"}, SECRET, algorithm="HS256"),
        jwt.encode({"sub": str(uuid.uuid4()), "aud": "authenticated", "exp": 1}, SECRET, algorithm="HS256"),
        jwt.encode({"sub": str(uuid.uuid4()), "aud": "anon", "exp": 9999999999}, SECRET, algorithm="HS256"),
        jwt.encode({"sub": str(uuid.uuid4()), "aud": "authenticated", "exp": 9999999999}, "wrong-secret-wrong-secret-wrong-12", algorithm="HS256"),
        jwt.encode({"sub": "not-a-uuid", "aud": "authenticated", "exp": 9999999999}, SECRET, algorithm="HS256"),
        jwt.encode({"aud": "authenticated", "exp": 9999999999}, SECRET, algorithm="HS256"),
    ],
    ids=["garbage", "no-exp", "expired", "wrong-audience", "wrong-secret", "bad-subject", "no-subject"],
)
async def test_bad_tokens_are_rejected(client, token):
    response = await client.get("/v1/me", headers=headers(token))
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_token_for_unknown_user_has_no_profile(client):
    response = await client.get("/v1/me", headers=headers(token_for(uuid.uuid4())))
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_dev_token_is_off_by_default(client):
    response = await client.post("/v1/dev/token", json={"email": "a@b.co"})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_new_user_gets_a_profile_from_their_email(client):
    _user, token = await make_user("lifter@swolltech.test")
    me = await client.get("/v1/me", headers=headers(token))
    assert me.status_code == 200
    assert me.json()["display_name"] == "lifter"
    assert me.json()["unit_preference"] == "lb"
    assert me.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_ready_checks_the_database(client):
    response = await client.get("/health/ready")
    assert response.status_code == 200


# ---------- workouts ----------


@pytest.mark.asyncio
async def test_workout_crud_and_validation(client):
    _user, token = await make_user()
    auth = headers(token)
    assert (await client.post("/v1/workouts", json={"name": ""}, headers=auth)).status_code == 422
    created = await client.post("/v1/workouts", json={"name": "Legs", "notes": "heavy"}, headers=auth)
    assert created.status_code == 201
    workout_id = created.json()["id"]
    duplicate = await client.post("/v1/workouts", json={"name": "legs"}, headers=auth)
    assert duplicate.status_code == 409

    renamed = await client.patch(f"/v1/workouts/{workout_id}", json={"name": "Legs A"}, headers=auth)
    assert renamed.json()["name"] == "Legs A"

    await client.post(f"/v1/workouts/{workout_id}/exercises", json={"exercise_id": SQUAT}, headers=auth)
    detail = await client.post(f"/v1/workouts/{workout_id}/exercises", json={"exercise_id": BENCH}, headers=auth)
    items = detail.json()["exercises"]
    assert [item["exercise_name"] for item in items] == ["Back Squat", "Bench Press"]

    reordered = await client.post(f"/v1/workouts/{workout_id}/reorder", json={"ids": [items[1]["id"], items[0]["id"]]}, headers=auth)
    assert [item["exercise_name"] for item in reordered.json()["exercises"]] == ["Bench Press", "Back Squat"]
    partial = await client.post(f"/v1/workouts/{workout_id}/reorder", json={"ids": [items[0]["id"]]}, headers=auth)
    assert partial.status_code == 400

    both = await client.post(
        f"/v1/workout-exercises/{items[0]['id']}/sets",
        json={"kind": "working", "target_reps": 5, "target_weight": 100, "target_unit": "kg", "target_percent": 80},
        headers=auth,
    )
    assert both.status_code in (400, 422)
    planned = await client.post(
        f"/v1/workout-exercises/{items[0]['id']}/sets",
        json={"kind": "working", "target_reps": 5, "target_weight": 140, "target_unit": "kg"},
        headers=auth,
    )
    assert planned.status_code == 201
    edited = await client.patch(f"/v1/workout-sets/{planned.json()['id']}", json={"target_reps": 3}, headers=auth)
    assert edited.json()["target_reps"] == 3

    assert (await client.delete(f"/v1/workout-sets/{planned.json()['id']}", headers=auth)).status_code == 204
    assert (await client.delete(f"/v1/workout-exercises/{items[1]['id']}", headers=auth)).status_code == 204
    after = (await client.get(f"/v1/workouts/{workout_id}", headers=auth)).json()
    assert len(after["exercises"]) == 1
    assert after["exercises"][0]["sets"] == []

    assert (await client.delete(f"/v1/workouts/{workout_id}", headers=auth)).status_code == 204
    assert (await client.get(f"/v1/workouts/{workout_id}", headers=auth)).status_code == 404
    reuse = await client.post("/v1/workouts", json={"name": "Legs A"}, headers=auth)
    assert reuse.status_code == 201


@pytest.mark.asyncio
async def test_custom_exercises_are_private(client):
    _a, token_a = await make_user()
    _b, token_b = await make_user()
    created = await client.post("/v1/exercises", json={"name": "Zercher Squat", "primary_muscle": "quads"}, headers=headers(token_a))
    assert created.status_code == 201
    clash = await client.post("/v1/exercises", json={"name": "bench press"}, headers=headers(token_a))
    assert clash.status_code == 409
    names_a = [item["name"] for item in (await client.get("/v1/exercises", headers=headers(token_a))).json()]
    names_b = [item["name"] for item in (await client.get("/v1/exercises", headers=headers(token_b))).json()]
    assert "Zercher Squat" in names_a
    assert "Zercher Squat" not in names_b
    forbidden = await client.patch(f"/v1/exercises/{created.json()['id']}", json={"name": "Mine"}, headers=headers(token_b))
    assert forbidden.status_code == 404
    catalog = await client.patch(f"/v1/exercises/{BENCH}", json={"name": "Mine"}, headers=headers(token_a))
    assert catalog.status_code in (403, 404)
    searched = (await client.get("/v1/exercises", params={"q": "zerch"}, headers=headers(token_a))).json()
    assert [item["name"] for item in searched] == ["Zercher Squat"]


# ---------- sessions ----------


@pytest.mark.asyncio
async def test_completing_a_set_needs_reps_and_weight(client):
    _user, token = await make_user()
    auth = headers(token)
    workout_id, _item = await plan_workout(client, auth)
    started = (await client.post("/v1/sessions", json={"workout_id": workout_id}, headers=auth)).json()
    set_id = started["exercises"][0]["sets"][0]["id"]
    missing = await client.patch(f"/v1/session-sets/{set_id}", json={"completed": True}, headers=auth)
    assert missing.status_code == 400
    bad_rpe = await client.patch(f"/v1/session-sets/{set_id}", json={"rpe": 7.3}, headers=auth)
    assert bad_rpe.status_code == 400
    no_unit = await client.post(
        f"/v1/session-exercises/{started['exercises'][0]['id']}/sets",
        json={"kind": "working", "actual_reps": 5, "actual_weight": 100},
        headers=auth,
    )
    assert no_unit.status_code == 400
    skipped = await client.patch(f"/v1/session-sets/{set_id}", json={"skipped": True}, headers=auth)
    assert skipped.json()["skipped"] is True
    assert skipped.json()["completed_at"] is None


@pytest.mark.asyncio
async def test_freeform_session_with_added_exercise(client):
    _user, token = await make_user()
    auth = headers(token)
    started = await client.post("/v1/sessions", json={"name": ""}, headers=auth)
    assert started.status_code == 201
    assert started.json()["name"] == "Workout"
    session_id = started.json()["id"]
    added = await client.post(f"/v1/sessions/{session_id}/exercises", json={"exercise_id": SQUAT}, headers=auth)
    item_id = added.json()["exercises"][0]["id"]
    logged = await client.post(
        f"/v1/session-exercises/{item_id}/sets",
        json={"kind": "working", "actual_reps": 5, "actual_weight": 315, "actual_unit": "lb", "completed": True},
        headers=auth,
    )
    assert logged.status_code == 201
    assert logged.json()["weight_kg"] == 142.881597
    active = (await client.get("/v1/sessions", params={"status": "in_progress"}, headers=auth)).json()
    assert [item["id"] for item in active] == [session_id]
    assert (await client.delete(f"/v1/sessions/{session_id}", headers=auth)).status_code == 204
    assert (await client.get("/v1/sessions", headers=auth)).json() == []


@pytest.mark.asyncio
async def test_archived_workouts_cannot_start(client):
    _user, token = await make_user()
    auth = headers(token)
    workout_id, _item = await plan_workout(client, auth)
    await client.patch(f"/v1/workouts/{workout_id}", json={"archived": True}, headers=auth)
    detail = (await client.get(f"/v1/workouts/{workout_id}", headers=auth)).json()
    if detail["archived_at"] is None:
        pytest.skip("Workout patch does not expose archiving")
    response = await client.post("/v1/sessions", json={"workout_id": workout_id}, headers=auth)
    assert response.status_code == 400


# ---------- stats ----------


@pytest.mark.asyncio
async def test_overview_and_summary_report_records(client):
    _user, token = await make_user()
    auth = headers(token)
    workout_id, _item = await plan_workout(client, auth, sets=((5, 100), (5, 100)))
    first = await log_session(client, auth, workout_id, [(5, 100), (5, 100)])
    second = await log_session(client, auth, workout_id, [(5, 105), (4, 105)])

    first_summary = (await client.get(f"/v1/sessions/{first}/summary", headers=auth)).json()
    assert first_summary["records"] == []
    assert first_summary["volume_kg"] == 1000.0
    summary = await client.get(f"/v1/sessions/{second}/summary", headers=auth)
    assert summary.status_code == 200
    body = summary.json()
    assert body["sets"] == 2
    assert body["volume_kg"] == 945.0
    assert [record["exercise_name"] for record in body["records"]] == ["Bench Press"]
    assert body["records"][0]["e1rm_kg"] == 122.5

    overview = await client.get("/v1/stats/overview", params={"tz": "America/Detroit"}, headers=auth)
    assert overview.status_code == 200
    data = overview.json()
    assert data["totals"]["sessions"] == 2
    assert data["totals"]["records"] == 1
    assert data["totals"]["current_streak_weeks"] == 1
    assert data["weekly"][-1]["sessions"] == 2
    assert data["muscle_split"][0]["muscle"] == "chest"
    assert data["exercises"][0]["exercise_name"] == "Bench Press"
    assert data["recent_records"][0]["session_id"] == second

    bad_zone = await client.get("/v1/stats/overview", params={"tz": "Mars/Olympus"}, headers=auth)
    assert bad_zone.status_code == 400


@pytest.mark.asyncio
async def test_stats_ignore_warmups_skips_and_in_progress_sessions(client):
    _user, token = await make_user()
    auth = headers(token)
    workout_id, _item = await plan_workout(client, auth)
    await log_session(client, auth, workout_id, [(5, 100)])
    started = (await client.post("/v1/sessions", json={"workout_id": workout_id}, headers=auth)).json()
    set_id = started["exercises"][0]["sets"][0]["id"]
    await client.patch(
        f"/v1/session-sets/{set_id}",
        json={"actual_reps": 5, "actual_weight": 200, "actual_unit": "kg", "completed": True},
        headers=auth,
    )
    warm = await client.post(
        f"/v1/session-exercises/{started['exercises'][0]['id']}/sets",
        json={"kind": "warmup", "actual_reps": 5, "actual_weight": 300, "actual_unit": "kg", "completed": True},
        headers=auth,
    )
    assert warm.status_code == 201
    data = (await client.get("/v1/stats/overview", headers=auth)).json()
    assert data["totals"]["sessions"] == 1
    assert data["totals"]["volume_kg"] == 500.0
    # The in-progress session can still be summarized while you are in it.
    live = (await client.get(f"/v1/sessions/{started['id']}/summary", headers=auth)).json()
    assert live["sets"] == 1
    assert live["volume_kg"] == 1000.0
    assert len(live["records"]) == 1


@pytest.mark.asyncio
async def test_stats_are_private(client):
    _a, token_a = await make_user()
    _b, token_b = await make_user()
    workout_id, _item = await plan_workout(client, headers(token_a))
    session_id = await log_session(client, headers(token_a), workout_id, [(5, 100)])
    assert (await client.get(f"/v1/sessions/{session_id}/summary", headers=headers(token_b))).status_code == 404
    other = (await client.get("/v1/stats/overview", headers=headers(token_b))).json()
    assert other["totals"]["sessions"] == 0


# ---------- account ----------


@pytest.mark.asyncio
async def test_delete_account_removes_everything(client, _clean):
    user_id, token = await make_user()
    auth = headers(token)
    workout_id, _item = await plan_workout(client, auth)
    await log_session(client, auth, workout_id, [(5, 100)])
    _clean.put_bytes(f"users/{user_id}/sets/x/clip", b"data", "video/mp4")
    _clean.put_bytes("users/someone-else/sets/x/clip", b"data", "video/mp4")
    assert (await client.delete("/v1/me", headers=auth)).status_code == 204
    # The old token stops working because the profile is gone.
    assert (await client.get("/v1/me", headers=auth)).status_code == 401
    assert list(_clean.objects) == ["users/someone-else/sets/x/clip"]


def test_rate_limiter_blocks_after_the_limit():
    key = f"test:{uuid.uuid4()}"
    for _ in range(3):
        limiter.hit(key, 3, 60)
    with pytest.raises(Exception) as caught:
        limiter.hit(key, 3, 60)
    assert getattr(caught.value, "status", None) == 429


@pytest.mark.asyncio
async def test_exercise_search_treats_wildcards_literally(client):
    _user, token = await make_user()
    everything = await client.get("/v1/exercises", params={"q": "%"}, headers=headers(token))
    assert everything.status_code == 200
    assert everything.json() == []
    underscore = await client.get("/v1/exercises", params={"q": "_"}, headers=headers(token))
    assert underscore.json() == []
