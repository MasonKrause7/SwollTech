/**
 * One-tap starter programs. Copying one writes ordinary routines (workouts,
 * workout_exercises, workout_sets) into the user's own notebook, exactly like
 * writing them by hand in the workout editor, so they can edit anything after.
 *
 * Exercise ids are catalog ids from apps/api/migrations (0001 and 0002). Lifts added
 * in 0002 name a 0001 alternate where there is a sensible one, so a phone that has not
 * refreshed its catalog yet (or a server without 0002) still gets a complete program.
 * A lift with no alternate is left out rather than referencing a missing exercise.
 *
 * Rest: 120 s on main lifts, 90 s on accessories, never 0.
 * No weights are filled in: the lifter enters them on the first session and the app
 * carries them forward. 5/3/1 uses percent targets against the training max.
 */
import { byPosition, type ExerciseRow, type Unit, type WorkoutExerciseRow, type WorkoutRow, type WorkoutSetRow } from "./rows";
import { newPlannedSet, newWorkout, newWorkoutExercise, validateWorkoutName } from "./workouts";

export const MAIN_REST = 120;
export const ACCESSORY_REST = 90;

/** Catalog ids. From 0001 unless marked. */
export const LIFT = {
  BACK_SQUAT: "df00b70c-0d32-5048-8e57-2e8af0f85e22",
  FRONT_SQUAT: "32c7634a-8411-51a4-bd4e-e63f0a9d60ff",
  BENCH_PRESS: "945588d5-76e8-50ff-9b08-5a61982e1c0e",
  OVERHEAD_PRESS: "bb712dc6-743e-5af1-a235-0bc8818124fa",
  DEADLIFT: "6e444f8d-53f2-55ea-9fa0-1ad012e77515",
  ROMANIAN_DEADLIFT: "816ce516-5aec-5beb-bdb8-ad4ef85e1a0a",
  BARBELL_ROW: "a0ce1f6e-ee09-5dd7-92d2-a99309b7f346",
  PULL_UP: "2d5ba6a3-e11b-58d5-9c26-b418374db481",
  LAT_PULLDOWN: "f09cf825-db6a-5030-876e-58024d3b0dfd",
  SEATED_CABLE_ROW: "10a30faa-4b41-59a9-b188-f4cf8fb858b7",
  DUMBBELL_ROW: "ffd8fd40-d7b7-5ed8-952a-8a176eb31cfa",
  INCLINE_DUMBBELL_PRESS: "70aed009-1ab7-5a46-a758-23a77cdeb9c4",
  LATERAL_RAISE: "a0fb58da-50da-595b-b34b-8c74e16f0ac2",
  FACE_PULL: "f940b1dd-2963-5132-8d70-96cd9f4bd80e",
  TRICEPS_PUSHDOWN: "551e548d-f7c2-5ab6-8477-cc0b6e03d34e",
  OVERHEAD_TRICEPS_EXTENSION: "14298dc6-2b5e-5fc0-a85a-bbe783ade8a7",
  BARBELL_CURL: "638ef811-524f-5e95-b348-7230fa1f9dfe",
  HAMMER_CURL: "219efc97-baa1-5de7-a0ac-ffb5a907e895",
  LEG_PRESS: "080eb8e0-d28b-5833-80e4-22dd9b4c968a",
  LEG_CURL: "4d059840-e1de-5350-a35a-8e9b3902417f",
  LEG_EXTENSION: "f7760e13-212f-56ff-b583-f01c3b458a82",
  BULGARIAN_SPLIT_SQUAT: "326185f6-d401-521a-93f1-0181f58e930b",
  HIP_THRUST: "33895d4b-1837-5e47-a5c0-e06dfa713c56",
  CALF_RAISE: "080d8286-b718-5cfe-bb94-f0827c919856",
  CLOSE_GRIP_BENCH_PRESS: "2e2dcd49-9d32-5bb4-a683-f2a935d45608",
  // Added in 0002.
  CHIN_UP: "d1683792-eb3d-5e2c-a90f-c28e5aa38cb6",
  DUMBBELL_CURL: "bc0578e4-e188-59ae-95d7-b02840512a3c",
  SEATED_CALF_RAISE: "80f5ece7-e0bc-502a-8653-aecaed802d46",
  HANGING_LEG_RAISE: "6c01b654-7237-5947-920b-8a028026d8ec",
  CABLE_CRUNCH: "a6a1d3b9-7a37-5f2c-81a1-671b51480d67",
  AB_WHEEL_ROLLOUT: "1de6dbd4-c0b5-5f5e-816d-d5b62c9862ab",
} as const;

