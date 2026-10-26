import { fromKilograms } from "@swolltech/metrics";
import type { Unit } from "./logic/rows";

export function trim(value: number, digits = 1) {
  return Number(value.toFixed(digits)).toString();
}

export function weight(kg: number | null | undefined, unit: Unit, digits = 1) {
  if (kg == null) return "None yet";
  return `${trim(fromKilograms(kg, unit), digits)} ${unit}`;
}

/** Big volumes read better as 12.4k. */
export function volume(kg: number, unit: Unit) {
  const value = fromKilograms(kg, unit);
  if (value >= 10000) return `${trim(value / 1000, 1)}k ${unit}`;
  return `${Math.round(value).toLocaleString("en-US")} ${unit}`;
}

export function pair(weightValue: number | null, unit: string | null, reps: number | null) {
  if (weightValue == null || reps == null) return "Not logged";
  return `${trim(Number(weightValue), 2)} ${unit ?? ""} × ${reps}`.replace("  ", " ");
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dayAndTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function duration(seconds: number | null) {
  if (seconds == null) return "Not finished";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}
