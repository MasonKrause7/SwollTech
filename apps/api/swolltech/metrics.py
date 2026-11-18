from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

LB_PER_KG = Decimal("0.45359237")
SIX = Decimal("0.000001")


def round6(value: Decimal) -> float:
    return float(value.quantize(SIX, rounding=ROUND_HALF_UP))


def to_kilograms(weight: float, unit: str) -> float:
    amount = Decimal(str(weight))
    if unit == "lb":
        amount *= LB_PER_KG
    elif unit != "kg":
        raise ValueError(f"Unknown unit {unit}")
    return round6(amount)


def from_kilograms(kg: float, unit: str) -> float:
    amount = Decimal(str(kg))
    if unit == "lb":
        amount /= LB_PER_KG
    elif unit != "kg":
        raise ValueError(f"Unknown unit {unit}")
    return round6(amount)


# Sets above this many reps never produce an estimated 1RM: uncapped Epley says 30 reps
# at 60 kg "estimates" 120 kg and beats a real 5 x 100 kg. High-rep sets still count toward
# volume. Mirrored in packages/metrics/src/index.ts (E1RM_MAX_REPS).
E1RM_MAX_REPS = 12


def epley(weight_kg: float, reps: int) -> float | None:
    """Epley estimated 1RM, or None for invalid sets and sets above E1RM_MAX_REPS reps."""
    if reps < 1 or weight_kg < 0 or reps > E1RM_MAX_REPS:
        return None
    weight = Decimal(str(weight_kg))
    if reps == 1:
        return round6(weight)
    return round6(weight * (Decimal(1) + (Decimal(reps) / Decimal(30))))


@dataclass
class PerformedSet:
    weight_kg: float
    reps: int
    kind: str
    skipped: bool = False
    completed: bool = True


def summarize_sets(sets: list[PerformedSet], reference_kg: float | None) -> dict:
    best: float | None = None
    volume = Decimal("0")
    top_weight: float | None = None
    heaviest: float | None = None
    counted = False
    for item in sets:
        if item.kind != "working" or item.skipped or not item.completed or item.reps < 1 or item.weight_kg < 0:
            continue
        counted = True
        volume += Decimal(str(item.weight_kg)) * Decimal(item.reps)
        if heaviest is None or item.weight_kg > heaviest:
            heaviest = item.weight_kg
        estimate = epley(item.weight_kg, item.reps)
        if estimate is not None and (best is None or estimate > best):
            best = estimate
            top_weight = item.weight_kg
    # Only high-rep sets: the top set is simply the heaviest one.
    if top_weight is None:
        top_weight = heaviest
    percent = None
    if top_weight is not None and reference_kg not in (None, 0):
        percent = round6(Decimal(str(top_weight)) / Decimal(str(reference_kg)) * Decimal(100))
    return {
        "best_e1rm_kg": best,
        "volume_kg": round6(volume) if counted else 0.0,
        "top_set_weight_kg": top_weight,
        "top_set_percent": percent,
    }