export interface TemplateBlock {
  /** How many identical sets. */
  count: number;
  reps: number;
  /** Percent of training max, for programs that use it. */
  percent?: number;
  restSeconds: number;
}

export interface TemplateExercise {
  exerciseId: string;
  /** Used instead, in order, when the phone's catalog does not have exerciseId. */
  alternates?: string[];
  blocks: TemplateBlock[];
}

export interface TemplateWorkout {
  name: string;
  exercises: TemplateExercise[];
}

export interface ProgramTemplate {
  id: string;
  name: string;
  /** One line for the picker. */
  summary: string;
  daysPerWeek: number;
  workouts: TemplateWorkout[];
}

const main = (exerciseId: string, count: number, reps: number, alternates?: string[]): TemplateExercise => ({
  exerciseId,
  alternates,
  blocks: [{ count, reps, restSeconds: MAIN_REST }],
});
const accessory = (exerciseId: string, count: number, reps: number, alternates?: string[]): TemplateExercise => ({
  exerciseId,
  alternates,
  blocks: [{ count, reps, restSeconds: ACCESSORY_REST }],
});
/** 5/3/1 week one (5s week) on the training max, then Boring But Big 5 x 10 at 50%. */
const fiveThreeOne = (exerciseId: string): TemplateExercise[] => [
  {
    exerciseId,
    blocks: [
      { count: 1, reps: 5, percent: 65, restSeconds: MAIN_REST },
      { count: 1, reps: 5, percent: 75, restSeconds: MAIN_REST },
      { count: 1, reps: 5, percent: 85, restSeconds: MAIN_REST },
    ],
  },
  { exerciseId, blocks: [{ count: 5, reps: 10, percent: 50, restSeconds: ACCESSORY_REST }] },
];

