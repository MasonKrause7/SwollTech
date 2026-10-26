import { fromKilograms } from "@swolltech/metrics";

export type WeightUnit = "lb" | "kg";

export function trimNumber(value: number, digits = 1) {
  return Number(value.toFixed(digits)).toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** A kilogram value shown in the user's unit, e.g. "225 lb". */
export function weightFromKg(kg: number | null | undefined, unit: WeightUnit, digits = 1) {
  if (kg == null) return "None yet";
  return `${trimNumber(fromKilograms(kg, unit), digits)} ${unit}`;
}

/** Large totals like volume read better without decimals. */
export function bigWeightFromKg(kg: number, unit: WeightUnit) {
  const value = fromKilograms(kg, unit);
  if (value >= 100_000) return `${trimNumber(value / 1000, 0)}k`;
  if (value >= 10_000) return `${trimNumber(value / 1000, 1)}k`;
  return trimNumber(value, 0);
}

export function convert(kg: number, unit: WeightUnit) {
  return Number(fromKilograms(kg, unit).toFixed(1));
}

export function formatPair(weight: number | null, unit: string | null, reps: number | null) {
  if (weight == null && reps == null) return "Not logged";
  if (weight == null) return `${reps} reps`;
  return `${trimNumber(weight, 2)} ${unit ?? ""} × ${reps ?? "?"}`.replace("  ", " ");
}

export function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

export function formatWhen(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
}

export function formatDuration(seconds: number | null) {
  if (seconds == null) return "Not finished";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function plural(count: number, word: string, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Try again.") {
  return error instanceof Error && error.message ? error.message : fallback;
}
