import uuid

import pytest

from tests.conftest import headers, make_user
from tests.test_endpoints import plan_workout
from tests.test_sync import delete, sync, upsert


async def schedule(client, auth, workout_id, day, **extra):
    response = await client.post("/v1/schedule", json={"workout_id": workout_id, "scheduled_on": day, **extra}, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def window(client, auth, start="2026-01-01", end="2026-12-31"):
    response = await client.get("/v1/schedule", params={"start": start, "end": end}, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_plan_a_month_and_read_it_back(client):
    _, token = await make_user()
    auth = headers(token)
    push, _ = await plan_workout(client, auth, "Push")
    created = await schedule(client, auth, push, "2026-11-02", repeat_weeks=3, notes="Heavy")
    assert [item["scheduled_on"] for item in created] == ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]
    assert all(item["workout_name"] == "Push" and item["notes"] == "Heavy" and not item["workout_archived"] for item in created)

    november = await window(client, auth, "2026-11-01", "2026-11-30")
    assert [item["scheduled_on"] for item in november] == ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]
    assert await window(client, auth, "2026-11-03", "2026-11-08") == []


@pytest.mark.asyncio
async def test_move_swap_and_remove_a_plan(client):
    _, token = await make_user()
    auth = headers(token)
    push, _ = await plan_workout(client, auth, "Push")
    pull, _ = await plan_workout(client, auth, "Pull")
    [plan] = await schedule(client, auth, push, "2026-11-02")

    moved = await client.patch(f"/v1/schedule/{plan['id']}", json={"scheduled_on": "2026-11-03", "workout_id": pull}, headers=auth)
    assert moved.status_code == 200, moved.text
    assert moved.json()["scheduled_on"] == "2026-11-03"
    assert moved.json()["workout_name"] == "Pull"

    stale = await client.patch(f"/v1/schedule/{plan['id']}", json={"notes": "x", "base_updated_at": plan["updated_at"]}, headers=auth)
    assert stale.status_code == 409

    assert (await client.delete(f"/v1/schedule/{plan['id']}", headers=auth)).status_code == 204
    assert (await client.delete(f"/v1/schedule/{plan['id']}", headers=auth)).status_code == 404
    assert await window(client, auth) == []


@pytest.mark.asyncio
async def test_schedule_validation(client):
    _, token = await make_user()
    auth = headers(token)
    push, _ = await plan_workout(client, auth, "Push")

    assert (await client.post("/v1/schedule", json={"workout_id": str(uuid.uuid4()), "scheduled_on": "2026-11-02"}, headers=auth)).status_code == 404
    assert (await client.post("/v1/schedule", json={"workout_id": push, "scheduled_on": "2026-11-02", "repeat_weeks": 53}, headers=auth)).status_code == 422
    assert (await client.get("/v1/schedule", params={"start": "2026-11-02", "end": "2026-11-01"}, headers=auth)).status_code == 400
    assert (await client.get("/v1/schedule", params={"start": "2026-01-01", "end": "2027-12-31"}, headers=auth)).status_code == 400

    await client.patch(f"/v1/workouts/{push}", json={"archived": True}, headers=auth)
    archived = await client.post("/v1/schedule", json={"workout_id": push, "scheduled_on": "2026-11-02"}, headers=auth)
    assert archived.status_code == 400


@pytest.mark.asyncio
async def test_archiving_keeps_plans_and_deleting_removes_them(client):
    _, token = await make_user()
    auth = headers(token)
    push, _ = await plan_workout(client, auth, "Push")
    await schedule(client, auth, push, "2026-11-02", repeat_weeks=1)

    await client.patch(f"/v1/workouts/{push}", json={"archived": True}, headers=auth)
    plans = await window(client, auth)
    assert len(plans) == 2 and all(item["workout_archived"] for item in plans)

    await client.delete(f"/v1/workouts/{push}", headers=auth)
    assert await window(client, auth) == []


@pytest.mark.asyncio
async def test_plans_are_private(client):
    _, mine = await make_user()
    _, theirs = await make_user()
    push, _ = await plan_workout(client, headers(mine), "Push")
    [plan] = await schedule(client, headers(mine), push, "2026-11-02")

    assert await window(client, headers(theirs)) == []
    assert (await client.patch(f"/v1/schedule/{plan['id']}", json={"notes": "x"}, headers=headers(theirs))).status_code == 404
    assert (await client.delete(f"/v1/schedule/{plan['id']}", headers=headers(theirs))).status_code == 404
    other = await client.post("/v1/schedule", json={"workout_id": push, "scheduled_on": "2026-11-02"}, headers=headers(theirs))
    assert other.status_code == 404


@pytest.mark.asyncio
async def test_a_phone_can_plan_offline(client):
    _, token = await make_user()
    auth = headers(token)
    push, _ = await plan_workout(client, auth, "Push")
    plan = str(uuid.uuid4())

    result = await sync(client, token, [upsert("scheduled_workouts", {"id": plan, "workout_id": push, "scheduled_on": "2026-11-05", "notes": ""})])
    assert result["applied"][0]["status"] == "applied"
    row = result["applied"][0]["server_row"]
    assert row["scheduled_on"] == "2026-11-05"
    assert any(change["entity"] == "scheduled_workouts" and change["entity_id"] == plan for change in result["changes"])

    moved = await sync(
        client,
        token,
        [upsert("scheduled_workouts", {"id": plan, "workout_id": push, "scheduled_on": "2026-11-06"}, base=row["updated_at"])],
        cursor=result["cursor"],
    )
    assert moved["applied"][0]["status"] == "applied"
    assert (await window(client, auth))[0]["scheduled_on"] == "2026-11-06"

    removed = await sync(client, token, [delete("scheduled_workouts", plan, moved["applied"][0]["server_row"]["updated_at"])], cursor=moved["cursor"])
    assert removed["applied"][0]["status"] == "applied"
    assert [change["op"] for change in removed["changes"] if change["entity_id"] == plan] == ["delete"]


@pytest.mark.asyncio
async def test_sync_rejects_plans_for_someone_elses_workout(client):
    _, mine = await make_user()
    _, theirs = await make_user()
    push, _ = await plan_workout(client, headers(mine), "Push")
    result = await sync(client, theirs, [upsert("scheduled_workouts", {"id": str(uuid.uuid4()), "workout_id": push, "scheduled_on": "2026-11-05"})])
    assert result["applied"][0]["status"] == "error"


@pytest.mark.asyncio
async def test_deleting_a_workout_sends_plan_deletes_to_the_phone(client):
    _, token = await make_user()
    auth = headers(token)
    push, _ = await plan_workout(client, auth, "Push")
    [plan] = await schedule(client, auth, push, "2026-11-02")
    cursor = (await sync(client, token, []))["cursor"]

    await client.delete(f"/v1/workouts/{push}", headers=auth)
    changes = (await sync(client, token, [], cursor=cursor))["changes"]
    assert {"entity": "scheduled_workouts", "op": "delete"} in [{"entity": c["entity"], "op": c["op"]} for c in changes if c["entity_id"] == plan["id"]]
