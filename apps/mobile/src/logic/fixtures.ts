import type { LocalData } from "./session";

export const BENCH = "945588d5-76e8-50ff-9b08-5a61982e1c0e";
export const SQUAT = "df00b70c-0d32-5048-8e57-2e8af0f85e22";

export function ids(prefix = "id") {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

export function emptyData(): LocalData {
  return {
    exercises: [
      { id: BENCH, owner_id: null, name: "Bench Press", primary_muscle: "chest", equipment: "barbell" },
      { id: SQUAT, owner_id: null, name: "Back Squat", primary_muscle: "quads", equipment: "barbell" },
    ],
    references: [],
    workouts: [],
    workoutExercises: [],
    workoutSets: [],
    sessions: [],
    sessionExercises: [],
    sessionSets: [],
  };
}
