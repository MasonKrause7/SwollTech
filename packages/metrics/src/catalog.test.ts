import { describe, expect, it } from "vitest";
import { EQUIPMENT, guessExercise, MUSCLES } from "./catalog";

describe("custom exercise guesses", () => {
  it("guesses muscle and equipment from the name", () => {
    expect(guessExercise("Cable Hammer Curl")).toEqual({ muscle: "biceps", equipment: "cable" });
    expect(guessExercise("Seated Leg Curl")).toEqual({ muscle: "hamstrings", equipment: "machine" });
    expect(guessExercise("Decline Crunch")).toEqual({ muscle: "core", equipment: "bodyweight" });
    expect(guessExercise("Smith Machine Calf Raise")).toEqual({ muscle: "calves", equipment: "machine" });
    expect(guessExercise("DB Incline Press").equipment).toBe("dumbbell");
    expect(guessExercise("Snatch")).toEqual({ muscle: null, equipment: null });
  });

  it("only guesses words from the shared lists", () => {
    for (const name of ["Cable Fly", "Kettlebell Swing", "Band Pull-Apart", "Trap Bar Deadlift", "Glute Bridge"]) {
      const guess = guessExercise(name);
      if (guess.muscle) expect(MUSCLES).toContain(guess.muscle);
      if (guess.equipment) expect(EQUIPMENT).toContain(guess.equipment);
    }
  });
});
