import re
import uuid
from pathlib import Path

import pytest

from tests.conftest import headers, make_user

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
MUSCLES = {"chest", "back", "shoulders", "quads", "hamstrings", "glutes", "biceps", "triceps", "calves", "core", "other"}
EQUIPMENT = {"barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "other"}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


@pytest.mark.asyncio
async def test_catalog_has_every_seeded_lift_with_known_muscles_and_equipment(client):
    _user, token = await make_user()
    body = (await client.get("/v1/catalog", headers=headers(token))).json()
    assert body["version"] == 2
    lifts = body["exercises"]
    assert len(lifts) == 185
    assert len({item["id"] for item in lifts}) == len(lifts)
    assert len({item["name"].lower() for item in lifts}) == len(lifts)
    assert {item["primary_muscle"] for item in lifts} <= MUSCLES
    assert {item["equipment"] for item in lifts} <= EQUIPMENT
    names = {item["name"] for item in lifts}
    assert {"Plank", "Hanging Leg Raise", "Cable Crunch", "Chin-Up", "Face Pull", "Dumbbell Shrug", "Reverse Lunge", "Hip Thrust"} <= names
    assert sum(1 for item in lifts if item["primary_muscle"] == "core") >= 15


def test_new_catalog_ids_are_deterministic():
    sql = (MIGRATIONS / "0002_catalog.sql").read_text()
    rows = re.findall(r"\('([0-9a-f-]{36})', null, '((?:[^']|'')+)', '(\w+)', '(\w+)'\)", sql)
    assert len(rows) == 145
    for exercise_id, name, _muscle, _equipment in rows:
        name = name.replace("''", "'")
        assert exercise_id == str(uuid.uuid5(uuid.NAMESPACE_URL, f"https://swolltech.app/exercises/{slug(name)}")), name
    assert "on conflict do nothing" in sql