export const PROGRAMS: ProgramTemplate[] = [
  {
    id: "upper-lower",
    name: "Upper/Lower",
    summary: "4 days. Heavy compounds plus balanced accessories. A good default for intermediate lifters.",
    daysPerWeek: 4,
    workouts: [
      {
        name: "Upper A",
        exercises: [
          main(LIFT.BENCH_PRESS, 4, 5),
          main(LIFT.BARBELL_ROW, 4, 6),
          accessory(LIFT.OVERHEAD_PRESS, 3, 8),
          accessory(LIFT.LAT_PULLDOWN, 3, 10),
          accessory(LIFT.LATERAL_RAISE, 3, 12),
          accessory(LIFT.TRICEPS_PUSHDOWN, 3, 12),
          accessory(LIFT.BARBELL_CURL, 3, 10),
        ],
      },
      {
        name: "Lower A",
        exercises: [
          main(LIFT.BACK_SQUAT, 4, 5),
          main(LIFT.ROMANIAN_DEADLIFT, 3, 8),
          accessory(LIFT.LEG_PRESS, 3, 10),
          accessory(LIFT.LEG_CURL, 3, 12),
          accessory(LIFT.CALF_RAISE, 4, 12),
          accessory(LIFT.HANGING_LEG_RAISE, 3, 12),
        ],
      },
      {
        name: "Upper B",
        exercises: [
          main(LIFT.OVERHEAD_PRESS, 4, 5),
          main(LIFT.PULL_UP, 4, 6),
          accessory(LIFT.INCLINE_DUMBBELL_PRESS, 3, 10),
          accessory(LIFT.SEATED_CABLE_ROW, 3, 10),
          accessory(LIFT.FACE_PULL, 3, 15),
          accessory(LIFT.HAMMER_CURL, 3, 12),
          accessory(LIFT.OVERHEAD_TRICEPS_EXTENSION, 3, 12),
        ],
      },
      {
        name: "Lower B",
        exercises: [
          main(LIFT.DEADLIFT, 3, 5),
          main(LIFT.FRONT_SQUAT, 3, 6),
          accessory(LIFT.BULGARIAN_SPLIT_SQUAT, 3, 10),
          accessory(LIFT.HIP_THRUST, 3, 10),
          accessory(LIFT.SEATED_CALF_RAISE, 3, 15, [LIFT.CALF_RAISE]),
          accessory(LIFT.CABLE_CRUNCH, 3, 12),
        ],
      },
    ],
  },
  {
    id: "push-pull-legs",
    name: "Push/Pull/Legs",
    summary: "3 days, or 6 if you run it twice a week. Each muscle gets its own day.",
    daysPerWeek: 3,
    workouts: [
      {
        name: "Push",
        exercises: [
          main(LIFT.BENCH_PRESS, 4, 6),
          main(LIFT.OVERHEAD_PRESS, 3, 8),
          accessory(LIFT.INCLINE_DUMBBELL_PRESS, 3, 10),
          accessory(LIFT.LATERAL_RAISE, 4, 15),
          accessory(LIFT.TRICEPS_PUSHDOWN, 3, 12),
          accessory(LIFT.OVERHEAD_TRICEPS_EXTENSION, 3, 12),
        ],
      },
      {
        name: "Pull",
        exercises: [
          main(LIFT.DEADLIFT, 3, 5),
          main(LIFT.PULL_UP, 3, 8),
          accessory(LIFT.BARBELL_ROW, 3, 8),
          accessory(LIFT.FACE_PULL, 3, 15),
          accessory(LIFT.BARBELL_CURL, 3, 10),
          accessory(LIFT.HAMMER_CURL, 3, 12),
        ],
      },
      {
        name: "Legs",
        exercises: [
          main(LIFT.BACK_SQUAT, 4, 6),
          main(LIFT.ROMANIAN_DEADLIFT, 3, 8),
          accessory(LIFT.LEG_PRESS, 3, 12),
          accessory(LIFT.LEG_CURL, 3, 12),
          accessory(LIFT.CALF_RAISE, 4, 12),
          accessory(LIFT.HANGING_LEG_RAISE, 3, 12),
        ],
      },
    ],
  },
  {
    id: "full-body",
    name: "Full Body 3x",
    summary: "3 days a week, every day hits everything. Easy to fit around a busy week.",
    daysPerWeek: 3,
    workouts: [
      {
        name: "Full Body A",
        exercises: [
          main(LIFT.BACK_SQUAT, 3, 5),
          main(LIFT.BENCH_PRESS, 3, 5),
          accessory(LIFT.BARBELL_ROW, 3, 8),
          accessory(LIFT.LATERAL_RAISE, 3, 12),
          accessory(LIFT.CABLE_CRUNCH, 3, 12),
        ],
      },
      {
        name: "Full Body B",
        exercises: [
          main(LIFT.DEADLIFT, 3, 5),
          main(LIFT.OVERHEAD_PRESS, 3, 6),
          accessory(LIFT.CHIN_UP, 3, 8, [LIFT.PULL_UP]),
          accessory(LIFT.LEG_CURL, 3, 12),
          accessory(LIFT.HANGING_LEG_RAISE, 3, 10),
        ],
      },
      {
        name: "Full Body C",
        exercises: [
          main(LIFT.FRONT_SQUAT, 3, 6),
          main(LIFT.INCLINE_DUMBBELL_PRESS, 3, 8),
          accessory(LIFT.SEATED_CABLE_ROW, 3, 10),
          accessory(LIFT.HIP_THRUST, 3, 10),
          accessory(LIFT.DUMBBELL_CURL, 3, 12, [LIFT.HAMMER_CURL]),
        ],
      },
    ],
  },
  {
    id: "531-big-4",
    name: "5/3/1 Big 4",
    summary: "4 days, one main lift each, on percentages of your training max. Set a training max on each lift first.",
    daysPerWeek: 4,
    workouts: [
      { name: "5/3/1 Squat", exercises: [...fiveThreeOne(LIFT.BACK_SQUAT), accessory(LIFT.LEG_CURL, 3, 10), accessory(LIFT.HANGING_LEG_RAISE, 3, 10)] },
      { name: "5/3/1 Bench", exercises: [...fiveThreeOne(LIFT.BENCH_PRESS), accessory(LIFT.DUMBBELL_ROW, 3, 10), accessory(LIFT.TRICEPS_PUSHDOWN, 3, 12)] },
      { name: "5/3/1 Deadlift", exercises: [...fiveThreeOne(LIFT.DEADLIFT), accessory(LIFT.BULGARIAN_SPLIT_SQUAT, 3, 10), accessory(LIFT.AB_WHEEL_ROLLOUT, 3, 10)] },
      {
        name: "5/3/1 Press",
        exercises: [...fiveThreeOne(LIFT.OVERHEAD_PRESS), accessory(LIFT.CHIN_UP, 3, 8, [LIFT.PULL_UP]), accessory(LIFT.LATERAL_RAISE, 3, 15)],
      },
    ],
  },
  {
    id: "beginner-3x5",
    name: "Beginner Strength 3x5",
    summary: "3 days, alternating A and B. Add a little weight every session while it keeps moving.",
    daysPerWeek: 3,
    workouts: [
      { name: "Strength A", exercises: [main(LIFT.BACK_SQUAT, 3, 5), main(LIFT.BENCH_PRESS, 3, 5), main(LIFT.BARBELL_ROW, 3, 5)] },
      { name: "Strength B", exercises: [main(LIFT.BACK_SQUAT, 3, 5), main(LIFT.OVERHEAD_PRESS, 3, 5), main(LIFT.DEADLIFT, 1, 5)] },
    ],
  },
];

