export const LB_PER_KG = 0.45359237;

export function round6(value: number): number {
  return Number(value.toFixed(6));
}

export function toKilograms(weight: number, unit: "lb" | "kg"): number {
  const amount = unit === "lb" ? weight * LB_PER_KG : weight;
  return round6(amount);
}

export function fromKilograms(kg: number, unit: "lb" | "kg"): number {
  const amount = unit === "lb" ? kg / LB_PER_KG : kg;
  return round6(amount);
}

/**
 * Sets above this many reps never produce an estimated 1RM. Epley is only trustworthy
 * in the low-rep range: uncapped, 30 reps at 60 kg "estimates" 120 kg and beats a real
 * 5 x 100 kg. High-rep sets still count toward volume, rep records and the heaviest-weight
 * record; they just don't feed estimated maxes or estimated-max records.
 * Mirrored in apps/api/swolltech/metrics.py (E1RM_MAX_REPS).
 */
export const E1RM_MAX_REPS = 12;

/** Epley estimated 1RM, or null for invalid sets and sets above E1RM_MAX_REPS reps. */
export function epley(weightKg: number, reps: number): number | null {
  if (reps < 1 || weightKg < 0 || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return round6(weightKg);
  return round6(weightKg * (1 + reps / 30));
}

export interface PerformedSet {
  weightKg: number;
  reps: number;
  kind: "warmup" | "working";
  skipped?: boolean;
  completed?: boolean;
}

export function summarizeSets(sets: PerformedSet[], referenceKg: number | null) {
  let best: number | null = null;
  let volume = 0;
  let topWeight: number | null = null;
  let heaviest: number | null = null;
  let counted = false;
  for (const item of sets) {
    if (item.kind !== "working" || item.skipped || item.completed === false || item.reps < 1 || item.weightKg < 0) continue;
    counted = true;
    volume += item.weightKg * item.reps;
    if (heaviest == null || item.weightKg > heaviest) heaviest = item.weightKg;
    const estimate = epley(item.weightKg, item.reps);
    if (estimate != null && (best == null || estimate > best)) {
      best = estimate;
      topWeight = item.weightKg;
    }
  }
  // Only high-rep sets: the top set is simply the heaviest one.
  if (topWeight == null) topWeight = heaviest;
  const percent =
    topWeight != null && referenceKg ? round6((topWeight / referenceKg) * 100) : null;
  return {
    bestE1rmKg: best,
    volumeKg: counted ? round6(volume) : 0,
    topSetWeightKg: topWeight,
    topSetPercent: percent,
  };
}
export * from "./stats";
export * from "./plates";
export * from "./guide";
export * from "./schedule";
export * from "./analytics";
export * from "./records";
export * from "./catalog";
