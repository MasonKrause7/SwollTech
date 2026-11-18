/**
 * The muscle and equipment words the exercise catalog uses (apps/api/migrations 0001 and
 * 0002). Custom exercises pick from the same lists so they land in the right bar of the
 * muscle split. Matches the lists on the web Exercises page.
 */
export const MUSCLES = ["chest", "back", "shoulders", "quads", "hamstrings", "glutes", "biceps", "triceps", "calves", "core", "other"] as const;
export const EQUIPMENT = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "other"] as const;

export type Muscle = (typeof MUSCLES)[number];
export type Equipment = (typeof EQUIPMENT)[number];

const MUSCLE_HINTS: [RegExp, Muscle][] = [
  [/\b(ab|abs|crunch|plank|sit-?up|leg raise|knee raise|rollout|pallof|woodchop|oblique|core|hollow|v-?up|toes to bar)\b/, "core"],
  [/\b(calf|calves)\b/, "calves"],
  [/\b(curl)\b/, "biceps"],
  [/\b(leg curl|hamstring|nordic|rdl|romanian|stiff-?leg|good morning)\b/, "hamstrings"],
  [/\b(triceps?|pushdown|skull|kickback|extension)\b/, "triceps"],
  [/\b(glute|hip thrust|bridge|kickback|abduct)\b/, "glutes"],
  [/\b(squat|lunge|leg press|leg extension|step-?up|split squat)\b/, "quads"],
  [/\b(bench|chest|fly|flye|pec|push-?up|dip)\b/, "chest"],
  [/\b(row|pull-?up|chin-?up|pulldown|lat|deadlift|shrug|back)\b/, "back"],
  [/\b(press|raise|delt|shoulder|face pull|upright)\b/, "shoulders"],
];

const EQUIPMENT_HINTS: [RegExp, Equipment][] = [
  [/\b(dumbbell|db)\b/, "dumbbell"],
  [/\b(kettlebell|kb)\b/, "kettlebell"],
  [/\b(cable|rope|pulldown|pushdown)\b/, "cable"],
  [/\b(machine|smith|pec deck|leg press|hack|leg curl|leg extension)\b/, "machine"],
  [/\b(band|banded)\b/, "band"],
  [/\b(barbell|bb|ez-?bar|trap bar)\b/, "barbell"],
  [/\b(push-?up|pull-?up|chin-?up|dip|plank|sit-?up|crunch|bodyweight)\b/, "bodyweight"],
];

/**
 * A first guess at a new exercise's muscle and equipment from its name, so creating
 * "Cable Hammer Curl" pre-selects biceps and cable. The lifter can change both.
 * Leg curl is checked before plain curl and calf before everything else.
 */
export function guessExercise(name: string): { muscle: Muscle | null; equipment: Equipment | null } {
  const text = name.toLowerCase();
  const leg = /\bleg curl\b/.test(text);
  const muscle = leg ? "hamstrings" : (MUSCLE_HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? null);
  const equipment = EQUIPMENT_HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  return { muscle, equipment };
}
