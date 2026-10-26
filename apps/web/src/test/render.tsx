import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";
import type { ApiClient, Profile, Session, SessionSet } from "@swolltech/api-client";
import { AuthContext, type AuthValue } from "../auth";

export function fakeApi(overrides: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  const profile: Profile = { id: "u1", display_name: "Mason", unit_preference: "lb", updated_at: "2026-10-01T00:00:00Z" };
  const base: Partial<Record<keyof ApiClient, unknown>> = {
    me: vi.fn(async () => profile),
    overview: vi.fn(async () => emptyOverview()),
    workouts: vi.fn(async () => []),
    sessions: vi.fn(async () => []),
    exercises: vi.fn(async () => []),
  };
  return new Proxy({ ...base, ...overrides } as ApiClient, {
    get(target, key: string) {
      if (key in target) return target[key as keyof ApiClient];
      return vi.fn(async () => {
        throw new Error(`Unexpected API call: ${key}`);
      });
    },
  });
}

export function emptyOverview() {
  return {
    totals: {
      sessions: 0,
      sets: 0,
      volume_kg: 0,
      this_week_sessions: 0,
      this_week_volume_kg: 0,
      last_week_volume_kg: 0,
      current_streak_weeks: 0,
      longest_streak_weeks: 0,
      records: 0,
    },
    weekly: [],
    calendar: [],
    muscle_split: [],
    recent_records: [],
    exercises: [],
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

export function renderPage(
  element: ReactElement,
  { api = fakeApi(), path = "/", route = "/", auth = {} }: { api?: ApiClient; path?: string; route?: string; auth?: Partial<AuthValue> } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const value: AuthValue = {
    signedIn: true,
    ready: true,
    email: "mason@example.com",
    recovering: false,
    api,
    signInWithPassword: vi.fn(async () => null),
    signUp: vi.fn(async () => ({ error: null, needsConfirmation: true })),
    requestReset: vi.fn(async () => null),
    updatePassword: vi.fn(async () => null),
    devSignIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    ...auth,
  };
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={element} />
            <Route path="*" element={<div>Elsewhere</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { ...utils, api, auth: value, queryClient };
}

let counter = 0;
export function makeSet(overrides: Partial<SessionSet> = {}): SessionSet {
  counter += 1;
  return {
    id: `set-${counter}`,
    position: counter,
    kind: "working",
    target_reps: null,
    target_weight: null,
    target_unit: null,
    target_percent: null,
    target_rpe: null,
    rest_seconds: 90,
    actual_reps: null,
    actual_weight: null,
    actual_unit: null,
    weight_kg: null,
    rpe: null,
    notes: "",
    skipped: false,
    completed_at: null,
    updated_at: "2026-10-25T12:00:00Z",
    ...overrides,
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    workout_id: "w1",
    name: "Push day",
    status: "in_progress",
    started_at: "2026-10-25T12:00:00Z",
    ended_at: null,
    notes: "",
    updated_at: "2026-10-25T12:00:00Z",
    exercises: [],
    ...overrides,
  };
}
