"""Fill a local dev account with believable training history.

The default is 78 weeks (about a year and a half) of a four-day upper/lower split, so the
Progress page's Analyze charts have something real to slice: alternating strength and
hypertrophy blocks, a deload every sixth week, a two-week vacation, a sick week, a holiday
week, the odd missed day, and a few lifts that only join the program part way through.

Needs the API running with DEV_TOKEN_ENABLED=true. Never point this at production.

    uv run python scripts/seed_demo.py --api http://localhost:8000 --email demo@example.com --fresh

--fresh deletes the account's existing sessions (and the demo workouts) first, so the
history is exactly what this script generates. Without it, sessions are added on top.
"""

import argparse
import math
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

BENCH = "945588d5-76e8-50ff-9b08-5a61982e1c0e"
INCLINE = "593e1d8e-8a34-53dc-ba04-d8c756b1552e"
SQUAT = "df00b70c-0d32-5048-8e57-2e8af0f85e22"
FRONT_SQUAT = "32c7634a-8411-51a4-bd4e-e63f0a9d60ff"
DEADLIFT = "6e444f8d-53f2-55ea-9fa0-1ad012e77515"
RDL = "816ce516-5aec-5beb-bdb8-ad4ef85e1a0a"
PRESS = "bb712dc6-743e-5af1-a235-0bc8818124fa"
ROW = "a0ce1f6e-ee09-5dd7-92d2-a99309b7f346"
PULLDOWN = "f09cf825-db6a-5030-876e-58024d3b0dfd"
CURL = "219efc97-baa1-5de7-a0ac-ffb5a907e895"
LEG_CURL = "4d059840-e1de-5350-a35a-8e9b3902417f"
LEG_PRESS = "080eb8e0-d28b-5833-80e4-22dd9b4c968a"
LATERAL = "a0fb58da-50da-595b-b34b-8c74e16f0ac2"
PUSHDOWN = "551e548d-f7c2-5ab6-8477-cc0b6e03d34e"
CALF = "080d8286-b718-5cfe-bb94-f0827c919856"


@dataclass(frozen=True)
class Lift:
    exercise_id: str
    start_lb: float  # working weight at a strength-block 5-rep effort, week 0
    gain: float  # long-run fraction added over the program (diminishing returns)
    step: float  # plate increment in lb
    main: bool  # main lifts swing between 3-5 and 8-10 reps by block; accessories stay 10-12
    sets: int
    from_week: int = 0  # joins the program this week
    until_week: int = 10_000  # leaves the program this week


# Monday, Tuesday, Thursday, Friday.
PLANS: dict[str, tuple[int, list[Lift]]] = {
    "Upper A": (0, [
        Lift(BENCH, 165, 0.32, 5, True, 4),
        Lift(ROW, 135, 0.30, 5, True, 4),
        Lift(LATERAL, 15, 0.45, 2.5, False, 3),
        Lift(CURL, 25, 0.40, 2.5, False, 3),
    ]),
    "Lower A": (1, [
        Lift(SQUAT, 205, 0.42, 5, True, 4),
        Lift(RDL, 165, 0.38, 5, True, 3),
        Lift(LEG_CURL, 80, 0.35, 5, False, 3),
        Lift(CALF, 135, 0.30, 10, False, 3),
    ]),
    "Upper B": (3, [
        Lift(PRESS, 95, 0.28, 2.5, True, 4),
        Lift(PULLDOWN, 130, 0.30, 5, False, 3),
        Lift(BENCH, 150, 0.32, 5, False, 3, until_week=20),
        Lift(INCLINE, 135, 0.30, 5, True, 3, from_week=20),
        Lift(PUSHDOWN, 50, 0.40, 5, False, 3),
    ]),
    "Lower B": (4, [
        Lift(DEADLIFT, 255, 0.40, 5, True, 3),
        Lift(LEG_PRESS, 270, 0.40, 10, False, 3, until_week=40),
        Lift(FRONT_SQUAT, 155, 0.30, 5, True, 3, from_week=40),
        Lift(LEG_CURL, 80, 0.35, 5, False, 2),
    ]),
}

