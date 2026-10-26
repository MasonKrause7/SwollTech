"""Fill a local dev account with ten weeks of believable training.

Needs the API running with DEV_TOKEN_ENABLED=true. Never point this at production.

    uv run python scripts/seed_demo.py --api http://localhost:8000 --email demo@example.com
"""

import argparse
import random
import uuid
from datetime import datetime, timedelta, timezone

import httpx

BENCH = "945588d5-76e8-50ff-9b08-5a61982e1c0e"
SQUAT = "df00b70c-0d32-5048-8e57-2e8af0f85e22"
DEADLIFT = "6e444f8d-53f2-55ea-9fa0-1ad012e77515"
PRESS = "bb712dc6-743e-5af1-a235-0bc8818124fa"
ROW = "a0ce1f6e-ee09-5dd7-92d2-a99309b7f346"
PULLDOWN = "f09cf825-db6a-5030-876e-58024d3b0dfd"
CURL = "219efc97-baa1-5de7-a0ac-ffb5a907e895"
LEG_CURL = "4d059840-e1de-5350-a35a-8e9b3902417f"

PLANS = {
    "Upper A": [(BENCH, 185, 5, 3), (ROW, 155, 8, 3), (PRESS, 105, 6, 3), (CURL, 30, 12, 2)],
    "Lower A": [(SQUAT, 245, 5, 3), (DEADLIFT, 295, 3, 2), (LEG_CURL, 90, 10, 3)],
    "Upper B": [(PRESS, 100, 5, 3), (PULLDOWN, 140, 10, 3), (BENCH, 165, 8, 3)],
}


def mutation(entity: str, payload: dict) -> dict:
    return {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": entity,
        "op": "upsert",
        "entity_id": payload["id"],
        "base_updated_at": None,
        "payload": payload,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--email", default="demo@example.com")
    parser.add_argument("--weeks", type=int, default=10)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    rng = random.Random(args.seed)

    with httpx.Client(base_url=args.api, timeout=30) as http:
        token = http.post("/v1/dev/token", json={"email": args.email, "display_name": "Mason"})
        token.raise_for_status()
        auth = {"Authorization": f"Bearer {token.json()['access_token']}"}

        workout_ids = {}
        for name, lifts in PLANS.items():
            created = http.post("/v1/workouts", json={"name": name}, headers=auth)
            if created.status_code == 409:
                existing = next(w for w in http.get("/v1/workouts", headers=auth).json() if w["name"] == name)
                workout_ids[name] = existing["id"]
                continue
            created.raise_for_status()
            workout_ids[name] = created.json()["id"]
            for exercise_id, weight, reps, sets in lifts:
                detail = http.post(f"/v1/workouts/{workout_ids[name]}/exercises", json={"exercise_id": exercise_id}, headers=auth).json()
                item = detail["exercises"][-1]["id"]
                http.post(f"/v1/workout-exercises/{item}/sets", json={"kind": "warmup", "target_reps": 8, "target_weight": round(weight * 0.5 / 5) * 5, "target_unit": "lb", "rest_seconds": 60}, headers=auth)
                for _ in range(sets):
                    http.post(f"/v1/workout-exercises/{item}/sets", json={"kind": "working", "target_reps": reps, "target_weight": weight, "target_unit": "lb", "rest_seconds": 150}, headers=auth)

        now = datetime.now(timezone.utc)
        start = now - timedelta(weeks=args.weeks)
        cycle = list(PLANS)
        mutations = []
        day = start
        index = 0
        week = 0
        while day < now - timedelta(days=1):
            skip_week = week == 4
            for offset in (0, 2, 4):
                when = (day + timedelta(days=offset)).replace(hour=17 + rng.randint(0, 2), minute=rng.choice([0, 15, 30, 45]))
                if when >= now - timedelta(hours=6) or skip_week or rng.random() < 0.12:
                    continue
                name = cycle[index % len(cycle)]
                index += 1
                session_id = str(uuid.uuid4())
                ended = when + timedelta(minutes=rng.randint(48, 75))
                mutations.append(mutation("sessions", {"id": session_id, "workout_id": workout_ids[name], "name": name, "status": "completed", "started_at": when.isoformat(), "ended_at": ended.isoformat(), "notes": ""}))
                for position, (exercise_id, weight, reps, sets) in enumerate(PLANS[name]):
                    progress = 1 + 0.012 * week + rng.uniform(-0.02, 0.02)
                    load = round(weight * progress / 2.5) * 2.5
                    item_id = str(uuid.uuid4())
                    mutations.append(mutation("session_exercises", {"id": item_id, "session_id": session_id, "exercise_id": exercise_id, "position": position, "notes": ""}))
                    stamp = when + timedelta(minutes=5 + position * 12)
                    mutations.append(mutation("session_sets", {"id": str(uuid.uuid4()), "session_exercise_id": item_id, "position": 0, "kind": "warmup", "actual_reps": 8, "actual_weight": round(load * 0.5 / 5) * 5, "actual_unit": "lb", "notes": "", "skipped": False, "completed_at": stamp.isoformat(), "rest_seconds": 60}))
                    for number in range(sets):
                        done_reps = max(1, reps + rng.choice([0, 0, 0, 1, -1]))
                        mutations.append(mutation("session_sets", {"id": str(uuid.uuid4()), "session_exercise_id": item_id, "position": number + 1, "kind": "working", "target_reps": reps, "actual_reps": done_reps, "actual_weight": load, "actual_unit": "lb", "rpe": rng.choice([7, 7.5, 8, 8.5, 9]), "notes": "", "skipped": False, "completed_at": (stamp + timedelta(minutes=3 * (number + 1))).isoformat(), "rest_seconds": 150}))
            day += timedelta(weeks=1)
            week += 1

        for chunk in range(0, len(mutations), 200):
            response = http.post("/v1/sync", json={"cursor": 0, "mutations": mutations[chunk : chunk + 200]}, headers=auth)
            response.raise_for_status()
            bad = [item for item in response.json()["applied"] if item["status"] != "applied"]
            if bad:
                raise SystemExit(f"Sync rejected {len(bad)} changes: {bad[:3]}")
        print(f"Seeded {index} sessions for {args.email}")


if __name__ == "__main__":
    main()
