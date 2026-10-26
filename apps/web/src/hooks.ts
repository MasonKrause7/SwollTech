import { useQuery } from "@tanstack/react-query";
import { useApi } from "./auth";
import { timeZone, type WeightUnit } from "./format";

export const keys = {
  me: ["me"] as const,
  overview: ["overview"] as const,
  workouts: ["workouts"] as const,
  workout: (id: string) => ["workout", id] as const,
  exercises: ["exercises"] as const,
  sessions: (status?: string) => ["sessions", status ?? "all"] as const,
  session: (id: string) => ["session", id] as const,
  summary: (id: string) => ["summary", id] as const,
  progress: (id: string) => ["progress", id] as const,
  reference: (id: string) => ["reference", id] as const,
};

export function useProfile() {
  const api = useApi();
  return useQuery({ queryKey: keys.me, queryFn: () => api.me(), staleTime: 60_000 });
}

export function useUnit(): WeightUnit {
  return useProfile().data?.unit_preference ?? "lb";
}

export function useOverview() {
  const api = useApi();
  return useQuery({ queryKey: keys.overview, queryFn: () => api.overview(timeZone()) });
}

export function useExercises() {
  const api = useApi();
  return useQuery({ queryKey: keys.exercises, queryFn: () => api.exercises(), staleTime: 5 * 60_000 });
}
