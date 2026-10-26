export type WeightUnit = "lb" | "kg";
export type SetKind = "warmup" | "working";
export type SessionStatus = "in_progress" | "completed" | "abandoned";
export type MediaStatus = "local" | "uploading" | "ready" | "failed";

export interface Profile {
  id: string;
  display_name: string;
  unit_preference: WeightUnit;
  updated_at: string;
}

export interface Exercise {
  id: string;
  owner_id: string | null;
  name: string;
  primary_muscle: string;
  equipment: string;
  updated_at: string;
}

export interface WorkoutSet {
  id: string;
  position: number;
  kind: SetKind;
  target_reps: number | null;
  target_weight: number | null;
  target_unit: WeightUnit | null;
  target_percent: number | null;
  target_rpe: number | null;
  rest_seconds: number;
  updated_at: string;
}

export interface WorkoutExercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
  notes: string;
  updated_at: string;
  sets: WorkoutSet[];
}

export interface WorkoutSummary {
  id: string;
  name: string;
  notes: string;
  archived_at: string | null;
  updated_at: string;
}

export interface Workout extends WorkoutSummary {
  exercises: WorkoutExercise[];
}

export interface SessionSet {
  id: string;
  position: number;
  kind: SetKind;
  target_reps: number | null;
  target_weight: number | null;
  target_unit: WeightUnit | null;
  target_percent: number | null;
  target_rpe: number | null;
  rest_seconds: number;
  actual_reps: number | null;
  actual_weight: number | null;
  actual_unit: WeightUnit | null;
  weight_kg: number | null;
  rpe: number | null;
  notes: string;
  skipped: boolean;
  completed_at: string | null;
  updated_at: string;
}

export interface SessionExercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  position: number;
  notes: string;
  updated_at: string;
  sets: SessionSet[];
  previous_sets: SessionSet[];
}

export interface SessionSummary {
  id: string;
  workout_id: string | null;
  name: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  notes: string;
  updated_at: string;
}

export interface Session extends SessionSummary {
  exercises: SessionExercise[];
}

export interface ProgressPoint {
  session_id: string;
  started_at: string;
  best_e1rm_kg: number | null;
  volume_kg: number;
  top_set_weight_kg: number | null;
  top_set_percent: number | null;
}

export interface Progress {
  exercise_id: string;
  reference_kg: number | null;
  reference_source: string;
  points: ProgressPoint[];
}

export interface Media {
  id: string;
  session_set_id: string;
  content_type: string | null;
  byte_size: number | null;
  duration_seconds: number | null;
  status: MediaStatus;
  playback_url: string | null;
  updated_at: string;
}

export interface StatsTotals {
  sessions: number;
  sets: number;
  volume_kg: number;
  this_week_sessions: number;
  this_week_volume_kg: number;
  last_week_volume_kg: number;
  current_streak_weeks: number;
  longest_streak_weeks: number;
  records: number;
}

export interface WeeklyStat {
  week_start: string;
  sessions: number;
  sets: number;
  volume_kg: number;
}

export interface CalendarDay {
  day: string;
  sessions: number;
}

export interface MuscleStat {
  muscle: string;
  sets: number;
  volume_kg: number;
}

export interface PersonalRecord {
  exercise_id: string;
  exercise_name: string;
  session_id: string;
  achieved_at: string;
  e1rm_kg: number;
  previous_e1rm_kg: number;
  weight_kg: number;
  reps: number;
}

export interface ExerciseStat {
  exercise_id: string;
  exercise_name: string;
  muscle: string;
  sessions: number;
  best_e1rm_kg: number | null;
  last_performed_at: string;
}

export interface Overview {
  totals: StatsTotals;
  weekly: WeeklyStat[];
  calendar: CalendarDay[];
  muscle_split: MuscleStat[];
  recent_records: PersonalRecord[];
  exercises: ExerciseStat[];
}

export interface SessionReport {
  session_id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  sets: number;
  volume_kg: number;
  exercises: {
    exercise_id: string;
    exercise_name: string;
    sets: number;
    best_e1rm_kg: number;
    top_weight_kg: number;
    top_reps: number;
  }[];
  records: PersonalRecord[];
}

export interface Reference {
  id: string;
  exercise_id: string;
  weight: number;
  unit: WeightUnit;
  weight_kg: number;
  noted_on: string;
  updated_at: string;
}

export interface SyncMutation {
  client_mutation_id: string;
  entity: string;
  op: "upsert" | "delete";
  entity_id: string;
  base_updated_at: string | null;
  payload: Record<string, unknown>;
}

export interface SyncResult {
  cursor: number;
  applied: { client_mutation_id: string; status: string; detail?: string | null; server_row?: Record<string, unknown> | null }[];
  changes: { id: number; entity: string; entity_id: string; op: string; row: Record<string, unknown> | null }[];
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, detail: string, body: unknown) {
    super(detail);
    this.status = status;
    this.body = body;
  }
}

export interface ClientOptions {
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  /** Called once per 401 so the app can sign the user out. */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
}

