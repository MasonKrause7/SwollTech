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

export function epley(weightKg: number, reps: number): number | null {
  if (reps < 1 || weightKg < 0) return null;
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
  let counted = false;
  for (const item of sets) {
    if (item.kind !== "working" || item.skipped || item.completed === false || item.reps < 1) continue;
    const estimate = epley(item.weightKg, item.reps);
    if (estimate == null) continue;
    counted = true;
    volume += item.weightKg * item.reps;
    if (best == null || estimate > best) {
      best = estimate;
      topWeight = item.weightKg;
    }
  }
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
