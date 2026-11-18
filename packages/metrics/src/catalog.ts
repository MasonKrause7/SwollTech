/**
 * The muscle and equipment words the exercise catalog uses (apps/api/migrations 0001 and
 * 0002). Custom exercises pick from the same lists so they land in the right bar of the
 * muscle split. Matches the lists on the web Exercises page.
 */
export const MUSCLES = ["chest", "back", "shoulders", "quads", "hamstrings", "glutes", "biceps", "triceps", "calves", "core", "other"] as const;
export const EQUIPMENT = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "other"] as const;

export type Muscle = (typeof MUSCLES)[number];
export type Equipment = (typeof EQUIPMENT)[number];