function query(params: Record<string, string | undefined | null>) {
  const entries = Object.entries(params).filter((pair): pair is [string, string] => Boolean(pair[1]));
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

export function createClient(options: ClientOptions) {
  const base = options.baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const token = await options.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const doFetch = options.fetch ?? fetch;
    const response = await doFetch(`${base}${path}`, { ...init, headers });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && token) options.onUnauthorized?.();
    if (!response.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
      throw new ApiError(response.status, detail, body);
    }
    return body as T;
  }

  return {
    request,
    me: () => request<Profile>("/v1/me"),
    updateMe: (body: Partial<Pick<Profile, "display_name" | "unit_preference">>) =>
      request<Profile>("/v1/me", { method: "PATCH", body: JSON.stringify(body) }),
    deleteMe: () => request<void>("/v1/me", { method: "DELETE" }),
    devToken: (email: string, displayName = "") =>
      request<{ access_token: string; user_id: string; email: string }>("/v1/dev/token", {
        method: "POST",
        body: JSON.stringify({ email, display_name: displayName }),
      }),
    catalog: () => request<{ version: number; exercises: Exercise[] }>("/v1/catalog"),
    exercises: (q?: string) => request<Exercise[]>(`/v1/exercises${query({ q })}`),
    createExercise: (body: { name: string; primary_muscle?: string; equipment?: string }) =>
      request<Exercise>("/v1/exercises", { method: "POST", body: JSON.stringify(body) }),
    progress: (exerciseId: string) => request<Progress>(`/v1/exercises/${exerciseId}/progress`),
    updateExercise: (id: string, body: { name?: string; primary_muscle?: string; equipment?: string }) =>
      request<Exercise>(`/v1/exercises/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteExercise: (id: string) => request<void>(`/v1/exercises/${id}`, { method: "DELETE" }),
    reference: (exerciseId: string) => request<Reference>(`/v1/exercises/${exerciseId}/reference`),
    putReference: (exerciseId: string, body: { weight: number; unit: WeightUnit; noted_on: string }) =>
      request<Reference>(`/v1/exercises/${exerciseId}/reference`, { method: "PUT", body: JSON.stringify(body) }),
    deleteReference: (exerciseId: string) => request<void>(`/v1/exercises/${exerciseId}/reference`, { method: "DELETE" }),
    overview: (tz?: string) => request<Overview>(`/v1/stats/overview${query({ tz })}`),
    workouts: () => request<WorkoutSummary[]>("/v1/workouts"),
    workout: (id: string) => request<Workout>(`/v1/workouts/${id}`),
    createWorkout: (body: { name: string; notes?: string }) =>
      request<WorkoutSummary>("/v1/workouts", { method: "POST", body: JSON.stringify(body) }),
    updateWorkout: (id: string, body: { name?: string; notes?: string; archived?: boolean }) =>
      request<Workout>(`/v1/workouts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteWorkout: (id: string) => request<void>(`/v1/workouts/${id}`, { method: "DELETE" }),
    addWorkoutExercise: (workoutId: string, exerciseId: string) =>
      request<Workout>(`/v1/workouts/${workoutId}/exercises`, {
        method: "POST",
        body: JSON.stringify({ exercise_id: exerciseId }),
      }),
    reorderWorkout: (workoutId: string, ids: string[]) =>
      request<Workout>(`/v1/workouts/${workoutId}/reorder`, { method: "POST", body: JSON.stringify({ ids }) }),
    updateWorkoutExercise: (id: string, body: { notes?: string }) =>
      request<{ notes?: string }>(`/v1/workout-exercises/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteWorkoutExercise: (id: string) => request<void>(`/v1/workout-exercises/${id}`, { method: "DELETE" }),
    addWorkoutSet: (itemId: string, body: Record<string, unknown>) =>
      request<WorkoutSet>(`/v1/workout-exercises/${itemId}/sets`, { method: "POST", body: JSON.stringify(body) }),
    updateWorkoutSet: (id: string, body: Record<string, unknown>) =>
      request<WorkoutSet>(`/v1/workout-sets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteWorkoutSet: (id: string) => request<void>(`/v1/workout-sets/${id}`, { method: "DELETE" }),
    sessions: (status?: SessionStatus) =>
      request<SessionSummary[]>(`/v1/sessions${query({ status })}`),
    session: (id: string) => request<Session>(`/v1/sessions/${id}`),
    sessionSummary: (id: string) => request<SessionReport>(`/v1/sessions/${id}/summary`),
    deleteSession: (id: string) => request<void>(`/v1/sessions/${id}`, { method: "DELETE" }),
    startSession: (workoutId: string | null) =>
      request<Session>("/v1/sessions", { method: "POST", body: JSON.stringify({ workout_id: workoutId }) }),
    updateSession: (id: string, body: { status?: SessionStatus; notes?: string; name?: string }) =>
      request<Session>(`/v1/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    addSessionExercise: (sessionId: string, exerciseId: string) =>
      request<Session>(`/v1/sessions/${sessionId}/exercises`, {
        method: "POST",
        body: JSON.stringify({ exercise_id: exerciseId }),
      }),
    deleteSessionExercise: (id: string) => request<void>(`/v1/session-exercises/${id}`, { method: "DELETE" }),
    addSessionSet: (itemId: string, body: Record<string, unknown>) =>
      request<SessionSet>(`/v1/session-exercises/${itemId}/sets`, { method: "POST", body: JSON.stringify(body) }),
    updateSessionSet: (id: string, body: Record<string, unknown>) =>
      request<SessionSet>(`/v1/session-sets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteSessionSet: (id: string) => request<void>(`/v1/session-sets/${id}`, { method: "DELETE" }),
    uploadUrl: (setId: string, body: { content_type: string; byte_size: number }) =>
      request<{ media_id: string; upload_url: string; storage_key: string; headers: Record<string, string> }>(
        `/v1/session-sets/${setId}/media/upload-url`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    confirmMedia: (setId: string) =>
      request<Media>(`/v1/session-sets/${setId}/media/confirm`, { method: "POST", body: JSON.stringify({}) }),
    sync: (body: { cursor: number; mutations: SyncMutation[] }) =>
      request<SyncResult>("/v1/sync", { method: "POST", body: JSON.stringify(body) }),
  };
}

export type ApiClient = ReturnType<typeof createClient>;
