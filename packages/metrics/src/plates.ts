/**
 * Plate math for the guided set screen: what to load on each side of the bar.
 */
export type Unit = "lb" | "kg";

export const DEFAULT_BAR: Record<Unit, number> = { lb: 45, kg: 20 };
export const DEFAULT_PLATES: Record<Unit, number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export interface PlateLoad {
  /** Plates for one side, heaviest first. */
  perSide: number[];
  /** What the bar actually weighs with those plates. */
  loaded: number;
  /** Target minus loaded. Zero when the target is reachable exactly. */
  remainder: number;
  /** True when the target is below the empty bar. */
  belowBar: boolean;
}

const SCALE = 1000;

export function loadPlates(target: number, unit: Unit, bar = DEFAULT_BAR[unit], plates = DEFAULT_PLATES[unit]): PlateLoad {
  if (!Number.isFinite(target) || target <= 0) return { perSide: [], loaded: 0, remainder: 0, belowBar: false };
  if (target < bar) return { perSide: [], loaded: bar, remainder: round(target - bar), belowBar: true };
  let side = Math.round(((target - bar) / 2) * SCALE);
  const perSide: number[] = [];
  for (const plate of [...plates].sort((a, b) => b - a)) {
    const size = Math.round(plate * SCALE);
    while (size > 0 && side >= size) {
      perSide.push(plate);
      side -= size;
    }
  }
  const loaded = round(bar + perSide.reduce((total, plate) => total + plate, 0) * 2);
  return { perSide, loaded, remainder: round(target - loaded), belowBar: false };
}

function round(value: number) {
  return Math.round(value * SCALE) / SCALE;
}

/** Competition plate colors, so the diagram reads like a real bar. */
export function plateColor(plate: number, unit: Unit): string {
  const kg = unit === "kg" ? plate : plate * 0.45359237;
  if (kg >= 24) return "#D7263D";
  if (kg >= 19) return "#1F6FD1";
  if (kg >= 14) return "#F2C230";
  if (kg >= 9) return "#2E9E5B";
  if (kg >= 4) return "#E9ECEF";
  return "#3A4048";
}

/** Relative plate height for drawing, from 0.35 to 1. */
export function plateHeight(plate: number, unit: Unit): number {
  const kg = unit === "kg" ? plate : plate * 0.45359237;
  if (kg >= 9) return 1;
  return Math.max(0.35, 0.45 + kg / 20);
}

/** Step size for the weight stepper buttons. */
export function weightStep(unit: Unit) {
  return unit === "kg" ? 2.5 : 5;
}