export interface ProgramRows {
  workouts: WorkoutRow[];
  workoutExercises: WorkoutExerciseRow[];
  workoutSets: WorkoutSetRow[];
  /** Template lifts left out because this phone's catalog does not have them or an alternate. */
  skipped: number;
}

/** "Upper A", or "Upper A (2)" when you already have an Upper A. */
export function uniqueWorkoutName(name: string, existing: WorkoutRow[]): string {
  if (!validateWorkoutName(name, existing)) return name;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${name} (${n})`;
    if (!validateWorkoutName(candidate, existing)) return candidate;
  }
  return `${name} ${Date.now()}`;
}

/**
 * The rows that copy a program into the user's routines, in the order to save them
 * (workouts, then their exercises, then their sets).
 */
export function buildProgramRows(
  program: ProgramTemplate,
  catalog: Pick<ExerciseRow, "id" | "deleted_at">[],
  existingWorkouts: WorkoutRow[],
  newId: () => string,
  unit: Unit,
): ProgramRows {
  const available = new Set(catalog.filter((row) => !row.deleted_at).map((row) => row.id));
  const taken = [...existingWorkouts];
  const rows: ProgramRows = { workouts: [], workoutExercises: [], workoutSets: [], skipped: 0 };
  for (const template of program.workouts) {
    const workout = { ...newWorkout(newId(), uniqueWorkoutName(template.name, taken)), notes: `From the ${program.name} program.` };
    taken.push(workout);
    rows.workouts.push(workout);
    const items: WorkoutExerciseRow[] = [];
    for (const exercise of template.exercises) {
      const exerciseId = [exercise.exerciseId, ...(exercise.alternates ?? [])].find((id) => available.has(id));
      if (!exerciseId) {
        rows.skipped += 1;
        continue;
      }
      const item = newWorkoutExercise(newId(), workout.id, exerciseId, items);
      items.push(item);
      const sets: WorkoutSetRow[] = [];
      for (const block of exercise.blocks) {
        for (let i = 0; i < block.count; i += 1) {
          sets.push(
            newPlannedSet(
              newId(),
              item.id,
              { kind: "working", reps: block.reps, weight: null, percent: block.percent ?? null, unit, restSeconds: block.restSeconds },
              sets,
            ),
          );
        }
      }
      rows.workoutSets.push(...byPosition(sets));
    }
    rows.workoutExercises.push(...items);
  }
  return rows;
}
