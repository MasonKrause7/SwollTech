import json
from pathlib import Path

from swolltech.metrics import PerformedSet, epley, summarize_sets, to_kilograms

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
