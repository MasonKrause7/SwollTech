import json
from pathlib import Path

from swolltech.metrics import E1RM_MAX_REPS, PerformedSet, epley, summarize_sets, to_kilograms

GOLDEN = json.loads(Path(__file__).resolve().parents[3].joinpath("packages/metrics/fixtures/golden.json").read_text())


def test_golden_cases():
    for case in GOLDEN["cases"]:
        kg = to_kilograms(case["weight"], case["unit"])
        assert kg == case["kg"]
        estimate = None if case["kind"] != "working" else epley(kg, case["reps"])
        assert estimate == case["e1rm"]


def test_golden_session():
    session = GOLDEN["session"]
    sets = [
        PerformedSet(
            weight_kg=to_kilograms(item["weight"], item["unit"]),
            reps=item["reps"],
            kind=item["kind"],
            completed=True,
        )
        for item in session["sets"]
    ]
    summary = summarize_sets(sets, session["reference_kg"])
    assert summary["best_e1rm_kg"] == session["best_e1rm_kg"]
    assert summary["volume_kg"] == session["volume_kg"]
    assert summary["top_set_weight_kg"] == session["top_set_weight_kg"]
    assert summary["top_set_percent"] == session["top_set_percent"]


def test_estimate_is_capped_like_the_phone():
    assert E1RM_MAX_REPS == GOLDEN["e1rm_max_reps"]
    assert epley(100, 12) == 140.0
    assert epley(60, 13) is None
    # 30 reps at 60 kg must not "beat" 5 x 100 kg.
    assert epley(60, 30) is None


def test_high_rep_sets_count_toward_volume_and_fall_back_to_heaviest():
    summary = summarize_sets(
        [
            PerformedSet(weight_kg=40, reps=20, kind="working"),
            PerformedSet(weight_kg=50, reps=15, kind="working"),
            PerformedSet(weight_kg=30, reps=10, kind="warmup"),
        ],
        100,
    )
    assert summary["best_e1rm_kg"] is None
    assert summary["volume_kg"] == 1550.0
    assert summary["top_set_weight_kg"] == 50
    assert summary["top_set_percent"] == 50.0