BLOCK = 6  # weeks per block; the last week of each is a deload
VACATION = {28, 29}  # two weeks off
SICK = {45}  # one session that week
HOLIDAY = {59}  # one session that week


def mutation(entity: str, payload: dict) -> dict:
    return {
        "client_mutation_id": str(uuid.uuid4()),
        "entity": entity,
        "op": "upsert",
        "entity_id": payload["id"],
        "base_updated_at": None,
        "payload": payload,
    }


def plates(weight: float, step: float) -> float:
    return max(step, round(weight / step) * step)


def prescription(lift: Lift, week: int, rng: random.Random) -> tuple[float, int, int]:
    """Weight in lb, target reps and working sets for a lift in a given program week."""
    block, in_block = divmod(week, BLOCK)
    strength_block = block % 2 == 1
    # Long-run strength with diminishing returns, plus a dip after the vacation.
    base = lift.start_lb * (1 + lift.gain * (1 - math.exp(-week / 40)))
    if week >= max(VACATION) + 1:
        base *= 1 - 0.06 * math.exp(-(week - max(VACATION) - 1) / 3)
    # Inside a block the load climbs about 2% a week, then backs off for the deload.
    deload = in_block == BLOCK - 1
    ramp = 1 + 0.02 * min(in_block, BLOCK - 2)
    if lift.main:
        reps, intensity = (rng.choice([3, 5, 5]), 1.0) if strength_block else (rng.choice([8, 8, 10]), 0.82)
    else:
        reps, intensity = rng.choice([10, 12, 12]), 1.0
    weight = base * intensity * (0.85 if deload else ramp) * (1 + rng.uniform(-0.015, 0.015))
    sets = max(2, lift.sets - 1) if deload else lift.sets
    return plates(weight, lift.step), reps, sets


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--email", default="demo@example.com")
    parser.add_argument("--weeks", type=int, default=78)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--fresh", action="store_true", help="delete the account's sessions and demo workouts first")
    args = parser.parse_args()
    if "localhost" not in args.api and "127.0.0.1" not in args.api:
        raise SystemExit("seed_demo only talks to a local API.")
    rng = random.Random(args.seed)

    with httpx.Client(base_url=args.api, timeout=60) as http:
        token = http.post("/v1/dev/token", json={"email": args.email, "display_name": args.email.split("@")[0].title()})
        token.raise_for_status()
        auth = {"Authorization": f"Bearer {token.json()['access_token']}"}

        if args.fresh:
            removed = 0
            for row in http.get("/v1/sessions", headers=auth).json():
                http.delete(f"/v1/sessions/{row['id']}", headers=auth).raise_for_status()
                removed += 1
            for row in http.get("/v1/workouts", headers=auth).json():
                if row["name"] in PLANS:
                    http.delete(f"/v1/workouts/{row['id']}", headers=auth).raise_for_status()
            print(f"Removed {removed} existing sessions")

        workout_ids: dict[str, str] = {}
        for name, (_day, lifts) in PLANS.items():
            created = http.post("/v1/workouts", json={"name": name}, headers=auth)
            if created.status_code == 409:
                existing = next(w for w in http.get("/v1/workouts", headers=auth).json() if w["name"] == name)
                workout_ids[name] = existing["id"]
                continue
            created.raise_for_status()
            workout_ids[name] = created.json()["id"]
            # The saved plan is what the program looks like today.
            for lift in lifts:
                if lift.until_week < args.weeks:
                    continue
                weight, reps, sets = prescription(lift, args.weeks - 2, random.Random(0))
                detail = http.post(f"/v1/workouts/{workout_ids[name]}/exercises", json={"exercise_id": lift.exercise_id}, headers=auth).json()
                item = detail["exercises"][-1]["id"]
                if lift.main:
                    http.post(f"/v1/workout-exercises/{item}/sets", json={"kind": "warmup", "target_reps": 8, "target_weight": plates(weight * 0.5, 5), "target_unit": "lb", "rest_seconds": 60}, headers=auth)
                for _ in range(sets):
                    http.post(f"/v1/workout-exercises/{item}/sets", json={"kind": "working", "target_reps": reps, "target_weight": weight, "target_unit": "lb", "rest_seconds": 150 if lift.main else 90}, headers=auth)

        now = datetime.now(timezone.utc)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        monday = today - timedelta(days=today.weekday())
        start = monday - timedelta(weeks=args.weeks)
        mutations = []
        count = 0
        for week in range(args.weeks + 1):
            if week in VACATION:
                continue
            days = list(PLANS.items())
            if week in SICK | HOLIDAY:
                days = [rng.choice(days)]
            for name, (weekday, lifts) in days:
                when = start + timedelta(weeks=week, days=weekday, hours=17 + rng.randint(0, 2), minutes=rng.choice([0, 15, 30, 45]))
                if when >= now - timedelta(hours=3) or rng.random() < 0.07:
                    continue
                count += 1
                session_id = str(uuid.uuid4())
                position = 0
                stamp = when + timedelta(minutes=5)
                for lift in lifts:
                    if not lift.from_week <= week < lift.until_week:
                        continue
                    weight, reps, sets = prescription(lift, week, rng)
                    item_id = str(uuid.uuid4())
                    mutations.append(mutation("session_exercises", {"id": item_id, "session_id": session_id, "exercise_id": lift.exercise_id, "position": position, "notes": ""}))
                    set_position = 0
                    if lift.main:
                        mutations.append(mutation("session_sets", {"id": str(uuid.uuid4()), "session_exercise_id": item_id, "position": 0, "kind": "warmup", "actual_reps": 8, "actual_weight": plates(weight * 0.5, 5), "actual_unit": "lb", "notes": "", "skipped": False, "completed_at": stamp.isoformat(), "rest_seconds": 60}))
                        set_position = 1
                    for number in range(sets):
                        # Most sets hit the target; the last set of a hard week sometimes falls a rep short.
                        miss = number == sets - 1 and rng.random() < 0.25
                        bonus = rng.random() < 0.08
                        done_reps = max(1, reps - (1 if miss else 0) + (1 if bonus else 0))
                        stamp += timedelta(minutes=3)
                        mutations.append(mutation("session_sets", {"id": str(uuid.uuid4()), "session_exercise_id": item_id, "position": set_position + number, "kind": "working", "target_reps": reps, "actual_reps": done_reps, "actual_weight": weight, "actual_unit": "lb", "rpe": rng.choice([7, 7.5, 8, 8, 8.5, 9]), "notes": "", "skipped": False, "completed_at": stamp.isoformat(), "rest_seconds": 150 if lift.main else 90}))
                    position += 1
                    stamp += timedelta(minutes=4)
                ended = stamp + timedelta(minutes=rng.randint(2, 8))
                mutations.append(mutation("sessions", {"id": session_id, "workout_id": workout_ids[name], "name": name, "status": "completed", "started_at": when.isoformat(), "ended_at": ended.isoformat(), "notes": ""}))

        # Put every session ahead of its children.
        ordered = [m for m in mutations if m["entity"] == "sessions"] + [m for m in mutations if m["entity"] == "session_exercises"] + [m for m in mutations if m["entity"] == "session_sets"]
        for chunk in range(0, len(ordered), 200):
            response = http.post("/v1/sync", json={"cursor": 0, "mutations": ordered[chunk : chunk + 200]}, headers=auth)
            response.raise_for_status()
            bad = [item for item in response.json()["applied"] if item["status"] != "applied"]
            if bad:
                raise SystemExit(f"Sync rejected {len(bad)} changes: {bad[:3]}")
        sets_logged = sum(1 for m in ordered if m["entity"] == "session_sets")
        print(f"Seeded {count} sessions and {sets_logged} sets over {args.weeks} weeks for {args.email}")


if __name__ == "__main__":
    main()
